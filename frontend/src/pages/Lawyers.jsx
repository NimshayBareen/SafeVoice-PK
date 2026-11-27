import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';
import { Alert, Modal } from '../components/ui.jsx';

const FEES = { PRO_BONO: ['Free (pro bono)', 'مفت (پرو بونو)'], PAID: ['Paid', 'معاوضہ کے ساتھ'], MIXED: ['Free or paid', 'مفت یا معاوضہ کے ساتھ'] };
const LANG_NAMES = { ur: 'Urdu', en: 'English', pa: 'Punjabi', sd: 'Sindhi', ps: 'Pashto' };

// UC-08 Search Lawyer Directory and UC-09 Request Representation
export default function Lawyers() {
  const { caseId } = useParams();
  const { L, lang } = useLang();
  const [cats, setCats] = useState([]);
  const [filters, setFilters] = useState({ city: '', category: '', language: '', fee: '', q: '' });
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [target, setTarget] = useState(null);

  useEffect(() => { fetch('/api/public/categories').then((r) => r.json()).then((d) => setCats(d.categories || [])).catch(() => {}); }, []);
  async function search(e) {
    if (e) e.preventDefault();
    setError(''); setList(null);
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
    try { setList((await api('/lawyers' + (qs ? '?' + qs : ''))).lawyers); } catch (err) { setError(err.message); setList([]); }
  }
  useEffect(() => { search(); }, []); // eslint-disable-line

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const catName = (code) => { const c = cats.find((x) => x.code === code); return c ? (lang === 'ur' && c.name_ur ? c.name_ur : c.name_en) : code; };

  return (
    <div className="card">
      <h2>{L('Find a verified lawyer', 'تصدیق شدہ وکیل تلاش کریں')}</h2>
      <p className="muted">{L('Only lawyers whose licence was checked by an administrator are listed.', 'صرف وہی وکلاء درج ہیں جن کے لائسنس کی جانچ ایڈمنسٹریٹر نے کی ہے۔')}</p>
      <form className="filters" onSubmit={search}>
        <label>{L('City', 'شہر')}<input value={filters.city} onChange={set('city')} placeholder="Lahore" /></label>
        <label>{L('Area', 'شعبہ')}<select value={filters.category} onChange={set('category')}><option value="">{L('Any', 'کوئی بھی')}</option>{cats.map((c) => <option key={c.code} value={c.code}>{lang === 'ur' && c.name_ur ? c.name_ur : c.name_en}</option>)}</select></label>
        <label>{L('Language', 'زبان')}<select value={filters.language} onChange={set('language')}><option value="">{L('Any', 'کوئی بھی')}</option>{Object.entries(LANG_NAMES).map(([v, n]) => <option key={v} value={v}>{n}</option>)}</select></label>
        <label>{L('Fees', 'فیس')}<select value={filters.fee} onChange={set('fee')}><option value="">{L('Any', 'کوئی بھی')}</option>{Object.entries(FEES).map(([v, n]) => <option key={v} value={v}>{lang === 'ur' ? n[1] : n[0]}</option>)}</select></label>
        <label>{L('Name', 'نام')}<input value={filters.q} onChange={set('q')} /></label>
        <button className="btn btn-navy">{L('Search', 'تلاش کریں')}</button>
      </form>
      <Alert>{error}</Alert>
      {list === null && <p>{L('Loading…', 'لوڈ ہو رہا ہے…')}</p>}
      {list && list.length === 0 && !error && <div className="empty"><p>{L('No lawyer matches these filters. Try removing one or two filters.', 'ان فلٹرز سے کوئی وکیل نہیں ملا۔ ایک دو فلٹر ہٹا کر دیکھیں۔')}</p></div>}
      <div className="grid2">
        {list && list.map((l) => (
          <article className="card lawyer-card" key={l.lawyer_id}>
            <div className="case-top"><h3>{l.full_name}</h3><span className="pill pill-MATCH">✓ {L('Verified', 'تصدیق شدہ')}</span></div>
            <p className="muted small">{l.city} · {L('Bar Council no.', 'بار کونسل نمبر')} {l.bar_council_no}{l.bar_council_name ? ' · ' + l.bar_council_name : ''}</p>
            <p className="small">{(l.categories || []).map(catName).join(' · ') || '—'}</p>
            <p className="small muted">{L('Languages', 'زبانیں')}: {(l.languages || []).map((x) => LANG_NAMES[x] || x).join(', ')} · {L('Fees', 'فیس')}: {(FEES[l.fee_type] || [])[lang === 'ur' ? 1 : 0]}</p>
            {l.bio && <p className="small">{l.bio}</p>}
            <button className="btn btn-gold" onClick={() => setTarget(l)}>{L('Request representation', 'نمائندگی کی درخواست کریں')}</button>
          </article>
        ))}
      </div>
      {target && <RequestModal caseId={caseId} lawyer={target} onClose={() => setTarget(null)} />}
    </div>
  );
}

function RequestModal({ caseId, lawyer, onClose }) {
  const { L } = useLang();
  const [note, setNote] = useState('');
  const [summary, setSummary] = useState('');
  const [err, setErr] = useState(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function preview() {
    setBusy(true); setErr(null);
    try { setSummary((await api(`/cases/${caseId}/requests/preview`, { method: 'POST', body: { lawyerId: lawyer.lawyer_id, note } })).summary); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  }
  useEffect(() => { preview(); }, []); // eslint-disable-line
  async function send() {
    setBusy(true); setErr(null);
    try { await api(`/cases/${caseId}/requests`, { method: 'POST', body: { lawyerId: lawyer.lawyer_id, note } }); setSent(true); }
    catch (e) { setErr(e); } finally { setBusy(false); }
  }

  if (sent) {
    return (
      <Modal title={L('Request sent', 'درخواست بھیج دی گئی')} onClose={onClose}>
        <p>{L('The lawyer has been notified. You will see their answer under "My lawyer". Nothing else is shared until you decide.', 'وکیل کو اطلاع دے دی گئی ہے۔ ان کا جواب آپ کو "میرا وکیل" میں نظر آئے گا۔ جب تک آپ فیصلہ نہ کریں کچھ اور شیئر نہیں ہوتا۔')}</p>
        <Link className="btn btn-navy" to={`/cases/${caseId}/representation`}>{L('Go to My lawyer', '"میرا وکیل" پر جائیں')}</Link>
      </Modal>
    );
  }
  return (
    <Modal title={L('Request representation from ', 'نمائندگی کی درخواست: ') + lawyer.full_name} onClose={onClose} wide>
      <Alert>{err && (err.data && err.data.error === 'intake_incomplete' ? <>{err.message} <Link to={`/cases/${caseId}/intake`}>{L('Answer the questions', 'سوالات کے جواب دیں')}</Link></> : err.message)}</Alert>
      <p className="small muted">{L('This is exactly what the lawyer will see. It has no name, no contact details and no evidence.', 'وکیل کو بالکل یہی نظر آئے گا۔ اس میں نام، رابطہ کی تفصیل اور ثبوت شامل نہیں۔')}</p>
      <pre className="summary-box">{summary || '…'}</pre>
      <label>{L('Optional message to the lawyer', 'وکیل کے لیے اختیاری پیغام')}
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={600} onBlur={preview} />
        <small>{L('Do not write your name, phone number or address here.', 'یہاں اپنا نام، فون نمبر یا پتہ نہ لکھیں۔')}</small>
      </label>
      <div className="btn-row">
        <button className="btn btn-gold" onClick={send} disabled={busy || !summary}>{busy ? '…' : L('Confirm and send', 'تصدیق کریں اور بھیجیں')}</button>
        <button className="btn btn-outline" onClick={onClose}>{L('Cancel', 'منسوخ کریں')}</button>
      </div>
    </Modal>
  );
}
