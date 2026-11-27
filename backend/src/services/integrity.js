'use strict';
// Integrity check used by the victim (UC-04) and by a lawyer for shared items.
// Decrypts the stored file, recomputes SHA-256 and compares it with the hash saved at upload.
//   MATCH    : unchanged
//   MISMATCH : content changed (hash differs, or the encrypted file fails its authentication check)
//   ERROR    : the file is missing or cannot be read
const config = require('../config');
const storage = require('../storage');
const { tx } = require('../db');
const { sha256Hex, unwrapKey, decryptBuffer } = require('../crypto');
const { appendCustody, appendAudit } = require('../chain');

// Hash used for URL evidence: the link plus the moment it was recorded
const urlHash = (url, at) => sha256Hex(`${url}|${new Date(at).toISOString()}`);

// ev: evidence row joined with cases.wrapped_case_key
async function checkOne(ev, userId, ip) {
  let status;
  let computed = null;
  try {
    if (ev.evidence_type === 'URL') {
      computed = urlHash(ev.url_value, ev.uploaded_at);
      status = computed === ev.sha256_hash.trim() ? 'MATCH' : 'MISMATCH';
    } else {
      const caseKey = unwrapKey(config.masterKey, ev.wrapped_case_key);
      const data = await storage.get(ev.storage_path);
      try {
        computed = sha256Hex(decryptBuffer(caseKey, ev.encryption_iv, data));
        status = computed === ev.sha256_hash.trim() ? 'MATCH' : 'MISMATCH';
      } catch (_) {
        status = 'MISMATCH'; // authentication tag failed: the stored bytes were altered
      }
    }
  } catch (e) {
    status = 'ERROR';
  }
  const checkedAt = new Date();
  await tx(async (client) => {
    await appendCustody(client, { evidenceId: ev.evidence_id, caseId: ev.case_id, actorId: userId, action: 'VERIFY', result: status, ip });
    if (status !== 'MATCH') {
      await appendAudit(client, { actorId: userId, action: 'INTEGRITY_ALERT', entityType: 'evidence', entityId: ev.evidence_id, details: { status }, ip });
    }
  });
  return { evidenceId: ev.evidence_id, status, storedHash: ev.sha256_hash.trim(), computedHash: computed, checkedAt };
}

module.exports = { checkOne, urlHash };
