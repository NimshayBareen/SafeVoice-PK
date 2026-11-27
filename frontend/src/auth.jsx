import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, loadSession, saveSession, clearSession } from './api.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(loadSession());
  const navigate = useNavigate();

  const login = useCallback(async (identifier, password) => {
    const data = await api('/auth/login', { method: 'POST', body: { identifier, password } });
    saveSession(data);
    setSession(data);
    return data;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await api('/auth/me');
      const next = { ...loadSession(), user: data.user };
      saveSession(next); setSession(next);
    } catch { /* ignore */ }
  }, []);

  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
    clearSession();
    setSession(null);
    navigate('/');
  }, [navigate]);

  // Quick exit (NFR-2.4): wipe the session and leave to a neutral website immediately
  const quickExit = useCallback(() => {
    clearSession();
    window.location.replace('https://www.google.com');
  }, []);

  useEffect(() => {
    const onExpired = () => { setSession(null); navigate('/login?expired=1'); };
    window.addEventListener('sv-session-expired', onExpired);
    return () => window.removeEventListener('sv-session-expired', onExpired);
  }, [navigate]);

  // Pressing Escape three times quickly also triggers the quick exit
  useEffect(() => {
    let count = 0, timer;
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      count += 1; clearTimeout(timer);
      timer = setTimeout(() => { count = 0; }, 1200);
      if (count >= 3) quickExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quickExit]);

  return (
    <AuthCtx.Provider value={{ user: session && session.user, token: session && session.token, login, logout, quickExit, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}
