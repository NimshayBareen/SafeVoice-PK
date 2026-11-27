// Small wrapper around fetch. The session token lives in sessionStorage, so closing the tab ends the session.
const KEY = 'sv_session';

export function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; }
}
export function saveSession(s) { sessionStorage.setItem(KEY, JSON.stringify(s)); }
export function clearSession() { sessionStorage.removeItem(KEY); }

export class ApiError extends Error {
  constructor(status, data) {
    super((data && (data.message || (data.messages && data.messages.join(' ')))) || 'Request failed');
    this.status = status;
    this.data = data || {};
  }
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  const s = loadSession();
  if (s && s.token) headers.Authorization = 'Bearer ' + s.token;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try {
    res = await fetch('/api' + path, { method, headers, body: payload });
  } catch {
    throw new ApiError(0, { message: 'Cannot reach the server. Check your connection and try again.' });
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    if (res.status === 401 && s && data && data.error !== 'invalid_credentials') {
      clearSession();
      window.dispatchEvent(new Event('sv-session-expired'));
    }
    throw new ApiError(res.status, data);
  }
  return data;
}

// Download a decrypted evidence file through the authenticated API
export async function downloadEvidence(id, fallbackName) {
  const s = loadSession();
  const res = await fetch(`/api/evidence/${id}/download`, { headers: { Authorization: 'Bearer ' + (s && s.token) } });
  if (!res.ok) {
    let d = null; try { d = await res.json(); } catch { /* ignore */ }
    throw new ApiError(res.status, d);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fallbackName || 'evidence';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// Fetch a file (decrypted by the server) and either save it or open it in a new tab
export async function fetchBlob(path) {
  const s = loadSession();
  const res = await fetch('/api' + path, { headers: { Authorization: 'Bearer ' + (s && s.token) } });
  if (!res.ok) {
    let d = null; try { d = await res.json(); } catch { /* ignore */ }
    throw new ApiError(res.status, d);
  }
  const cd = res.headers.get('Content-Disposition') || '';
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
  return { blob: await res.blob(), filename: m ? decodeURIComponent(m[1]) : null };
}
export async function saveFile(path, fallbackName) {
  const { blob, filename } = await fetchBlob(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename || fallbackName || 'file';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
export async function openFile(path) {
  const { blob } = await fetchBlob(path);
  window.open(URL.createObjectURL(blob), '_blank', 'noopener');
}
