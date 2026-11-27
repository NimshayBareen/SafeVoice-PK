'use strict';
// UC-03 Upload Evidence, UC-04 Verify Evidence Integrity (plus download and chain-of-custody view)
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const storage = require('../storage');
const multer = require('multer');
const config = require('../config');
const { pool, tx } = require('../db');
const { sha256Hex, unwrapKey, encryptBuffer, decryptBuffer } = require('../crypto');
const { appendCustody, appendAudit, verifyCustodyChain } = require('../chain');
const { isUuid, EXT_TYPES, isHttpUrl } = require('../validators');
const { checkOne, urlHash } = require('../services/integrity');
const { requireAuth, requireRole, ah } = require('../middleware/auth');

const router = express.Router();
router.use(['/cases', '/evidence', '/complaint'], requireAuth, requireRole('VICTIM')); // victim-only paths; other roles use /requests and /lawyer

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxFileMb * 1024 * 1024, files: 1 },
});

async function ownedCase(userId, caseId) {
  if (!isUuid(caseId)) return null;
  const r = await pool.query('SELECT case_id, wrapped_case_key FROM cases WHERE case_id = $1 AND victim_id = $2', [caseId, userId]);
  return r.rows[0] || null;
}

async function ownedEvidence(userId, evidenceId) {
  if (!isUuid(evidenceId)) return null;
  const r = await pool.query(
    `SELECT e.*, c.wrapped_case_key FROM evidence_items e
     JOIN cases c ON c.case_id = e.case_id
     WHERE e.evidence_id = $1 AND c.victim_id = $2 AND NOT e.is_deleted`, [evidenceId, userId]);
  return r.rows[0] || null;
}

const clip = (s, n) => (s ? String(s).trim().slice(0, n) : null);

// ---------- Upload a file ----------
router.post('/cases/:caseId/evidence', upload.single('file'), ah(async (req, res) => {
  const c = await ownedCase(req.user.id, req.params.caseId);
  if (!c) return res.status(404).json({ error: 'not_found', message: 'Case not found.' });
  if (!req.file) return res.status(400).json({ error: 'validation', message: 'Please choose a file to upload.' });

  const original = path.basename(req.file.originalname || 'file').slice(0, 255);
  const type = EXT_TYPES[path.extname(original).toLowerCase()];
  if (!type) {
    return res.status(400).json({ error: 'unsupported_type', message: 'This file type is not supported. Use an image, audio, video, PDF, text or Word file.' });
  }

  const caseKey = unwrapKey(config.masterKey, c.wrapped_case_key);
  const hash = sha256Hex(req.file.buffer);                       // 1. hash the plain file
  const { iv, data } = encryptBuffer(caseKey, req.file.buffer);  // 2. encrypt with the case key
  const evidenceId = crypto.randomUUID();
  const rel = `${c.case_id}/${evidenceId}.bin`;
  await storage.put(rel, data);                                  // 3. store ciphertext

  const uploadedAt = new Date();
  try {
    await tx(async (client) => {                                 // 4. record in the database + chain of custody
      await client.query(
        `INSERT INTO evidence_items
           (evidence_id, case_id, evidence_type, original_filename, mime_type, size_bytes, storage_path,
            encryption_iv, sha256_hash, metadata_json, description, uploaded_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12)`,
        [evidenceId, c.case_id, type, original, clip(req.file.mimetype, 100), req.file.size, rel, iv, hash,
          JSON.stringify({ sizeBytes: req.file.size, clientMimeType: req.file.mimetype || null, serverReceivedAt: uploadedAt.toISOString() }),
          clip(req.body.description, 500), uploadedAt]);
      await appendCustody(client, { evidenceId, caseId: c.case_id, actorId: req.user.id, action: 'UPLOAD', result: 'OK', ip: req.ip });
    });
  } catch (e) {
    await storage.remove(rel).catch(() => {});                   // no partial data is left behind (NFR-4.2)
    throw e;
  }
  res.status(201).json({
    evidence: { evidence_id: evidenceId, evidence_type: type, original_filename: original, size_bytes: req.file.size, sha256_hash: hash, uploaded_at: uploadedAt },
  });
}));

// ---------- Save a URL as evidence ----------
router.post('/cases/:caseId/evidence/url', ah(async (req, res) => {
  const c = await ownedCase(req.user.id, req.params.caseId);
  if (!c) return res.status(404).json({ error: 'not_found', message: 'Case not found.' });
  const url = req.body && req.body.url;
  if (!isHttpUrl(url)) return res.status(400).json({ error: 'validation', message: 'Please enter a valid web address starting with http:// or https://' });
  const evidenceId = crypto.randomUUID();
  const at = new Date();
  const hash = urlHash(url, at);
  await tx(async (client) => {
    await client.query(
      `INSERT INTO evidence_items (evidence_id, case_id, evidence_type, url_value, sha256_hash, metadata_json, description, uploaded_at)
       VALUES ($1,$2,'URL',$3,$4,$5::jsonb,$6,$7)`,
      [evidenceId, c.case_id, url, hash, JSON.stringify({ recordedAt: at.toISOString() }), clip(req.body.description, 500), at]);
    await appendCustody(client, { evidenceId, caseId: c.case_id, actorId: req.user.id, action: 'UPLOAD', result: 'OK', ip: req.ip });
  });
  res.status(201).json({ evidence: { evidence_id: evidenceId, evidence_type: 'URL', url_value: url, sha256_hash: hash, uploaded_at: at } });
}));

// ---------- List evidence of a case ----------
router.get('/cases/:caseId/evidence', ah(async (req, res) => {
  const c = await ownedCase(req.user.id, req.params.caseId);
  if (!c) return res.status(404).json({ error: 'not_found', message: 'Case not found.' });
  const r = await pool.query(
    `SELECT e.evidence_id, e.evidence_type, e.original_filename, e.mime_type, e.size_bytes, e.sha256_hash,
            e.url_value, e.description, e.uploaded_at,
            (SELECT l.result FROM custody_log l WHERE l.evidence_id = e.evidence_id AND l.action = 'VERIFY' ORDER BY l.log_id DESC LIMIT 1) AS last_verify_result,
            (SELECT l.created_at FROM custody_log l WHERE l.evidence_id = e.evidence_id AND l.action = 'VERIFY' ORDER BY l.log_id DESC LIMIT 1) AS last_verified_at
     FROM evidence_items e WHERE e.case_id = $1 AND NOT e.is_deleted ORDER BY e.uploaded_at ASC`, [c.case_id]);
  res.json({ evidence: r.rows });
}));

// ---------- Integrity check (core of UC-04): see services/integrity.js ----------
router.post('/evidence/:id/verify', ah(async (req, res) => {
  const ev = await ownedEvidence(req.user.id, req.params.id);
  if (!ev) return res.status(404).json({ error: 'not_found', message: 'Evidence item not found.' });
  res.json(await checkOne(ev, req.user.id, req.ip));
}));

router.post('/cases/:caseId/evidence/verify-all', ah(async (req, res) => {
  const c = await ownedCase(req.user.id, req.params.caseId);
  if (!c) return res.status(404).json({ error: 'not_found', message: 'Case not found.' });
  const r = await pool.query(
    `SELECT e.*, c.wrapped_case_key FROM evidence_items e JOIN cases c ON c.case_id = e.case_id
     WHERE e.case_id = $1 AND NOT e.is_deleted ORDER BY e.uploaded_at ASC`, [c.case_id]);
  const results = [];
  for (const ev of r.rows) results.push(await checkOne(ev, req.user.id, req.ip));
  res.json({ results });
}));

// ---------- Download (decrypts on the fly) ----------
router.get('/evidence/:id/download', ah(async (req, res) => {
  const ev = await ownedEvidence(req.user.id, req.params.id);
  if (!ev) return res.status(404).json({ error: 'not_found', message: 'Evidence item not found.' });
  if (ev.evidence_type === 'URL') return res.status(400).json({ error: 'not_a_file', message: 'A saved web address has no file to download.' });
  let plain;
  try {
    const caseKey = unwrapKey(config.masterKey, ev.wrapped_case_key);
    plain = decryptBuffer(caseKey, ev.encryption_iv, await storage.get(ev.storage_path));
  } catch (_) {
    return res.status(409).json({ error: 'integrity_error', message: 'This file could not be read safely. Run an integrity check.' });
  }
  await tx((client) => appendCustody(client, { evidenceId: ev.evidence_id, caseId: ev.case_id, actorId: req.user.id, action: 'DOWNLOAD', result: 'OK', ip: req.ip }));
  res.setHeader('Content-Type', ev.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(ev.original_filename || 'evidence')}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(plain);
}));

// ---------- Chain of custody of a case ----------
router.get('/cases/:caseId/custody', ah(async (req, res) => {
  const c = await ownedCase(req.user.id, req.params.caseId);
  if (!c) return res.status(404).json({ error: 'not_found', message: 'Case not found.' });
  const r = await pool.query(
    `SELECT l.log_id, l.evidence_id, l.case_id, l.actor_id, l.action, l.result, l.created_at, l.prev_hash, l.entry_hash,
            e.original_filename, e.evidence_type
     FROM custody_log l LEFT JOIN evidence_items e ON e.evidence_id = l.evidence_id
     WHERE l.case_id = $1 ORDER BY l.log_id ASC`, [c.case_id]);
  const rows = r.rows.map((x) => ({ ...x, prev_hash: x.prev_hash ? x.prev_hash.trim() : null, entry_hash: x.entry_hash.trim() }));
  const chain = verifyCustodyChain(rows);
  res.json({
    chainValid: chain.valid,
    entries: rows.map((x) => ({
      id: x.log_id, action: x.action, result: x.result, at: x.created_at,
      item: x.original_filename || (x.evidence_type === 'URL' ? 'Saved link' : null), hash: x.entry_hash,
    })),
  });
}));

module.exports = router;
