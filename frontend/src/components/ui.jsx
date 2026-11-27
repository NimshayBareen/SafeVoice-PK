import { useState, useEffect, useCallback } from 'react';

export function Alert({ type = 'error', children }) {
  if (!children) return null;
  return <div className={'alert alert-' + type}>{children}</div>;
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Enter' && e.target.tagName === 'TEXTAREA') return; };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="modal-back" onClick={onClose} role="dialog" aria-modal="true">
      <div className={'modal' + (wide ? ' wide' : '')} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h3>{title}</h3><button className="x" onClick={onClose} aria-label="Close">×</button></div>
        {children}
      </div>
    </div>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([key, label, badge]) => (
        <button key={key} role="tab" aria-selected={active === key} className={'tab' + (active === key ? ' on' : '')} onClick={() => onChange(key)}>
          {label}{badge ? <span className="badge-dot">{badge}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Pill({ kind = 'NONE', children }) {
  return <span className={'pill pill-' + kind}>{children}</span>;
}

const REQ_KIND = { PENDING: 'ERROR', ACCEPTED: 'MATCH', DECLINED: 'MISMATCH', WITHDRAWN: 'NONE', VERIFIED: 'MATCH', REJECTED: 'MISMATCH', PENDING_VERIFICATION: 'ERROR', MORE_INFO_REQUIRED: 'ERROR',
  SENT: 'ERROR', SIGNED_COPY_RECEIVED: 'ERROR', ORIGINAL_RECEIVED: 'MATCH', OPEN: 'ERROR', ACTION_TAKEN: 'MATCH', DISMISSED: 'NONE', ACTIVE: 'MATCH', SUSPENDED: 'MISMATCH' };
export function StatusPill({ status, label }) {
  return <Pill kind={REQ_KIND[status] || 'NONE'}>{label || String(status).replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase())}</Pill>;
}

// Loads data once and on demand. Returns { data, error, loading, reload }
export function useLoad(fn, deps) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const run = useCallback(async () => {
    try { const data = await fn(); setState({ data, error: '', loading: false }); }
    catch (e) { setState({ data: null, error: e.message, loading: false }); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run };
}

export const fmtSize = (n) => (n == null ? '' : n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
