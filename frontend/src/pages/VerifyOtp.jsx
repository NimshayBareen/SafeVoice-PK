import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';
import { Alert } from '../components/ui.jsx';

export default function VerifyOtp() {
  const { L } = useLang();
  const [q] = useSearchParams();
  const loc = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState(q.get('email') || '');
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [info, setInfo] = useState(loc.state && loc.state.emailSent === false ? L('The email could not be sent from this server. Use "Send a new code" or ask your administrator.', 'اس سرور سے ای میل نہیں بھیجی جا سکی۔ "نیا کوڈ بھیجیں" استعمال کریں۔') : '');
  const [devOtp, setDevOtp] = useState((loc.state && loc.state.devOtp) || '');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(30);
  const refs = useRef([]);

  useEffect(() => { if (wait <= 0) return undefined; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const code = digits.join('');
  function onChange(i, v) {
    const d = v.replace(/\D/g, '');
    if (d.length > 1) { // pasted code
      const next = d.slice(0, 6).split(''); while (next.length < 6) next.push('');
      setDigits(next); refs.current[Math.min(d.length, 5)] && refs.current[Math.min(d.length, 5)].focus(); return;
    }
    const next = [...digits]; next[i] = d; setDigits(next);
    if (d && i < 5) refs.current[i + 1].focus();
  }
  function onKey(i, e) { if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1].focus(); }

  async function submit(e) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      await api('/auth/verify-otp', { method: 'POST', body: { email, code } });
      navigate('/login?verified=1');
    } catch (err) { setError(err.message); setDigits(['', '', '', '', '', '']); refs.current[0] && refs.current[0].focus(); }
    finally { setBusy(false); }
  }

  async function resend() {
    setError(''); setInfo('');
    try {
      const d = await api('/auth/resend-otp', { method: 'POST', body: { email } });
      setInfo(d.message); setWait(60); if (d.devOtp) setDevOtp(d.devOtp);
    } catch (err) { setError(err.message); if (err.data && err.data.retryAfter) setWait(err.data.retryAfter); }
  }

  return (
    <div className="container narrow">
      <form className="card form-card center" onSubmit={submit}>
        <div className="role-icon">✉️</div>
        <h2>{L('Enter your verification code', 'اپنا تصدیقی کوڈ درج کریں')}</h2>
        <p className="muted">{L('We sent a 6-digit code to', 'ہم نے 6 ہندسوں کا کوڈ یہاں بھیجا ہے:')} <strong dir="ltr">{email || '…'}</strong>. {L('It expires in 10 minutes.', 'یہ 10 منٹ میں ختم ہو جائے گا۔')}</p>
        {!q.get('email') && <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>}
        <Alert>{error}</Alert>
        <Alert type="info">{info}</Alert>
        {devOtp && <div className="notice"><p>{L('Demo mode: no mail server is connected, so the code is shown here:', 'ڈیمو موڈ: میل سرور منسلک نہیں، اس لیے کوڈ یہاں دکھایا گیا ہے:')} <strong className="otp-demo">{devOtp}</strong></p></div>}
        <div className="otp-row" dir="ltr">
          {digits.map((d, i) => (
            <input key={i} ref={(el) => { refs.current[i] = el; }} className="otp-box" inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={6} value={d}
              onChange={(e) => onChange(i, e.target.value)} onKeyDown={(e) => onKey(i, e)} aria-label={'Digit ' + (i + 1)} />
          ))}
        </div>
        <button className="btn btn-navy block" disabled={busy || code.length !== 6 || !email}>{busy ? '…' : L('Verify', 'تصدیق کریں')}</button>
        <p className="form-foot">
          <button type="button" className="linklike dark" onClick={resend} disabled={wait > 0}>{wait > 0 ? L(`Send a new code in ${wait}s`, `نیا کوڈ ${wait} سیکنڈ میں بھیجیں`) : L('Send a new code', 'نیا کوڈ بھیجیں')}</button>
        </p>
        <p className="form-foot"><Link to="/login">{L('Back to log in', 'لاگ اِن پر واپس')}</Link></p>
      </form>
    </div>
  );
}
