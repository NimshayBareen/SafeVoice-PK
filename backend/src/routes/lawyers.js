'use strict';
// UC-15 Register Lawyer Profile (profile, documents) and UC-08 Search Lawyer Directory
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const config = require('../config');
const storage = require('../storage');
const { pool, tx } = require('../db');
const { encryptBuffer, decryptBuffer } = require('../crypto');
const { appendAudit } = require('../chain');
const { notify } = require('../notify');
const { isUuid } = require('../validators');
const { requireAuth, requireRole, ah } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const DOC_EXT = ['.png', '.jpg', '.jpeg', '.pdf'];
const DOC_TYPES = ['LICENCE', 'ID', 'OTHER'];
const FEE_TYPES = ['PAID', 'PRO_BONO', 'MIXED'];

async function notifyAdmins(type, link) {
  const r = await pool.query(`SELECT user_id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'`);
  for (const a of r.rows) await notify(a.user_id, type, link);
}

const PROFILE_SQL = `SELECT lp.lawyer_id, lp.full_name, lp.bar_council_no, lp.bar_council_name, lp.city, lp.languages, lp.fee_type, lp.bio,
       lp.verification_status, lp.verification_note,
       COALESCE((SELECT array_agg(cc.code ORDER BY cc.code) FROM lawyer_specialisations ls JOIN case_categories cc ON cc.category_id = ls.category_id WHERE ls.lawyer_id = lp.lawyer_id), '{}') AS categories
     FROM lawyer_profiles lp`;

// ---------- lawyer: own profile ----------
router.get('/lawyer/profile', requireAuth, requireRole('LAWYER'), ah(async (req, res) => {
  const r = await pool.query(PROFILE_SQL + ' WHERE lp.user_id = $1', [req.user.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'not_found', message: 'Profile not found.' });
  const docs = await pool.query('SELECT doc_id, doc_type, original_filename, uploaded_at FROM lawyer_documents WHERE lawyer_id = $1 ORDER BY uploaded_at', [r.rows[0].lawyer_id]);
  res.json({ profile: r.rows[0], documents: docs.rows });
}));

router.put('/lawyer/profile', requireAuth, requireRole('LAWYER'), ah(async (req, res) => {
  const b = req.body || {};
  const problems = [];
  const city = String(b.city || '').trim().slice(0, 60);
  const languages = Array.isArray(b.languages) ? b.languages.map((x) => String(x).trim().toLowerCase().slice(0, 20)).filter(Boolean).slice(0, 6) : [];
  if (city.length < 2) problems.push('Please enter your city.');
  if (!languages.length) problems.push('Please choose at least one language.');
  if (!FEE_TYPES.includes(b.feeType)) problems.push('Please choose a fee type.');
  if (problems.length) return res.status(400).json({ error: 'validation', messages: problems });
  const cats = Array.isArray(b.categories) ? b.categories.map(String).slice(0, 20) : [];
  const lp = (await pool.query('SELECT lawyer_id, verification_status FROM lawyer_profiles WHERE user_id = $1', [req.user.id])).rows[0];
  if (!lp) return res.status(404).json({ error: 'not_found', message: 'Profile not found.' });
  await tx(async (client) => {
    const back = ['MORE_INFO_REQUIRED', 'REJECTED'].includes(lp.verification_status);
    await client.query(
      `UPDATE lawyer_profiles SET bar_council_name = $2, city = $3, languages = $4, fee_type = $5, bio = $6,
         verification_status = CASE WHEN $7 THEN 'PENDING_VERIFICATION' ELSE verification_status END WHERE lawyer_id = $1`,
      [lp.lawyer_id, b.barCouncilName ? String(b.barCouncilName).trim().slice(0, 80) : null, city, languages, b.feeType, b.bio ? String(b.bio).trim().slice(0, 1500) : null, back]);
    await client.query('DELETE FROM lawyer_specialisations WHERE lawyer_id = $1', [lp.lawyer_id]);
    await client.query(`INSERT INTO lawyer_specialisations (lawyer_id, category_id) SELECT $1::uuid, category_id FROM case_categories WHERE code = ANY($2::text[])`, [lp.lawyer_id, cats]);
    await appendAudit(client, { actorId: req.user.id, action: 'LAWYER_PROFILE_UPDATED', entityType: 'lawyer', entityId: lp.lawyer_id, ip: req.ip });
  });
  res.json({ saved: true });
}));

// ---------- lawyer: documents for verification (licence card, ID) ----------
router.post('/lawyer/documents', requireAuth, requireRole('LAWYER'), upload.single('file'), ah(async (req, res) => {
  const lp = (await pool.query('SELECT lawyer_id, verification_status FROM lawyer_profiles WHERE user_id = $1', [req.user.id])).rows[0];
  if (!lp) return res.status(404).json({ error: 'not_found', message: 'Profile not found.' });
  if (!req.file) return res.status(400).json({ error: 'validation', message: 'Please choose a file.' });
  const name = path.basename(req.file.originalname || 'document').slice(0, 255);
  if (!DOC_EXT.includes(path.extname(name).toLowerCase())) return res.status(400).json({ error: 'unsupported_type', message: 'Please upload a PDF or an image (PNG or JPG).' });
  const docType = DOC_TYPES.includes(req.body.docType) ? req.body.docType : 'OTHER';
  const { iv, data } = encryptBuffer(config.masterKey, req.file.buffer);
  const key = `lawyers/${lp.lawyer_id}/${crypto.randomUUID()}.bin`;
  await storage.put(key, data);
  try {
    await tx(async (client) => {
      await client.query(
        `INSERT INTO lawyer_documents (lawyer_id, doc_type, original_filename, mime_type, file_path, encryption_iv) VALUES ($1,$2,$3,$4,$5,$6)`,
        [lp.lawyer_id, docType, name, String(req.file.mimetype || '').slice(0, 100), key, iv]);
      if (lp.verification_status === 'MORE_INFO_REQUIRED') await client.query(`UPDATE lawyer_profiles SET verification_status = 'PENDING_VERIFICATION' WHERE lawyer_id = $1`, [lp.lawyer_id]);
      await appendAudit(client, { actorId: req.user.id, action: 'LAWYER_DOCUMENT_UPLOADED', entityType: 'lawyer', entityId: lp.lawyer_id, ip: req.ip });
    });
  } catch (e) { await storage.remove(key).catch(() => {}); throw e; }
  await notifyAdmins('lawyer_pending', '/admin/lawyers');
  res.status(201).json({ uploaded: true });
}));

// ---------- directory (victims and administrators) ----------
router.get('/lawyers', requireAuth, requireRole('VICTIM', 'ADMIN'), ah(async (req, res) => {
  const q = req.query;
  const val = (v, max = 80) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
  const r = await pool.query(
    PROFILE_SQL + ` JOIN users u ON u.user_id = lp.user_id
     WHERE lp.verification_status = 'VERIFIED' AND u.status = 'ACTIVE'
       AND ($1::text IS NULL OR lp.city ILIKE '%' || $1 || '%')
       AND ($2::text IS NULL OR EXISTS (SELECT 1 FROM lawyer_specialisations ls JOIN case_categories cc ON cc.category_id = ls.category_id WHERE ls.lawyer_id = lp.lawyer_id AND cc.code = $2))
       AND ($3::text IS NULL OR $3 = ANY(lp.languages))
       AND ($4::text IS NULL OR lp.fee_type = $4)
       AND ($5::text IS NULL OR lp.full_name ILIKE '%' || $5 || '%')
     ORDER BY lp.full_name LIMIT 100`,
    [val(q.city), val(q.category), val(q.language, 20), FEE_TYPES.includes(q.fee) ? q.fee : null, val(q.q)]);
  res.json({ lawyers: r.rows.map(({ verification_note, ...x }) => x) });
}));

router.get('/lawyers/:id', requireAuth, requireRole('VICTIM', 'ADMIN'), ah(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'not_found', message: 'Lawyer not found.' });
  const r = await pool.query(PROFILE_SQL + ` JOIN users u ON u.user_id = lp.user_id WHERE lp.lawyer_id = $1 AND lp.verification_status = 'VERIFIED' AND u.status = 'ACTIVE'`, [req.params.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'not_found', message: 'Lawyer not found.' });
  const { verification_note, ...lawyer } = r.rows[0];
  res.json({ lawyer });
}));

// Document download for administrators (decrypts on the fly)
router.get('/admin/lawyer-documents/:docId', requireAuth, requireRole('ADMIN'), ah(async (req, res) => {
  if (!isUuid(req.params.docId)) return res.status(404).json({ error: 'not_found', message: 'Document not found.' });
  const d = (await pool.query('SELECT * FROM lawyer_documents WHERE doc_id = $1', [req.params.docId])).rows[0];
  if (!d) return res.status(404).json({ error: 'not_found', message: 'Document not found.' });
  let plain;
  try { plain = decryptBuffer(config.masterKey, d.encryption_iv, await storage.get(d.file_path)); }
  catch (_) { return res.status(409).json({ error: 'integrity_error', message: 'This document could not be read.' }); }
  await tx((client) => appendAudit(client, { actorId: req.user.id, action: 'LAWYER_DOC_VIEWED', entityType: 'lawyer_document', entityId: d.doc_id, ip: req.ip }));
  res.setHeader('Content-Type', d.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(d.original_filename || 'document')}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(plain);
}));

module.exports = router;
module.exports.notifyAdmins = notifyAdmins;
