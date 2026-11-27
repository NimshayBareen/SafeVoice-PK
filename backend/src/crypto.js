'use strict';
// Cryptographic helpers (Design Document, Sections 4.2 and 4.3).
// - SHA-256 is computed on the PLAIN file before encryption.
// - Every case has its own random 256-bit key. That key is stored "wrapped" (encrypted) with the master key.
// - Files are encrypted with AES-256-GCM. The 16-byte authentication tag is appended to the ciphertext,
//   so any change to the stored bytes makes decryption fail.
const crypto = require('crypto');

const TAG_LEN = 16;

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function randomKey() {
  return crypto.randomBytes(32);
}

// Wrap a key: result = iv(12) | tag(16) | ciphertext(32)
function wrapKey(masterKey, key) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
  const ct = Buffer.concat([c.update(key), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}

function unwrapKey(masterKey, wrapped) {
  const iv = wrapped.subarray(0, 12);
  const tag = wrapped.subarray(12, 12 + TAG_LEN);
  const ct = wrapped.subarray(12 + TAG_LEN);
  const d = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

// Returns { iv, data } where data = ciphertext | tag
function encryptBuffer(key, plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return { iv, data: Buffer.concat([ct, c.getAuthTag()]) };
}

// Throws if the data was changed (authentication failure) or the key is wrong.
function decryptBuffer(key, iv, data) {
  if (data.length < TAG_LEN) throw new Error('ciphertext too short');
  const ct = data.subarray(0, data.length - TAG_LEN);
  const tag = data.subarray(data.length - TAG_LEN);
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

// Small text or buffer sealing with any 32-byte key (messages, answers, drafts). Same layout as wrapKey: iv | tag | ciphertext.
const seal = (key, data) => wrapKey(key, Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8'));
const unseal = (key, sealed) => unwrapKey(key, sealed);
const unsealText = (key, sealed) => unwrapKey(key, sealed).toString('utf8');

// MASTER_KEY may be 64 hex characters (used as is) or any longer passphrase (hashed to 32 bytes).
function parseMasterKey(value) {
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, 'hex');
  if (typeof value === 'string' && value.length >= 24) return crypto.createHash('sha256').update(value).digest();
  throw new Error('MASTER_KEY must be 64 hex characters or a passphrase of at least 24 characters.');
}

module.exports = { sha256Hex, randomKey, wrapKey, unwrapKey, encryptBuffer, decryptBuffer, seal, unseal, unsealText, parseMasterKey };
