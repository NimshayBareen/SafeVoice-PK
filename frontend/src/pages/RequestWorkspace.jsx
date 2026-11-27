import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, saveFile, openFile } from '../api.js';
import { useLang } from '../i18n.jsx';
import { Alert, Modal, Tabs, StatusPill, Pill, useLoad } from '../components/ui.jsx';

// UC-10 consent, UC-11/17 vakalatnama, UC-12 messages, UC-13 tracking, UC-16 review: one workspace for both sides
const STEPS = ['SENT', 'SIGNED_COPY_RECEIVED', 'VERIFIED', 'ORIGINAL_RECEIVED'];

export default function RequestWorkspace({ side }) {
  const { requestId } = useParams();
  const { L, fmtDate } = useLang();
  const { data, error, reload } = useLoad(() => api('/requests/' + requestId), [requestId]);
  const [tab, setTab] = useState('summary');
  const [msg, setMsg] = useState(null);
  const [report, setReport] = useState(false);
  const r = data && data.request;
  const victim = side === 'VICTIM';
  const accepted = r && r.status === 'ACCEPTED';

  async function respond(decision) {
    setMsg(null);
    try { await api(`/requests/${requestId}/respond`, { method: 'POST', body: { decision } }); reload(); }
    catch (e) { setMsg({ type: 'error', text: e.message }); }
  }
  async function withdraw() {
    if (!window.confirm(L('End this representation? The lawyer will lose access to everything you shared.', 'کیا اس نمائندگی کو ختم کریں؟ وکیل کو آپ کے شیئر کیے ہوئے ہر ثبوت تک رسائی ختم ہو جائے گی۔'))) return;
    try { await api(`/requests/${requestId}/withdraw`, { method: 'POST' }); reload(); } catch (e) { setMsg({ type: 'error', text: e.message }); }
  }

  if (error) return <div className="container page"><Alert>{error}</Alert></div>;
  if (!r) return <div className="container page"><p>{L('Loading…', 'لوڈ ہو رہا ہے…')}</p></div>;
  const back = victim ? <Link to="/cases" className="back">← {L('My cases', 'میرے کیسز')}</Link> : <Link to="/lawyer" className="back">← Dashboard</Link>;

  const tabs = [['summary', L('Summary', 'خلاصہ')],
    ['evidence', victim ? L('Share evidence', 'ثبوت شیئر کریں') : 'Shared evidence'],
    ['vakalatnama', L('Vakalatnama', 'وکالت نامہ')], ['messages', L('Messages', 'پیغامات')], ['tracking', L('Case progress', 'کیس کی پیش رفت')]];

  return (
    <div className="container page">
      {back}
      <div className="page-head">
        <div>
          <p className="eyebrow">{L('Case', 'کیس')} {r.caseRef}</p>
          <h1>{victim ? r.lawyer.name : L('Case request', 'کیس کی درخواست')}</h1>
          <p className="muted small">{fmtDate(r.created_at)} · <StatusPill status={r.status} /></p>
        </div>
        <div className="btn-row">
          {!victim && r.status === 'PENDING' && (<><button className="btn btn-gold" onClick={() => respond('ACCEPT')}>Accept</button><button className="btn btn-outline" onClick={() => respond('DECLINE')}>Decline</button></>)}
          {victim && ['PENDING', 'ACCEPTED'].includes(r.status) && <button className="btn btn-outline" onClick={withdraw}>{r.status === 'PENDING' ? L('Withdraw request', 'درخواست واپس لیں') : L('End representation', 'نمائندگی ختم کریں')}</button>}
          {accepted && <button className="btn btn-ghost" onClick={() => setReport(true)}>{L('Report a problem', 'مسئلے کی اطلاع دیں')}</button>}
        </div>
      </div>
      <Alert type={msg && msg.type}>{msg && msg.text}</Alert>
      {r.status === 'DECLINED' && <Alert type="info">{victim ? L('This lawyer declined. You can ask another lawyer; nothing was shared.', 'اس وکیل نے معذرت کر لی۔ آپ کسی اور وکیل سے درخواست کر سکتی/سکتے ہیں؛ کچھ بھی شیئر نہیں ہوا۔') : 'You declined this request. No evidence is accessible.'}</Alert>}
      {r.status === 'WITHDRAWN' && <Alert type="info">{victim ? L('This representation has ended. The lawyer can no longer see anything.', 'یہ نمائندگی ختم ہو چکی ہے۔ وکیل اب کچھ نہیں دیکھ سکتا۔') : 'The client has ended this request. You no longer have access.'}</Alert>}
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === 'summary' && <Summary r={r} victim={victim} />}
      {tab === 'evidence' && <Evidence r={r} victim={victim} reload={reload} />}
      {tab === 'vakalatnama' && <Vakalatnama r={r} victim={victim} reload={reload} />}
      {tab === 'messages' && <Messages r={r} />}
      {tab === 'tracking' && <Tracking r={r} victim={victim} />}
      {report && <ReportModal requestId={requestId} onClose={() => setReport(false)} />}
    </div>
  );
}

function Summary({ r, victim }) {
  const { L } = useLang();
  return (
    <div className="card">
      <h3>{victim ? L('What the lawyer sees', 'وکیل کو کیا نظر آتا ہے') : 'Anonymised summary from the client'}</h3>
      <pre className="summary-box">{r.summary}</pre>
      {!victim && r.status === 'ACCEPTED' && <p className="muted small">You can message the client and see only the evidence they choose to share. Use the tabs above.</p>}
      {!victim && r.status === 'PENDING' && <p className="muted small">Accept the request to start messaging. The client then decides what evidence to share.</p>}
    </div>
  );
}

function Evidence({ r, victim, reload }) {
  const { L, fmtDate } = useLang();
  const [sel, setSel] = useState(() => new Set((r.evidence || []).filter((e) => e.shared).map((e) => e.evidence_id)));
  const [msg, setMsg] = useState(null);
  const [res, setRes] = useState({});
  const [busy, setBusy] = useState('');
  const toggle = (id) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n); };

  if (r.status !== 'ACCEPTED') return <div className="card"><p className="muted">{victim ? L('You can share evidence after the lawyer accepts your request.', 'وکیل کے قبول کرنے کے بعد آپ ثبوت شیئر کر سکتی/سکتے ہیں۔') : 'Evidence is available after you accept the request and the client shares it.'}</p></div>;

  async function saveShares(ids) {
    setBusy('save'); setMsg(null);
    try { await api(`/requests/${r.request_id}/shares`, { method: 'PUT', body: { evidenceIds: ids } }); setSel(new Set(ids)); setMsg({ type: 'ok', text: ids.length ? L('Saved. The lawyer sees only the selected items.', 'محفوظ ہو گیا۔ وکیل کو صرف منتخب آئٹمز نظر آتے ہیں۔') : L('Sharing stopped. The lawyer can no longer see any evidence.', 'شیئرنگ بند ہو گئی۔ وکیل اب کوئی ثبوت نہیں دیکھ سکتا۔') }); reload(); }
    catch (e) { setMsg({ type: 'error', text: e.message + ' ' + L('Access stays suspended until this is applied.', 'جب تک یہ لاگو نہ ہو رسائی معطل رہے گی۔') }); }
    finally { setBusy(''); }
  }
  async function verify(id) {
    setBusy('v' + id);
    try { const x = await api(`/requests/${r.request_id}/evidence/${id}/verify`, { method: 'POST' }); setRes({ ...res, [id]: x.status }); }
    catch (e) { setMsg({ type: 'error', text: e.message }); } finally { setBusy(''); }
  }

  if (victim) {
    return (
      <div className="card">
        <h3>{L('Choose what the lawyer may see', 'منتخب کریں کہ وکیل کیا دیکھ سکتا ہے')}</h3>
        <p className="muted">{L('Nothing is shared by default. Tick only what you want to share. You can change this at any time and the lawyer loses access at once.', 'پہلے سے کچھ بھی شیئر نہیں ہوتا۔ صرف وہی ٹِک کریں جو آپ شیئر کرنا چاہتی/چاہتے ہیں۔ آپ کبھی بھی تبدیل کر سکتی/سکتے ہیں اور وکیل کی رسائی فوراً ختم ہو جاتی ہے۔')}</p>
        <Alert type={msg && msg.type}>{msg && msg.text}</Alert>
        {r.evidence.length === 0 && <p className="muted">{L('Your vault is empty. Add evidence in the Evidence vault tab of your case.', 'آپ کا والٹ خالی ہے۔ کیس کے ثبوت والٹ میں ثبوت شامل کریں۔')}</p>}
        <ul className="share-list">
          {r.evidence.map((e) => (
            <li key={e.evidence_id}>
              <label className="switch-row"><input type="checkbox" checked={sel.has(e.evidence_id)} onChange={() => toggle(e.evidence_id)} />
                <span><strong>{e.original_filename || e.url_value}</strong><span className="muted small"> · {e.evidence_type} · {fmtDate(e.uploaded_at)}</span>{e.description && <span className="muted small"> · {e.description}</span>}</span></label>
            </li>
          ))}
        </ul>
        <div className="btn-row">
          <button className="btn btn-gold" onClick={() => saveShares([...sel])} disabled={!!busy}>{busy === 'save' ? '…' : L('Save sharing choices', 'شیئرنگ کے انتخاب محفوظ کریں')}</button>
          <button className="btn btn-danger" onClick={() => saveShares([])} disabled={!!busy || sel.size === 0}>{L('Stop sharing everything', 'سب کچھ شیئر کرنا بند کریں')}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="card">
      <h3>Evidence shared with you</h3>
      <Alert type={msg && msg.type}>{msg && msg.text}</Alert>
      {r.evidence.length === 0 && <p className="muted">The client has not shared any evidence yet. You can ask in Messages.</p>}
      <div className="table-wrap"><table>
        <thead><tr><th>Item</th><th>Type</th><th>Added</th><th>SHA-256</th><th>Integrity</th><th /></tr></thead>
        <tbody>{r.evidence.map((e) => (
          <tr key={e.evidence_id}>
            <td><strong>{e.original_filename || e.url_value}</strong>{e.description && <div className="muted small">{e.description}</div>}</td>
            <td>{e.evidence_type}</td><td className="nowrap">{fmtDate(e.uploaded_at)}</td>
            <td><code title={e.sha256_hash}>{e.sha256_hash.slice(0, 14)}…</code></td>
            <td>{res[e.evidence_id] ? <Pill kind={res[e.evidence_id]}>{res[e.evidence_id] === 'MATCH' ? '✓ Verified' : res[e.evidence_id] === 'MISMATCH' ? '⚠ ALTERED' : 'Unreadable'}</Pill> : <span className="muted small">Not checked</span>}</td>
            <td className="actions">
              <button className="btn btn-sm btn-outline" onClick={() => verify(e.evidence_id)} disabled={busy === 'v' + e.evidence_id}>Verify</button>
              {e.evidence_type !== 'URL' && <button className="btn btn-sm btn-ghost" onClick={() => saveFile(`/requests/${r.request_id}/evidence/${e.evidence_id}/download`, e.original_filename).catch((x) => setMsg({ type: 'error', text: x.message }))}>Download</button>}
              {e.evidence_type === 'URL' && <a className="btn btn-sm btn-ghost" href={e.url_value} target="_blank" rel="noopener noreferrer">Open link</a>}
            </td>
          </tr>))}</tbody>
      </table></div>
      <p className="muted small">Every view, check and download is recorded in the chain of custody. The client can stop sharing at any time.</p>
    </div>
  );
}

function Vakalatnama({ r, victim, reload }) {
  const { L } = useLang();
  const v = r.vakalatnama;
  const [form, setForm] = useState({ clientName: '', parentage: '', forumText: '' });
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const file = useRef(null);
  const step = v ? STEPS.indexOf(v.status) : -1;
  const names = [L('Draft sent', 'مسودہ تیار'), L('Signed copy received', 'دستخط شدہ نقل موصول'), L('Verified by lawyer', 'وکیل نے تصدیق کی'), L('Original received', 'اصل کاغذ موصول')];

  if (r.status !== 'ACCEPTED') return <div className="card"><p className="muted">{L('The vakalatnama is prepared after the lawyer accepts your request.', 'وکالت نامہ وکیل کے قبول کرنے کے بعد تیار ہوتا ہے۔')}</p></div>;

  const run = async (key, fn) => { setBusy(key); setMsg(null); try { await fn(); reload(); } catch (e) { setMsg({ type: 'error', text: e.message }); } finally { setBusy(''); } };
  const generate = () => run('gen', () => api(`/requests/${r.request_id}/vakalatnama`, { method: 'POST', body: form }));
  const upload = () => run('up', async () => {
    const f = file.current && file.current.files[0]; if (!f) throw new Error(L('Please choose the scanned, signed copy.', 'براہِ کرم دستخط شدہ اسکین منتخب کریں۔'));
    const fd = new FormData(); fd.append('file', f); await api(`/requests/${r.request_id}/vakalatnama/scan`, { method: 'POST', form: fd });
  });
  const decide = (decision) => run('dec', () => api(`/requests/${r.request_id}/vakalatnama/decide`, { method: 'POST', body: { decision, reason } }));
  const original = () => run('orig', () => api(`/requests/${r.request_id}/vakalatnama/original`, { method: 'POST' }));

  return (
    <div className="card">
      <h3>{L('Vakalatnama (authority for the lawyer to act for you)', 'وکالت نامہ (وکیل کو آپ کی طرف سے کام کرنے کا اختیار)')}</h3>
      <Alert type={msg && msg.type}>{msg && msg.text}</Alert>
      {v && (
        <ol className="stepper">
          {names.map((n, i) => <li key={n} className={i < step ? 'done' : i === step ? 'now' : ''}><span className="dot">{i < step ? '✓' : i + 1}</span>{n}</li>)}
        </ol>
      )}
      {v && v.rejection_reason && <Alert type="error">{victim ? L('The lawyer asked for a new signed copy: ', 'وکیل نے نئی دستخط شدہ نقل مانگی ہے: ') : 'You asked for a new copy: '}{v.rejection_reason}</Alert>}

      {victim && !v && (
        <>
          <p className="muted">{L('Enter your name as it appears on your identity document. A PDF draft is made for you to print, sign and upload.', 'اپنا نام وہی لکھیں جو آپ کی شناختی دستاویز پر ہے۔ آپ کے لیے ایک PDF مسودہ بنتا ہے جسے پرنٹ کر کے دستخط کریں اور اپ لوڈ کریں۔')}</p>
          <div className="grid2 tight">
            <label>{L('Full name', 'پورا نام')}<input value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} /></label>
            <label>{L('Father\'s / husband\'s name (optional)', 'والد / شوہر کا نام (اختیاری)')}<input value={form.parentage} onChange={(e) => setForm({ ...form, parentage: e.target.value })} /></label>
            <label>{L('Court or authority (optional)', 'عدالت یا ادارہ (اختیاری)')}<input value={form.forumText} onChange={(e) => setForm({ ...form, forumText: e.target.value })} placeholder="NCCIA Lahore" /></label>
          </div>
          <button className="btn btn-gold" onClick={generate} disabled={!!busy}>{busy === 'gen' ? '…' : L('Prepare the vakalatnama', 'وکالت نامہ تیار کریں')}</button>
        </>
      )}
      {!victim && !v && <p className="muted">The client has not prepared the vakalatnama yet.</p>}

      {v && (
        <div className="btn-row">
          <button className="btn btn-outline" onClick={() => saveFile(`/requests/${r.request_id}/vakalatnama/draft`, 'Vakalatnama.pdf').catch((e) => setMsg({ type: 'error', text: e.message }))}>⬇ {L('Download draft (PDF)', 'مسودہ ڈاؤن لوڈ کریں (PDF)')}</button>
          {v.scan_uploaded_at && <button className="btn btn-outline" onClick={() => openFile(`/requests/${r.request_id}/vakalatnama/scan`).catch((e) => setMsg({ type: 'error', text: e.message }))}>👁 {victim ? L('View my signed copy', 'میری دستخط شدہ نقل دیکھیں') : 'Open the signed copy'}</button>}
        </div>
      )}

      {victim && v && ['SENT', 'SIGNED_COPY_RECEIVED'].includes(v.status) && (
        <div className="upload-row">
          <label>{L('Upload the signed copy (PDF, PNG or JPG)', 'دستخط شدہ نقل اپ لوڈ کریں (PDF، PNG یا JPG)')}<input type="file" ref={file} accept=".pdf,.png,.jpg,.jpeg" /></label>
          <button className="btn btn-gold" onClick={upload} disabled={!!busy}>{busy === 'up' ? '…' : L('Upload', 'اپ لوڈ')}</button>
        </div>
      )}
      {victim && v && v.status === 'VERIFIED' && <p className="muted">{L('Verified. Please post or hand the original signed paper to your lawyer.', 'تصدیق ہو گئی۔ براہِ کرم اصل دستخط شدہ کاغذ اپنے وکیل کو ڈاک سے بھیجیں یا ہاتھ میں دیں۔')}</p>}

      {!victim && v && v.status === 'SIGNED_COPY_RECEIVED' && (
        <div className="decide">
          <p>Open the signed copy, compare the signature and details with the draft, then decide.</p>
          <label>Reason (needed only if you reject)<input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></label>
          <div className="btn-row"><button className="btn btn-gold" onClick={() => decide('VERIFY')} disabled={!!busy}>Verify</button><button className="btn btn-danger" onClick={() => decide('REJECT')} disabled={!!busy}>Reject and ask again</button></div>
        </div>
      )}
      {!victim && v && v.status === 'VERIFIED' && <button className="btn btn-navy" onClick={original} disabled={!!busy}>Mark the original as received</button>}
    </div>
  );
}

function Messages({ r }) {
  const { L, fmtDate } = useLang();
  const [state, setState] = useState({ open: true, messages: [] });
  const [err, setErr] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  const canUse = r.status === 'ACCEPTED' || (r.side === 'VICTIM' && r.status === 'WITHDRAWN');

  const load = useCallback(async () => {
    try { setState(await api(`/requests/${r.request_id}/messages`)); setErr(''); } catch (e) { setErr(e.message); }
  }, [r.request_id]);
  useEffect(() => { if (!canUse) return undefined; load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, [load, canUse]);
  useEffect(() => { end.current && end.current.scrollIntoView({ block: 'end' }); }, [state.messages.length]);

  if (!canUse) return <div className="card"><p className="muted">{L('Messaging opens after the lawyer accepts your request.', 'پیغام رسانی وکیل کے قبول کرنے کے بعد کھلتی ہے۔')}</p></div>;
  async function send(e) {
    e.preventDefault(); if (!text.trim()) return; setBusy(true);
    try { await api(`/requests/${r.request_id}/messages`, { method: 'POST', body: { text } }); setText(''); await load(); }
    catch (x) { setErr(x.message); } finally { setBusy(false); }
  }
  return (
    <div className="card">
      <h3>{L('Secure messages', 'محفوظ پیغامات')}</h3>
      <p className="muted small">🔒 {L('Messages are encrypted. Notifications never show what was written. Do not share passwords.', 'پیغامات انکرپٹڈ ہیں۔ اطلاعات میں پیغام کا متن کبھی نہیں دکھایا جاتا۔ پاس ورڈ شیئر نہ کریں۔')}</p>
      <div className="chat small-chat">
        {state.messages.length === 0 && <p className="muted center">{L('No messages yet.', 'ابھی کوئی پیغام نہیں۔')}</p>}
        {state.messages.map((m) => <div key={m.id} className={'bubble ' + (m.mine ? 'user' : 'assistant')}><div className="bubble-text">{m.text}</div><div className="bubble-meta"><span>{fmtDate(m.sent_at)}</span></div></div>)}
        <div ref={end} />
      </div>
      <Alert>{err}</Alert>
      {state.open ? (
        <form className="chat-form" onSubmit={send}>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder={L('Write a message…', 'پیغام لکھیں…')} aria-label="Message" />
          <button className="btn btn-gold" disabled={busy || !text.trim()}>{L('Send', 'بھیجیں')}</button>
        </form>
      ) : <p className="muted">{L('This conversation is closed.', 'یہ گفتگو بند ہے۔')}</p>}
    </div>
  );
}

function Tracking({ r, victim }) {
  const { L, fmtDate } = useLang();
  const { data, error, reload } = useLoad(() => (r.status === 'ACCEPTED' || (victim && r.status === 'WITHDRAWN') ? api(`/requests/${r.request_id}/tracking`) : Promise.resolve(null)), [r.request_id, r.status]);
  const [f, setF] = useState({ stage: '', note: '', title: '', eventDate: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!(r.status === 'ACCEPTED' || (victim && r.status === 'WITHDRAWN'))) return <div className="card"><p className="muted">{L('Progress is shown after the lawyer accepts your request.', 'پیش رفت وکیل کے قبول کرنے کے بعد دکھائی جاتی ہے۔')}</p></div>;
  async function save(e) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try {
      await api(`/requests/${r.request_id}/tracking/update`, { method: 'POST', body: { stage: f.stage, note: f.note, date: f.title || f.eventDate ? { title: f.title, eventDate: f.eventDate } : null } });
      setF({ stage: '', note: '', title: '', eventDate: '' }); reload();
    } catch (x) { setMsg({ type: 'error', text: x.message }); } finally { setBusy(false); }
  }
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = data ? data.dates.filter((d) => d.event_date >= today) : [];
  return (
    <div className="card">
      <h3>{L('Case progress', 'کیس کی پیش رفت')}</h3>
      <Alert>{error}</Alert>
      {data && (
        <>
          <div className="grid2">
            <div>
              <h4>{L('Current stage', 'موجودہ مرحلہ')}</h4>
              {data.updates.length === 0 ? <p className="muted">{L('No updates yet.', 'ابھی کوئی اپ ڈیٹ نہیں۔')}</p> : <p><span className="tag tag-live">{data.updates[0].stage}</span></p>}
              <h4>{L('Upcoming dates', 'آنے والی تاریخیں')}</h4>
              {upcoming.length === 0 ? <p className="muted">{L('No dates set.', 'کوئی تاریخ مقرر نہیں۔')}</p> : <ul className="plain">{upcoming.map((d) => <li key={d.date_id}>📅 <strong>{d.event_date}</strong> · {d.title}</li>)}</ul>}
            </div>
            <div>
              <h4>{L('History', 'تاریخچہ')}</h4>
              <ol className="timeline">{data.updates.map((u) => <li key={u.update_id}><span className="tl-dot" /><div><strong>{u.stage}</strong>{u.note && <div className="small">{u.note}</div>}<div className="muted small">{fmtDate(u.created_at)}</div></div></li>)}</ol>
            </div>
          </div>
          {data.canEdit && (
            <form className="decide" onSubmit={save}>
              <h4>Add an update</h4>
              <Alert type={msg && msg.type}>{msg && msg.text}</Alert>
              <div className="grid2 tight">
                <label>Stage<select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })} required><option value="">Choose…</option>{data.stages.map((s) => <option key={s}>{s}</option>)}</select></label>
                <label>Note for the client (optional)<input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} maxLength={1000} /></label>
                <label>Upcoming date: title (optional)<input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="First hearing" /></label>
                <label>Date<input type="date" min={today} value={f.eventDate} onChange={(e) => setF({ ...f, eventDate: e.target.value })} /></label>
              </div>
              <button className="btn btn-navy" disabled={busy || !f.stage}>{busy ? '…' : 'Save update'}</button>
            </form>
          )}
        </>
      )}
    </div>
  );
}

function ReportModal({ requestId, onClose }) {
  const { L } = useLang();
  const [reason, setReason] = useState('INAPPROPRIATE');
  const [details, setDetails] = useState('');
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  async function send() { try { await api('/reports', { method: 'POST', body: { requestId, reason, details } }); setDone(true); } catch (e) { setErr(e.message); } }
  return (
    <Modal title={L('Report a problem', 'مسئلے کی اطلاع دیں')} onClose={onClose}>
      {done ? <p>{L('Thank you. An administrator will review this.', 'شکریہ۔ ایڈمنسٹریٹر اس کا جائزہ لے گا۔')}</p> : (
        <>
          <Alert>{err}</Alert>
          <label>{L('What is the problem?', 'مسئلہ کیا ہے؟')}
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="INAPPROPRIATE">{L('Inappropriate behaviour', 'نامناسب رویہ')}</option>
              <option value="HARASSMENT">{L('Harassment', 'ہراسانی')}</option>
              <option value="FAKE_CREDENTIALS">{L('Fake credentials', 'جعلی اسناد')}</option>
              <option value="OTHER">{L('Something else', 'کچھ اور')}</option>
            </select>
          </label>
          <label>{L('Details (optional)', 'تفصیل (اختیاری)')}<textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} /></label>
          <div className="btn-row"><button className="btn btn-gold" onClick={send}>{L('Send report', 'اطلاع بھیجیں')}</button><button className="btn btn-outline" onClick={onClose}>{L('Cancel', 'منسوخ کریں')}</button></div>
        </>
      )}
    </Modal>
  );
}
