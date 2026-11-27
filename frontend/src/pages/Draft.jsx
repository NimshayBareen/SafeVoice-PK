import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, saveFile } from '../api.js';
import { useLang } from '../i18n.jsx';
import { Alert } from '../components/ui.jsx';

// UC-07 Generate Complaint Draft
export default function Draft() {
  const { caseId } = useParams();
  const { L, fmtDate } = useLang();
  const [versions, setVersions] = useState([]);
  const [draft, setDraft] = useState(null);
  const [text, setText] = useState('');
  const [form, setForm] = useState({ complainantName: '', contact: '' });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');
  const [needIntake, setNeedIntake] = useState(false);

  async function load(select) {
    const d = await api(`/cases/${caseId}/complaint`);
    setVersions(d.versions);
    if (select) { const x = await api('/complaint/' + select); setDraft(x.draft); setText(x.draft.content); }
    else if (d.latest) { setDraft(d.latest); setText(d.latest.content); }
  }
  useEffect(() => { load().catch((e) => setMsg({ type: 'error', text: e.message })); }, [caseId]); // eslint-disable-line

  async function generate() {
    setBusy('gen'); setMsg(null);
    try {
      const d = await api(`/cases/${caseId}/complaint`, { method: 'POST', body: form });
      await load(d.draft.draft_id);
      setMsg({ type: 'ok', text: L('A new draft was created. Please read it and correct anything that is wrong.', 'نیا مسودہ بن گیا ہے۔ براہِ کرم اسے پڑھیں اور جو غلط ہو درست کریں۔') });
    } catch (e) { if (e.data && e.data.error === 'intake_incomplete') setNeedIntake(true); setMsg({ type: 'error', text: e.message }); }
    finally { setBusy(''); }
  }
  async function save() {
    setBusy('save'); setMsg(null);
    try { await api('/complaint/' + draft.draft_id, { method: 'PUT', body: { content: text } }); setMsg({ type: 'ok', text: L('Your changes are saved.', 'آپ کی تبدیلیاں محفوظ ہو گئیں۔') }); }
    catch (e) { setMsg({ type: 'error', text: e.message }); } finally { setBusy(''); }
  }
  async function exportAs(fmt) {
    setBusy(fmt); setMsg(null);
    try { if (text !== draft.content) await api('/complaint/' + draft.draft_id, { method: 'PUT', body: { content: text } }); setDraft({ ...draft, content: text }); await saveFile(`/complaint/${draft.draft_id}/export?format=${fmt}`, 'complaint.' + fmt); }
    catch (e) { setMsg({ type: 'error', text: e.message }); } finally { setBusy(''); }
  }

  return (
    <div className="card">
      <h2>{L('Complaint draft', 'شکایت کا مسودہ')}</h2>
      <p className="muted">{L('SafeVoice PK prepares a draft from your answers, your evidence list and the laws that may apply. Read it carefully, fix any mistakes, then download it as PDF or Word. Ideally show it to a lawyer before filing.', 'سیف وائس پی کے آپ کے جوابات، ثبوت کی فہرست اور ممکنہ قوانین سے ایک مسودہ بناتا ہے۔ اسے غور سے پڑھیں، غلطیاں درست کریں، پھر PDF یا ورڈ میں ڈاؤن لوڈ کریں۔ بہتر ہے کہ جمع کرانے سے پہلے کسی وکیل کو دکھا لیں۔')}</p>
      <Alert type={msg && msg.type}>{msg && msg.text}</Alert>
      {needIntake && <Link className="btn btn-gold" to={`/cases/${caseId}/intake`}>{L('Answer the questions first', 'پہلے سوالات کے جواب دیں')}</Link>}
      <div className="grid2 tight">
        <label>{L('Your name (as it should appear)', 'آپ کا نام (جیسا مسودے میں لکھا جائے)')}<input value={form.complainantName} onChange={(e) => setForm({ ...form, complainantName: e.target.value })} maxLength={120} /></label>
        <label>{L('Contact number or email', 'رابطہ نمبر یا ای میل')}<input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} maxLength={120} /></label>
      </div>
      <p className="muted small">{L('These two details go only into the draft, which is stored encrypted. Leave them empty to fill them in by hand.', 'یہ دو تفصیلات صرف مسودے میں جاتی ہیں جو انکرپٹڈ محفوظ ہے۔ ہاتھ سے بھرنے کے لیے خالی چھوڑ دیں۔')}</p>
      <button className="btn btn-gold" onClick={generate} disabled={!!busy}>{busy === 'gen' ? '…' : draft ? L('Create a new version', 'نیا ورژن بنائیں') : L('Create my draft', 'میرا مسودہ بنائیں')}</button>

      {draft && (
        <>
          <div className="page-head tight">
            <h3>{L('Version', 'ورژن')} {draft.version_no}</h3>
            {versions.length > 1 && (
              <select value={draft.draft_id} onChange={(e) => load(e.target.value)}>
                {versions.map((v) => <option key={v.draft_id} value={v.draft_id}>v{v.version_no} · {fmtDate(v.created_at)}</option>)}
              </select>
            )}
          </div>
          <textarea className="draft-text" rows={26} value={text} onChange={(e) => setText(e.target.value)} spellCheck />
          <p className="muted small">{L('Lines starting with "## " are headings, "- " are bullet points and lines starting with "|" are the evidence table.', 'جو سطریں "## " سے شروع ہوں وہ عنوان ہیں، "- " والی نکات ہیں اور "|" سے شروع ہونے والی سطریں ثبوت کی جدول ہیں۔')}</p>
          <div className="btn-row">
            <button className="btn btn-outline" onClick={save} disabled={!!busy || text === draft.content}>{busy === 'save' ? '…' : L('Save changes', 'تبدیلیاں محفوظ کریں')}</button>
            <button className="btn btn-navy" onClick={() => exportAs('pdf')} disabled={!!busy}>{busy === 'pdf' ? '…' : '⬇ PDF'}</button>
            <button className="btn btn-navy" onClick={() => exportAs('docx')} disabled={!!busy}>{busy === 'docx' ? '…' : '⬇ Word'}</button>
            <Link className="btn btn-ghost" to={`/cases/${caseId}/lawyers`}>{L('Next: find a lawyer', 'اگلا: وکیل تلاش کریں')}</Link>
          </div>
        </>
      )}
    </div>
  );
}
