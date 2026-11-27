import { useState } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useLang } from '../i18n.jsx';
import { homeFor } from '../roles.js';
import { Alert } from '../components/ui.jsx';

export default function Login() {
  const { t, L } = useLang();
  const { login } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation();
  const [q] = useSearchParams();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [needsCode, setNeedsCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(''); setNeedsCode(''); setBusy(true);
    try {
      const d = await login(identifier, password);
      navigate((loc.state && loc.state.from) || homeFor(d.user.role), { replace: true });
    } catch (err) {
      setError((err.data.messages && err.data.messages.join(' ')) || err.message);
      if (err.data.error === 'not_verified') setNeedsCode(err.data.email || identifier);
    } finally { setBusy(false); }
  }

  return (
    <div className="container narrow">
      <form className="card form-card" onSubmit={submit} noValidate>
        <h2>{t('login.title')}</h2>
        <div className="gold-rule left" />
        {q.get('expired') && <Alert type="info">{t('login.expired')}</Alert>}
        {q.get('verified') && <Alert type="ok">{t('login.verified')}</Alert>}
        <Alert>{error}</Alert>
        {needsCode && <div className="notice"><Link className="btn btn-navy" to={'/verify?email=' + encodeURIComponent(needsCode)}>{L('Enter verification code', 'تصدیقی کوڈ درج کریں')}</Link></div>}
        <label>{t('login.identifier')}<input value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" /></label>
        <label>{t('register.password')}<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        <button className="btn btn-navy block" disabled={busy}>{busy ? '…' : t('login.submit')}</button>
        <p className="form-foot"><Link to="/register">{t('login.no')}</Link></p>
      </form>
    </div>
  );
}
