import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';
import { Alert } from '../components/ui.jsx';

// UC-06 View Legal Mapping
export default function Legal() {
  const { caseId } = useParams();
  const { L, lang } = useLang();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { api(`/cases/${caseId}/legal`).then(setD).catch((e) => setErr(e)); }, [caseId]);

  if (err) {
    return (
      <div className="card">
        <Alert>{err.message}</Alert>
        {err.data && err.data.error === 'intake_incomplete' && <Link className="btn btn-gold" to={`/cases/${caseId}/intake`}>{L('Answer the questions', 'سوالات کے جواب دیں')}</Link>}
      </div>
    );
  }
  if (!d) return <p>{L('Loading…', 'لوڈ ہو رہا ہے…')}</p>;
  const u = lang === 'ur';
  const pick = (o, k) => (u && o[k + '_ur'] ? o[k + '_ur'] : o[k + '_en']);
  const steps = (txt) => String(txt || '').split('\n').filter(Boolean);
  return (
    <>
      {d.immediateDanger && <div className="alert alert-error big">🚨 {L('You said you are in immediate danger. Call Police Helpline 15 now.', 'آپ نے بتایا ہے کہ آپ فوری خطرے میں ہیں۔ ابھی پولیس ہیلپ لائن 15 پر کال کریں۔')}</div>}
      <div className="card">
        <h2>{L('Your legal route', 'آپ کا قانونی راستہ')}</h2>
        {d.category ? <p><span className="tag tag-live">{pick(d.category, 'name')}</span></p> : <Alert type="info">{L('Your answers did not match a specific type, so only general guidance is shown. A lawyer can help you decide.', 'آپ کے جوابات کسی مخصوص قسم سے نہیں ملے، اس لیے صرف عمومی رہنمائی دکھائی جا رہی ہے۔ وکیل آپ کی رہنمائی کر سکتا ہے۔')}</Alert>}
        <div className="notice-bar warn">⚠️ {u ? d.disclaimer.ur : d.disclaimer.en}</div>

        <h3>{L('Laws that may apply', 'جو قوانین لاگو ہو سکتے ہیں')}</h3>
        {d.offences.length === 0 && <p className="muted">{L('No specific provisions matched. Please speak to a verified lawyer.', 'کوئی مخصوص دفعہ نہیں ملی۔ براہِ کرم تصدیق شدہ وکیل سے بات کریں۔')}</p>}
        <div className="grid2 tight">
          {d.offences.map((o) => (
            <article className="mini-card" key={o.code}>
              <p className="muted small">{o.statute_name}{o.section_ref ? ' · ' + o.section_ref : ''}</p>
              <h4>{pick(o, 'title')}</h4>
              {o.ingredients_text && <p className="small">{o.ingredients_text}</p>}
            </article>
          ))}
        </div>

        <h3>{L('Where to go and what to do', 'کہاں جائیں اور کیا کریں')}</h3>
        {d.procedures.map((p) => (
          <article className="mini-card" key={p.forum.code}>
            <h4>🏛️ {pick(p.forum, 'name')}</h4>
            {p.forum.contact_info && <p className="small muted">{p.forum.contact_info}</p>}
            <ol className="steps">{steps(u && p.text_ur ? p.text_ur : p.text_en).map((s, i) => <li key={i}>{s.replace(/^\d+\.\s*/, '')}</li>)}</ol>
          </article>
        ))}
        {d.lastReviewed && <p className="muted small">{L('Legal content last reviewed on', 'قانونی مواد کا آخری جائزہ:')} {d.lastReviewed}</p>}
        <div className="btn-row">
          <Link className="btn btn-gold" to={`/cases/${caseId}/draft`}>{L('Prepare my complaint draft', 'میری شکایت کا مسودہ تیار کریں')}</Link>
          <Link className="btn btn-outline" to={`/cases/${caseId}/lawyers`}>{L('Find a lawyer', 'وکیل تلاش کریں')}</Link>
          <Link className="btn btn-ghost" to="/support">{L('Helplines and support', 'ہیلپ لائنز اور مدد')}</Link>
        </div>
      </div>
    </>
  );
}
