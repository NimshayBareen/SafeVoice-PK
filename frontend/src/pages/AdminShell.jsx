import { NavLink, Routes, Route } from 'react-router-dom';
import { api, openFile } from '../api.js';
import { Alert, Modal, StatusPill, useLoad } from '../components/ui.jsx';
import { useState } from 'react';
import KnowledgeBase from './KnowledgeBase.jsx';
import { useLang } from '../i18n.jsx';

export default function AdminShell() {
  return (
    <div className="container page">
      <div className="page-head"><div><p className="eyebrow">Administration</p><h1>Admin panel</h1></div></div>
      <nav className="subnav">
        <NavLink to="/admin" end>Overview</NavLink>
        <NavLink to="/admin/lawyers">Lawyer verification</NavLink>
        <NavLink to="/admin/kb">Knowledge base</NavLink>
        <NavLink to="/admin/audit">Audit log</NavLink>
        <NavLink to="/admin/reports">Misuse reports</NavLink>
        <NavLink to="/admin/users">Accounts</NavLink>
      </nav>
      <Routes>
        <Route index element={<Overview />} />
        <Route path="lawyers" element={<LawyerQueue />} />
        <Route path="kb" element={<KnowledgeBase />} />
        <Route path="audit" element={<Audit />} />
        <Route path="reports" element={<Reports />} />
        <Route path="users" element={<Users />} />
      </Routes>
    </div>
  );
}

function Overview() {
  const { data, error } = useLoad(() => api('/admin/stats'), []);
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <p>Loading…</p>;
  const n = (arr, k, v) => (arr.find((x) => x[k] === v) || { n: 0 }).n;
  const cards = [
    ['Victim accounts', n(data.users, 'role', 'VICTIM')], ['Advocate accounts', n(data.users, 'role', 'LAWYER')],
    ['Lawyers waiting for verification', n(data.lawyers, 'verification_status', 'PENDING_VERIFICATION')], ['Verified lawyers', n(data.lawyers, 'verification_status', 'VERIFIED')],
    ['Cases', data.cases], ['Evidence items', data.evidence],
    ['Representation requests accepted', n(data.requests, 'status', 'ACCEPTED')], ['Open misuse reports', data.open_reports], ['Audit log entries', data.audit_entries],
  ];
  return <div className="grid3">{cards.map(([l, v]) => <article className="card stat" key={l}><div className="stat-n">{v}</div><div className="muted">{l}</div></article>)}</div>;
}

// UC-18 Verify Lawyer Credentials
function LawyerQueue() {
  const [status, setStatus] = useState('PENDING_VERIFICATION');
  const { data, error, reload } = useLoad(() => api('/admin/lawyers' + (status ? '?status=' + status : '')), [status]);
  const [target, setTarget] = useState(null);
  return (
    <>
      <div className="filters card">
        <label>Show<select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="PENDING_VERIFICATION">Waiting for verification</option><option value="MORE_INFO_REQUIRED">More information requested</option>
          <option value="VERIFIED">Verified</option><option value="REJECTED">Rejected</option><option value="">All</option></select></label>
      </div>
      <Alert>{error}</Alert>
      {data && data.lawyers.length === 0 && <div className="card empty"><p>Nothing here.</p></div>}
      <div className="grid2">
        {data && data.lawyers.map((l) => (
          <article className="card" key={l.lawyer_id}>
            <div className="case-top"><h3>{l.full_name}</h3><StatusPill status={l.verification_status} /></div>
            <p className="small">Bar Council no. <strong>{l.bar_council_no}</strong>{l.bar_council_name ? ' · ' + l.bar_council_name : ''} · {l.city}</p>
            <p className="muted small">{l.email} · {l.languages.join(', ')} · {l.fee_type.replace('_', ' ').toLowerCase()}</p>
            {l.bio && <p className="small">{l.bio}</p>}
            <p className="small"><strong>Documents:</strong> {l.documents.length === 0 ? <span className="muted">none uploaded</span> : l.documents.map((d) => <button key={d.doc_id} className="btn btn-sm btn-ghost" onClick={() => openFile('/admin/lawyer-documents/' + d.doc_id).catch((e) => alert(e.message))}>📄 {d.doc_type.toLowerCase()}: {d.name}</button>)}</p>
            {l.verification_note && <p className="small muted">Last note: {l.verification_note}</p>}
            <button className="btn btn-navy" onClick={() => setTarget(l)}>Review and decide</button>
          </article>
        ))}
      </div>
      {target && <DecisionModal lawyer={target} onClose={() => setTarget(null)} onDone={() => { setTarget(null); reload(); }} />}
    </>
  );
}

function DecisionModal({ lawyer, onClose, onDone }) {
  const [decision, setDecision] = useState('APPROVE');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  async function save() { try { await api(`/admin/lawyers/${lawyer.lawyer_id}/decision`, { method: 'POST', body: { decision, note } }); onDone(); } catch (e) { setErr(e.message); } }
  return (
    <Modal title={'Decision for ' + lawyer.full_name} onClose={onClose}>
      <p className="small">Check the Bar Council number against the Bar Council's own records and compare it with the uploaded licence card before approving.</p>
      <Alert>{err}</Alert>
      <label>Decision<select value={decision} onChange={(e) => setDecision(e.target.value)}><option value="APPROVE">Approve (appears in the directory)</option><option value="MORE_INFO">Ask for more information</option><option value="REJECT">Reject</option></select></label>
      <label>Note for the lawyer{decision === 'APPROVE' ? ' (optional)' : ' (required)'}<textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} /></label>
      <div className="btn-row"><button className="btn btn-gold" onClick={save}>Save decision</button><button className="btn btn-outline" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}

// UC-20 Review Audit Logs
function Audit() {
  const { fmtDate } = useLang();
  const [f, setF] = useState({ actor: '', action: '', from: '', to: '' });
  const [applied, setApplied] = useState(f);
  const [offset, setOffset] = useState(0);
  const qs = (extra = {}) => new URLSearchParams(Object.entries({ ...applied, ...extra }).filter(([, v]) => v !== '' && v !== undefined)).toString();
  const { data, error } = useLoad(() => api('/admin/audit?' + qs({ limit: 50, offset })), [applied, offset]);
  const [chain, setChain] = useState(null);
  const [busy, setBusy] = useState(false);
  async function verify() { setBusy(true); try { setChain(await api('/admin/audit/verify')); } catch (e) { setChain({ error: e.message }); } finally { setBusy(false); } }
  async function exportCsv() {
    const s = JSON.parse(sessionStorage.getItem('sv_session')); const res = await fetch('/api/admin/audit/export.csv?' + qs(), { headers: { Authorization: 'Bearer ' + s.token } });
    const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'audit_log.csv'; a.click();
  }
  return (
    <>
      <form className="filters card" onSubmit={(e) => { e.preventDefault(); setOffset(0); setApplied(f); }}>
        <label>User (email or alias)<input value={f.actor} onChange={(e) => setF({ ...f, actor: e.target.value })} /></label>
        <label>Action<select value={f.action} onChange={(e) => setF({ ...f, action: e.target.value })}><option value="">Any</option>{data && data.actions.map((a) => <option key={a}>{a}</option>)}</select></label>
        <label>From<input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label>To<input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        <button className="btn btn-navy">Filter</button>
        <button type="button" className="btn btn-outline" onClick={exportCsv}>⬇ Export CSV</button>
        <button type="button" className="btn btn-gold" onClick={verify} disabled={busy}>{busy ? '…' : '⛓ Check log integrity'}</button>
      </form>
      {chain && <Alert type={chain.error ? 'error' : chain.valid ? 'ok' : 'error'}>{chain.error || (chain.valid ? `The audit log is intact (${chain.checked} entries checked).` : `The chain is BROKEN at entry #${chain.brokenAtId}.`)}</Alert>}
      <Alert>{error}</Alert>
      <div className="card table-card"><div className="table-wrap"><table>
        <thead><tr><th>#</th><th>Time</th><th>Action</th><th>User</th><th>Object</th><th>IP</th></tr></thead>
        <tbody>{data && data.entries.map((e) => <tr key={e.audit_id}><td>{e.audit_id}</td><td className="nowrap">{fmtDate(e.created_at)}</td><td><code>{e.action}</code></td><td>{e.actor_email || <span className="muted">—</span>}{e.actor_role && <span className="muted small"> ({e.actor_role.toLowerCase()})</span>}</td><td className="small">{e.entity_type}{e.entity_id ? ' ' + String(e.entity_id).slice(0, 8) : ''}</td><td className="small">{e.ip}</td></tr>)}</tbody>
      </table></div>
      {data && <div className="pager"><span className="muted small">{data.total} entries</span>
        <button className="btn btn-sm btn-outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>Newer</button>
        <button className="btn btn-sm btn-outline" disabled={offset + 50 >= data.total} onClick={() => setOffset(offset + 50)}>Older</button></div>}
      </div>
      <p className="muted small">The audit log is append-only: the database refuses any change or deletion, and each row stores the hash of the row before it.</p>
    </>
  );
}

function Reports() {
  const { fmtDate } = useLang();
  const [status, setStatus] = useState('OPEN');
  const { data, error, reload } = useLoad(() => api('/admin/reports' + (status ? '?status=' + status : '')), [status]);
  const [err, setErr] = useState('');
  async function act(id, action) {
    if (action === 'SUSPEND' && !window.confirm('Suspend this account? The user will no longer be able to log in.')) return;
    try { await api(`/admin/reports/${id}/action`, { method: 'POST', body: { action } }); reload(); } catch (e) { setErr(e.message); }
  }
  return (
    <>
      <div className="filters card"><label>Show<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="OPEN">Open</option><option value="ACTION_TAKEN">Action taken</option><option value="DISMISSED">Dismissed</option><option value="">All</option></select></label></div>
      <Alert>{error || err}</Alert>
      {data && data.reports.length === 0 && <div className="card empty"><p>No reports.</p></div>}
      <div className="grid2">{data && data.reports.map((r) => (
        <article className="card" key={r.report_id}>
          <div className="case-top"><h3>{r.reason.replace(/_/g, ' ').toLowerCase()}</h3><StatusPill status={r.status} /></div>
          <p className="small">Reported: <strong>{r.reported_email}</strong> ({r.reported_role.toLowerCase()}, account {r.reported_status.toLowerCase()}) · by {r.reporter_email} ({r.reporter_role.toLowerCase()})</p>
          {r.details && <p className="small">“{r.details}”</p>}
          <p className="muted small">{fmtDate(r.created_at)}{r.action_taken ? ' · action: ' + r.action_taken.toLowerCase() : ''}</p>
          {r.status === 'OPEN' && <div className="btn-row"><button className="btn btn-sm btn-outline" onClick={() => act(r.report_id, 'WARN')}>Warn</button><button className="btn btn-sm btn-danger" onClick={() => act(r.report_id, 'SUSPEND')}>Suspend account</button><button className="btn btn-sm btn-ghost" onClick={() => act(r.report_id, 'DISMISS')}>Dismiss</button></div>}
        </article>))}</div>
    </>
  );
}

function Users() {
  const { fmtDate } = useLang();
  const [role, setRole] = useState(''); const [q, setQ] = useState(''); const [applied, setApplied] = useState({ role: '', q: '' });
  const { data, error, reload } = useLoad(() => api('/admin/users?' + new URLSearchParams(Object.entries(applied).filter(([, v]) => v)).toString()), [applied]);
  const [err, setErr] = useState('');
  async function set(id, status) { try { await api(`/admin/users/${id}/status`, { method: 'POST', body: { status } }); reload(); } catch (e) { setErr(e.message); } }
  return (
    <>
      <form className="filters card" onSubmit={(e) => { e.preventDefault(); setApplied({ role, q }); }}>
        <label>Role<select value={role} onChange={(e) => setRole(e.target.value)}><option value="">All</option><option value="VICTIM">Victim</option><option value="LAWYER">Advocate</option><option value="ADMIN">Administrator</option></select></label>
        <label>Email or alias<input value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button className="btn btn-navy">Search</button>
      </form>
      <Alert>{error || err}</Alert>
      <div className="card table-card"><div className="table-wrap"><table>
        <thead><tr><th>Email</th><th>Role</th><th>Alias</th><th>Status</th><th>Created</th><th>Last login</th><th /></tr></thead>
        <tbody>{data && data.users.map((u) => <tr key={u.user_id}><td>{u.email}</td><td>{u.role.toLowerCase()}</td><td>{u.alias || '—'}</td><td><StatusPill status={u.status} /></td><td className="nowrap">{fmtDate(u.created_at)}</td><td className="nowrap">{u.last_login_at ? fmtDate(u.last_login_at) : '—'}</td>
          <td>{u.role !== 'ADMIN' && (u.status === 'SUSPENDED' ? <button className="btn btn-sm btn-outline" onClick={() => set(u.user_id, 'ACTIVE')}>Reactivate</button> : u.status === 'ACTIVE' && <button className="btn btn-sm btn-ghost" onClick={() => set(u.user_id, 'SUSPENDED')}>Suspend</button>)}</td></tr>)}</tbody>
      </table></div></div>
    </>
  );
}
