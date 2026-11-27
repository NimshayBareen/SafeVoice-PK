import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';
import { Alert } from '../components/ui.jsx';

// AI legal-information assistant over the administrator-managed knowledge base
export default function Assistant() {
  const { L, lang } = useLang();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const end = useRef(null);
  useEffect(() => { end.current && end.current.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy]);

  const starters = [
    L('Where do I report online blackmail?', 'آن لائن بلیک میلنگ کی رپورٹ کہاں کروں؟'),
    L('Which law covers cyber stalking?', 'سائبر اسٹاکنگ کس قانون میں آتی ہے؟'),
    L('What is a vakalatnama?', 'وکالت نامہ کیا ہوتا ہے؟'),
    L('Which helpline can I call for a child in danger?', 'خطرے میں گھرے بچے کے لیے کون سی ہیلپ لائن ہے؟'),
  ];

  async function ask(q) {
    const question = (q || text).trim();
    if (question.length < 3 || busy) return;
    const history = msgs.map((m) => ({ role: m.role, content: m.content }));
    setMsgs((m) => [...m, { role: 'user', content: question }]); setText(''); setBusy(true); setError('');
    try {
      const d = await api('/assistant', { method: 'POST', body: { question, history, lang } });
      setMsgs((m) => [...m, { role: 'assistant', content: d.answer, mode: d.mode, sources: d.sources, emergency: d.emergency }]);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="container page">
      <div className="page-head"><div><p className="eyebrow">{L('Legal knowledge base', 'قانونی علمی ذخیرہ')}</p><h1>{L('Ask the Assistant', 'اسسٹنٹ سے پوچھیں')}</h1></div></div>
      <div className="notice-bar warn">⚠️ {L('The assistant gives legal information from our knowledge base, not legal advice. It cannot see your case and nothing you type is saved. In immediate danger, call 15.', 'اسسٹنٹ ہمارے علمی ذخیرے سے قانونی معلومات دیتا ہے، قانونی مشورہ نہیں۔ یہ آپ کا کیس نہیں دیکھ سکتا اور آپ کا لکھا کچھ محفوظ نہیں ہوتا۔ فوری خطرے میں 15 پر کال کریں۔')}</div>
      <div className="card chat">
        {msgs.length === 0 && (
          <div className="chat-empty">
            <p>{L('Ask a question about the law, the steps to take, or where to find help.', 'قانون، اٹھانے والے اقدامات یا مدد کہاں ملے گی، اس بارے میں سوال پوچھیں۔')}</p>
            <div className="chips">{starters.map((s) => <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={'bubble ' + m.role}>
            {m.emergency && <div className="alert alert-error">🚨 {L('If anyone is in immediate danger, call 15.', 'اگر کوئی فوری خطرے میں ہے تو 15 پر کال کریں۔')}</div>}
            <div className="bubble-text">{m.content}</div>
            {m.role === 'assistant' && (
              <div className="bubble-meta">
                {m.sources && m.sources.length > 0 && <span>📚 {m.sources.join(' · ')}</span>}
                <span>{m.mode === 'ai' ? L('Answered by AI from the knowledge base', 'علمی ذخیرے سے AI کا جواب') : L('Extract from the knowledge base', 'علمی ذخیرے سے اقتباس')}</span>
              </div>
            )}
          </div>
        ))}
        {busy && <div className="bubble assistant"><div className="bubble-text">…</div></div>}
        <div ref={end} />
      </div>
      <Alert>{error}</Alert>
      <form className="chat-form" onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={L('Type your question…', 'اپنا سوال لکھیں…')} maxLength={1000} aria-label="Question" />
        <button className="btn btn-gold" disabled={busy || text.trim().length < 3}>{L('Ask', 'پوچھیں')}</button>
      </form>
    </div>
  );
}
