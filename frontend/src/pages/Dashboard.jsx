import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLang } from '../i18n.jsx';
import { Alert } from '../components/ui.jsx';

export default function Dashboard() {
  const { t, L, lang, fmtDate } = useLang();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cases, setCases] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api('/cases').then((d) => setCases(d.cases)).catch((e) => setError(e.message)); }, []);

  async function createCase() {
    setBusy(true); setError('');
    try { const d = await api('/cases', { method: 'POST' }); navigate('/cases/' + d.case.case_id + '/intake'); }
    catch (e) { setError(e.message); setBusy(false); }
  }
  const statusLabel = (s) => (s === 'INTAKE_COMPLETE' ? L('Questions done', 'سوالات مکمل') : L('Draft', 'مسودہ'));

  return (
    <div className="container page">
      <div className="page-head">
        <div>
          <p className="eyebrow">{t('dash.hello')}{user && user.alias ? ', ' + user.alias : ''}</p>
          <h1>{t('dash.title')}</h1>
        </div>
        <button className="btn btn-gold" onClick={createCase} disabled={busy}>＋ {t('dash.new')}</button>
      </div>
      <Alert>{error}</Alert>
      <div className="notice-bar">🛡️ {L('Your cases are private. Only you can open them. A lawyer sees nothing until you choose to share.', 'آپ کے کیسز نجی ہیں۔ انہیں صرف آپ کھول سکتی/سکتے ہیں۔ جب تک آپ شیئر نہ کریں وکیل کو کچھ نظر نہیں آتا۔')}</div>
      {cases === null && !error && <p>{t('common.loading')}</p>}
      {cases && cases.length === 0 && <div className="card empty">⚖️<p>{t('dash.empty')}</p></div>}
      <div className="grid3">
        {cases && cases.map((c) => (
          <article className="card case-card" key={c.case_id}>
            <div className="case-top">
              <span className="case-ref">{t('dash.ref')} {c.reference_code}</span>
              <span className="tag tag-soon">{statusLabel(c.status)}</span>
            </div>
            <p className="muted">{fmtDate(c.created_at)}</p>
            {c.category_name_en && <p><strong>{lang === 'ur' && c.category_name_ur ? c.category_name_ur : c.category_name_en}</strong></p>}
            <p><strong>{c.evidence_count}</strong> {t('dash.items')}{c.accepted_request_id ? ' · ' + L('Lawyer assigned', 'وکیل مقرر') : ''}</p>
            <Link className="btn btn-navy" to={'/cases/' + c.case_id}>{L('Open case', 'کیس کھولیں')}</Link>
          </article>
        ))}
      </div>
    </div>
  );
}
