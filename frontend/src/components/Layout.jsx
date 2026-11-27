import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import Logo from './Logo.jsx';
import { useLang } from '../i18n.jsx';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';

function Bell() {
  const { L, fmtDate } = useLang();
  const [data, setData] = useState({ notifications: [], unread: 0 });
  const [open, setOpen] = useState(false);
  const load = () => api('/notifications').then(setData).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, []);
  async function toggle() {
    const next = !open; setOpen(next);
    if (next && data.unread) { await api('/notifications/read-all', { method: 'POST' }).catch(() => {}); load(); }
  }
  return (
    <div className="bell-wrap">
      <button className="linklike bell" onClick={toggle} aria-label="Notifications">🔔{data.unread > 0 && <span className="bell-n">{data.unread}</span>}</button>
      {open && (
        <div className="bell-menu" onMouseLeave={() => setOpen(false)}>
          {data.notifications.length === 0 && <p className="muted small pad">{L('No updates yet.', 'ابھی کوئی اپ ڈیٹ نہیں۔')}</p>}
          {data.notifications.map((n) => (
            <Link key={n.notification_id} to={n.link || '#'} className={'bell-item' + (n.is_read ? '' : ' unread')} onClick={() => setOpen(false)}>
              {L(n.neutral_text, 'آپ کے لیے ایک نئی اپ ڈیٹ ہے۔')}<span className="muted small">{fmtDate(n.created_at)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }) {
  const { t, toggle, L } = useLang();
  const { user, logout, quickExit } = useAuth();
  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label="SafeVoice PK">
            <Logo size={38} />
            <span className="brand-text">SafeVoice <em>PK</em></span>
          </Link>
          <nav className="nav">
            <NavLink to="/" end>{t('nav.home')}</NavLink>
            {user && user.role === 'VICTIM' && <NavLink to="/cases">{t('nav.cases')}</NavLink>}
            {user && user.role === 'VICTIM' && <NavLink to="/support">{L('Support', 'مدد')}</NavLink>}
            {user && user.role === 'VICTIM' && <NavLink to="/assistant">{L('Ask the Assistant', 'اسسٹنٹ سے پوچھیں')}</NavLink>}
            {user && user.role === 'LAWYER' && <NavLink to="/lawyer" end>{L('Dashboard', 'ڈیش بورڈ')}</NavLink>}
            {user && user.role === 'LAWYER' && <NavLink to="/lawyer/profile">{L('My profile', 'میری پروفائل')}</NavLink>}
            {user && user.role === 'ADMIN' && <NavLink to="/admin">{L('Admin', 'ایڈمن')}</NavLink>}
            {!user && <NavLink to="/login">{t('nav.login')}</NavLink>}
            {!user && <NavLink to="/register" className="nav-cta">{t('nav.register')}</NavLink>}
            {user && <Bell />}
            {user && <button className="linklike" onClick={logout}>{t('nav.logout')}</button>}
            <button className="linklike lang" onClick={toggle}>{t('nav.lang')}</button>
            <button className="quick-exit" onClick={quickExit} title="Esc x3">{t('nav.quickExit')}</button>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="footer">
        <div className="footer-inner">
          <p>{t('footer.text')}</p>
          <p className="footer-tip">{t('footer.exit')}</p>
        </div>
      </footer>
    </div>
  );
}
