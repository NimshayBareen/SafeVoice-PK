'use strict';
// Input validation (Design Document, Section 4.2: server-side validation)

function isEmail(s) {
  return typeof s === 'string' && s.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

// Accepts 03XXXXXXXXX, +923XXXXXXXXX, 923XXXXXXXXX. Returns the form 03XXXXXXXXX or null.
function normaliseMobile(s) {
  if (typeof s !== 'string') return null;
  const d = s.replace(/[\s-]/g, '');
  let m = null;
  if (/^03\d{9}$/.test(d)) m = d;
  else if (/^\+923\d{9}$/.test(d)) m = '0' + d.slice(3);
  else if (/^923\d{9}$/.test(d)) m = '0' + d.slice(2);
  return m;
}

// Password policy (FR-1.2): at least 10 characters with upper, lower, digit and symbol.
function validatePassword(pw) {
  const p = [];
  if (typeof pw !== 'string' || pw.length < 10) p.push('Password must be at least 10 characters long.');
  if (typeof pw === 'string' && pw.length > 128) p.push('Password must be at most 128 characters long.');
  if (!/[a-z]/.test(pw || '')) p.push('Password needs a lower-case letter.');
  if (!/[A-Z]/.test(pw || '')) p.push('Password needs an upper-case letter.');
  if (!/\d/.test(pw || '')) p.push('Password needs a digit.');
  if (!/[^A-Za-z0-9]/.test(pw || '')) p.push('Password needs a symbol such as # or !.');
  return p;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s);

// Allowed evidence file types (FR-2.1)
const EXT_TYPES = {
  '.png': 'IMAGE', '.jpg': 'IMAGE', '.jpeg': 'IMAGE', '.webp': 'IMAGE',
  '.mp3': 'AUDIO', '.wav': 'AUDIO', '.m4a': 'AUDIO', '.ogg': 'AUDIO', '.aac': 'AUDIO',
  '.mp4': 'VIDEO', '.mov': 'VIDEO', '.webm': 'VIDEO',
  '.pdf': 'DOCUMENT', '.txt': 'DOCUMENT', '.doc': 'DOCUMENT', '.docx': 'DOCUMENT',
};

function isHttpUrl(s) {
  if (typeof s !== 'string' || s.length > 2000) return false;
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; }
}

module.exports = { isEmail, normaliseMobile, validatePassword, isUuid, EXT_TYPES, isHttpUrl };
