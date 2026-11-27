import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLang } from '../i18n.jsx';
import { Alert, StatusPill } from '../components/ui.jsx';

const LANGS = [['ur', 'Urdu'], ['en', 'English'], ['pa', 'Punjabi'], ['sd', 'Sindhi'], ['ps', 'Pashto']];

// UC-15 Register Lawyer Profile (profile and verification documents)
export default function LawyerProfile() {
  const { refresh } = useAuth();
  const { fmtDate } = useLang();
  const [p, setP] = useState(null);
  const [docs, setDocs] = useState([]);
  const [cats, setCats] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const [docType, setDocType] = useState('LICENCE');
  const file = useRef(null);

  const load = () => api('/lawyer/profile').then((d) => { setP(d.profile); setDocs(d.documents); }).catch((e) => setMsg({ type: 'error', text: e.message }));
  useEffect(() => { load(); fetch('/api/public/categories').then((r) => r.json()).then((d) => setCats(d.categories || [])).catch(() => {}); }, []);
  if (!p) return <div className="container page"><Alert>{msg && msg.text}</Alert></div>;

  const set = (k, v) => setP({ ...p, [k]: v });
  const toggle = (k, v) => set(k, p[k].includes(v) ? p[k].filter((x) => x !== v) : [...p[k], v]);

  async function save(e) {
    e.preventDefault(); setBusy('save'); setMsg(null);
    try { await api('/lawyer/profile', { method: 'PUT', body: { barCouncilName: p.bar_council_name, city: p.city, languages: p.languages, feeType: p.fee_type, bio: p.bio, categories: p.categories } }); setMsg({ type: 'ok', text: 'Profile saved.' }); await load(); refresh(); }
    catch (err) { setMsg({ type: 'error', text: err.data.messages ? err.data.messages.join(' ') : err.message }); } finally { setBusy(''); }
  }
  async function upload() {
    const f = file.current && file.current.files[0];
    if (!f) { setMsg({ type: 'error', text: 'Please choose a file.' }); return; }
    setBusy('doc'); setMsg(null);
    const fd = new FormData(); fd.append('file', f); fd.append('docType', docType);
    try { await api('/lawyer/documents', { method: 'POST', form: fd }); file.current.value = ''; setMsg({ type: 'ok', text: 'Document uploaded. An administrator has been notified.' }); await load(); refresh(); }
    catch (err) { setMsg({ type: 'error', text: err.message }); } finally { setBusy(''); }
  }

  return (
    <div className="container page narrow-page">
      <div className="page-head"><div><p className="eyebrow">Advocate</p><h1>My profile</h1></div><StatusPill status={p.verification_status} /></div>
      {p.verification_note && <Alert type="info"><strong>Note from the administrator:</strong> {p.verification_note}</Alert>}
      <Alert type={msg && msg.type}>{msg && msg.text}</Alert>
      <form className="card" onSubmit={save}>
        <h3>{p.full_name}</h3>
        <p className="muted small">Bar Council no. {p.bar_council_no} (cannot be changed here. Contact the administrator if it is wrong.)</p>
        <label>Bar Council<input value={p.bar_council_name || ''} onChange={(e) => set('bar_council_name', e.target.value)} /></label>
        <label>City<input value={p.city} onChange={(e) => set('city', e.target.value)} /></label>
        <div className="field-group"><span className="lbl">Languages</span><div className="chips">{LANGS.map(([v, l]) => <label key={v} className={'chip' + (p.languages.includes(v) ? ' on' : '')}><input type="checkbox" checked={p.languages.includes(v)} onChange={() => toggle('languages', v)} />{l}</label>)}</div></div>
        <label>Fees<select value={p.fee_type} onChange={(e) => set('fee_type', e.target.value)}><option value="PRO_BONO">Free (pro bono)</option><option value="PAID">Paid</option><option value="MIXED">Free or paid, depending on the case</option></select></label>
        <div className="field-group"><span className="lbl">Areas you help with</span><div className="chips">{cats.map((c) => <label key={c.code} className={'chip' + (p.categories.includes(c.code) ? ' on' : '')}><input type="checkbox" checked={p.categories.includes(c.code)} onChange={() => toggle('categories', c.code)} />{c.name_en}</label>)}</div></div>
        <label>Introduction<textarea rows={4} value={p.bio || ''} onChange={(e) => set('bio', e.target.value)} maxLength={1500} /></label>
        <button className="btn btn-navy" disabled={!!busy}>{busy === 'save' ? '…' : 'Save profile'}</button>
      </form>
      <div className="card">
        <h3>Verification documents</h3>
        <p className="muted small">Upload a clear scan or photo of your Bar Council licence card or enrolment certificate (PDF, PNG or JPG, up to 10 MB). Documents are stored encrypted and only administrators can open them.</p>
        <ul className="plain">{docs.map((d) => <li key={d.doc_id}>📄 {d.doc_type.toLowerCase()} · {d.original_filename} · <span className="muted small">{fmtDate(d.uploaded_at)}</span></li>)}</ul>
        {docs.length === 0 && <p className="muted">No documents uploaded yet.</p>}
        <div className="upload-row">
          <label>Type<select value={docType} onChange={(e) => setDocType(e.target.value)}><option value="LICENCE">Licence / enrolment</option><option value="ID">Identity document</option><option value="OTHER">Other</option></select></label>
          <label>File<input type="file" ref={file} accept=".pdf,.png,.jpg,.jpeg" /></label>
          <button type="button" className="btn btn-gold" onClick={upload} disabled={!!busy}>{busy === 'doc' ? '…' : 'Upload'}</button>
        </div>
      </div>
    </div>
  );
}
