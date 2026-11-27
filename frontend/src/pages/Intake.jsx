import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';
import { Alert } from '../components/ui.jsx';

// UC-05 Complete Case Intake
export default function Intake() {
  const { caseId } = useParams();
  const { L, lang } = useLang();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [fieldErrors, setFieldErrors] = useState({});
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    api(`/cases/${caseId}/intake`).then((d) => { setData(d); setAnswers(d.answers); }).catch((e) => setMsg({ type: 'error', text: e.message }));
  }, [caseId]);

  const category = useMemo(() => {
    if (!data) return null;
    const q = data.questions.find((x) => x.key === 'incident_type');
    const opt = q && q.options.find((o) => o.value === answers.incident_type);
    return opt ? opt.category : null;
  }, [data, answers]);

  const visible = useMemo(() => (data ? data.questions.filter((q) => !q.applies_to || q.applies_to.length === 0 || (category && q.applies_to.includes(category))) : []), [data, category]);
  const txt = (o, k) => (lang === 'ur' && o[k + '_ur'] ? o[k + '_ur'] : o[k + '_en'] || o['label_' + (lang === 'ur' ? 'ur' : 'en')] || o.label_en);
  const set = (k, v) => setAnswers({ ...answers, [k]: v });

  async function save(andSubmit) {
    setBusy(andSubmit ? 'submit' : 'save'); setMsg(null); setFieldErrors({});
    try {
      const payload = {};
      visible.forEach((q) => { payload[q.key] = answers[q.key] === undefined ? '' : answers[q.key]; });
      await api(`/cases/${caseId}/intake`, { method: 'PUT', body: { answers: payload } });
      if (!andSubmit) { setMsg({ type: 'ok', text: L('Saved. You can continue later.', 'محفوظ ہو گیا۔ آپ بعد میں جاری رکھ سکتی/سکتے ہیں۔') }); return; }
      await api(`/cases/${caseId}/intake/submit`, { method: 'POST' });
      navigate(`/cases/${caseId}/legal`);
    } catch (e) {
      if (e.data && e.data.fields) setFieldErrors(e.data.fields);
      if (e.data && e.data.missing) { const f = {}; e.data.missing.forEach((k) => { f[k] = L('Please answer this question.', 'براہِ کرم اس سوال کا جواب دیں۔'); }); setFieldErrors(f); }
      setMsg({ type: 'error', text: e.message });
    } finally { setBusy(''); }
  }

  if (!data) return <p>{msg ? <Alert>{msg.text}</Alert> : L('Loading…', 'لوڈ ہو رہا ہے…')}</p>;
  return (
    <div className="card">
      <h2>{L('Tell us what happened', 'ہمیں بتائیں کیا ہوا')}</h2>
      <p className="muted">{L('Answer what you can. Only a few questions are required. Your answers are stored encrypted. You can save and come back later.', 'جتنا ہو سکے جواب دیں۔ صرف چند سوالات ضروری ہیں۔ آپ کے جوابات انکرپٹڈ محفوظ رہتے ہیں۔ آپ محفوظ کر کے بعد میں واپس آ سکتی/سکتے ہیں۔')}</p>
      {answers.immediate_danger === 'yes' && (
        <div className="alert alert-error big">🚨 {L('If you are in immediate danger, call Police Helpline 15 now.', 'اگر آپ فوری خطرے میں ہیں تو ابھی پولیس ہیلپ لائن 15 پر کال کریں۔')}</div>
      )}
      <Alert type={msg && msg.type}>{msg && msg.text}</Alert>
      {visible.map((q, i) => (
        <fieldset className={'question' + (fieldErrors[q.key] ? ' has-error' : '')} key={q.key}>
          <legend><span className="qnum">{i + 1}</span>{txt(q, 'text')}{q.mandatory && <span className="req"> *</span>}</legend>
          {(q.type === 'SINGLE' || q.type === 'YESNO') && (
            <div className={'options' + (q.type === 'YESNO' ? ' inline' : '')}>
              {q.options.map((o) => (
                <label key={o.value} className={'option' + (answers[q.key] === o.value ? ' on' : '')}>
                  <input type="radio" name={q.key} checked={answers[q.key] === o.value} onChange={() => set(q.key, o.value)} />{txt(o, 'label')}
                </label>
              ))}
            </div>
          )}
          {q.type === 'DATE' && <input type="date" max={new Date().toISOString().slice(0, 10)} value={answers[q.key] || ''} onChange={(e) => set(q.key, e.target.value)} />}
          {q.type === 'TEXT' && (q.key === 'summary'
            ? <textarea rows={5} value={answers[q.key] || ''} onChange={(e) => set(q.key, e.target.value)} maxLength={3000} />
            : <input value={answers[q.key] || ''} onChange={(e) => set(q.key, e.target.value)} maxLength={200} />)}
          {fieldErrors[q.key] && <p className="field-err">{fieldErrors[q.key]}</p>}
        </fieldset>
      ))}
      <div className="btn-row">
        <button className="btn btn-outline" onClick={() => save(false)} disabled={!!busy}>{busy === 'save' ? '…' : L('Save and continue later', 'محفوظ کریں، بعد میں جاری رکھیں')}</button>
        <button className="btn btn-gold" onClick={() => save(true)} disabled={!!busy}>{busy === 'submit' ? '…' : L('Submit and see legal guidance', 'جمع کرائیں اور قانونی رہنمائی دیکھیں')}</button>
      </div>
    </div>
  );
}
