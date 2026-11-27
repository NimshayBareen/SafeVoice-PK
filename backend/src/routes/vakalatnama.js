'use strict';
// UC-11 Generate and Track Vakalatnama, UC-17 Verify Signed Vakalatnama
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const config = require('../config');
const storage = require('../storage');
const { pool, tx } = require('../db');
const { unwrapKey, encryptBuffer, decryptBuffer } = require('../crypto');
const { appendAudit } = require('../chain');
const { notify } = require('../notify');
const { isUuid } = require('../validators');
const { requestForUser } = require('../services/access');
const docs = require('../services/documents');
const { requireAuth, requireRole, requireVerifiedLawyer, ah } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const SCAN_EXT = ['.png', '.jpg', '.jpeg', '.pdf'];
const notFound = (res) => res.status(404).json({ error: 'not_found', message: 'Not found.' });

async function loadRequest(req, res, side) {
  if (!isUuid(req.params.id)) { notFound(res); return null; }
  const x = await requestForUser(pool, req.user, req.params.id);
  if (!x || (side && x.side !== side)) { notFound(res); return null; }
  return x;
}
const getVak = async (requestId) => (await pool.query('SELECT * FROM vakalatnamas WHERE request_id = $1', [requestId])).rows[0] || null;

// ---------- victim: generate the draft ----------
router.post('/requests/:id/vakalatnama', requireAuth, requireRole('VICTIM'), ah(async (req, res) => {
  const x = await loadRequest(req, res, 'VICTIM'); if (!x) return;
  if (x.status !== 'ACCEPTED') return res.status(409).json({ error: 'not_accepted', message: 'A vakalatnama can be prepared only after the lawyer has accepted your request.' });
  const b = req.body || {};
  const clientName = String(b.clientName || '').trim().slice(0, 120);
  if (clientName.length < 3) return res.status(400).json({ error: 'validation', message: 'Please enter your full name as it appears on your identity document.' });
  const existing = await getVak(x.request_id);
  if (existing && existing.status !== 'SENT') return res.status(409).json({ error: 'already_in_progress', message: 'The vakalatnama is already signed and being checked.' });
  const cat = x.category_id ? (await pool.query('SELECT name_en FROM case_categories WHERE category_id = $1', [x.category_id])).rows[0] : null;
  const text = docs.buildVakalatnamaText({
    clientName, parentage: String(b.parentage || '').trim().slice(0, 120), forumText: String(b.forumText || '').trim().slice(0, 150),
    matterText: `${cat ? cat.name_en : 'complaint'} (case ${x.reference_code})`, lawyerName: x.lawyer_name, barNo: x.bar_council_no, barName: x.bar_council_name,
    referenceCode: x.reference_code, dateText: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
  });
  const pdf = await docs.blocksToPdf(docs.parseBlocks(text), { footer: `Vakalatnama ${x.reference_code}` });
  const { iv, data } = encryptBuffer(unwrapKey(config.masterKey, x.wrapped_case_key), pdf);
  const key = `${x.case_id}/vakalatnama-${crypto.randomUUID()}.bin`;
  await storage.put(key, data);
  try {
    await tx(async (client) => {
      if (existing) {
        await client.query(`UPDATE vakalatnamas SET draft_path = $2, draft_iv = $3, generated_at = now(), rejection_reason = NULL WHERE request_id = $1`, [x.request_id, key, iv]);
      } else {
        await client.query(`INSERT INTO vakalatnamas (request_id, draft_path, draft_iv, status) VALUES ($1,$2,$3,'SENT')`, [x.request_id, key, iv]);
      }
      await appendAudit(client, { actorId: req.user.id, action: 'VAKALATNAMA_GENERATED', entityType: 'request', entityId: x.request_id, ip: req.ip });
    });
  } catch (e) { await storage.remove(key).catch(() => {}); throw e; }
  if (existing) await storage.remove(existing.draft_path).catch(() => {});
  res.status(201).json({ status: 'SENT' });
}));

// ---------- both: download the draft ----------
router.get('/requests/:id/vakalatnama/draft', requireAuth, ah(async (req, res) => {
  const x = await loadRequest(req, res); if (!x) return;
  if (x.side === 'LAWYER' && x.status !== 'ACCEPTED') return res.status(403).json({ error: 'forbidden', message: 'Access denied.' });
  const v = await getVak(x.request_id);
  if (!v) return notFound(res);
  let pdf;
  try { pdf = decryptBuffer(unwrapKey(config.masterKey, x.wrapped_case_key), v.draft_iv, await storage.get(v.draft_path)); }
  catch (_) { return res.status(409).json({ error: 'integrity_error', message: 'The document could not be read.' }); }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Vakalatnama_${x.reference_code}.pdf"`);
  res.send(pdf);
}));

// ---------- victim: upload the signed copy ----------
router.post('/requests/:id/vakalatnama/scan', requireAuth, requireRole('VICTIM'), upload.single('file'), ah(async (req, res) => {
  const x = await loadRequest(req, res, 'VICTIM'); if (!x) return;
  const v = await getVak(x.request_id);
  if (!v || x.status !== 'ACCEPTED') return res.status(409).json({ error: 'no_draft', message: 'Please generate the vakalatnama first.' });
  if (!['SENT', 'SIGNED_COPY_RECEIVED'].includes(v.status)) return res.status(409).json({ error: 'already_verified', message: 'This vakalatnama has already been verified.' });
  if (!req.file) return res.status(400).json({ error: 'validation', message: 'Please choose the scanned, signed copy.' });
  const name = path.basename(req.file.originalname || 'scan').slice(0, 255);
  if (!SCAN_EXT.includes(path.extname(name).toLowerCase())) return res.status(400).json({ error: 'unsupported_type', message: 'Please upload a PDF or an image (PNG or JPG).' });
  const { iv, data } = encryptBuffer(unwrapKey(config.masterKey, x.wrapped_case_key), req.file.buffer);
  const key = `${x.case_id}/vakalatnama-scan-${crypto.randomUUID()}.bin`;
  await storage.put(key, data);
  try {
    await tx(async (client) => {
      await client.query(
        `UPDATE vakalatnamas SET signed_scan_path = $2, signed_scan_iv = $3, signed_scan_name = $4, signed_scan_mime = $5,
           status = 'SIGNED_COPY_RECEIVED', scan_uploaded_at = now(), rejection_reason = NULL WHERE request_id = $1`,
        [x.request_id, key, iv, name, String(req.file.mimetype || '').slice(0, 100)]);
      await appendAudit(client, { actorId: req.user.id, action: 'VAKALATNAMA_SCAN_UPLOADED', entityType: 'request', entityId: x.request_id, ip: req.ip });
      await notify(x.lawyer_user_id, 'request_update', '/lawyer/requests/' + x.request_id, client);
    });
  } catch (e) { await storage.remove(key).catch(() => {}); throw e; }
  if (v.signed_scan_path) await storage.remove(v.signed_scan_path).catch(() => {});
  res.json({ status: 'SIGNED_COPY_RECEIVED' });
}));

// ---------- both: view the signed copy ----------
router.get('/requests/:id/vakalatnama/scan', requireAuth, ah(async (req, res) => {
  const x = await loadRequest(req, res); if (!x) return;
  if (x.side === 'LAWYER' && x.status !== 'ACCEPTED') return res.status(403).json({ error: 'forbidden', message: 'Access denied.' });
  const v = await getVak(x.request_id);
  if (!v || !v.signed_scan_path) return notFound(res);
  let plain;
  try { plain = decryptBuffer(unwrapKey(config.masterKey, x.wrapped_case_key), v.signed_scan_iv, await storage.get(v.signed_scan_path)); }
  catch (_) { return res.status(409).json({ error: 'integrity_error', message: 'The scan could not be opened. Please ask for it to be uploaded again.' }); }
  res.setHeader('Content-Type', v.signed_scan_mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(v.signed_scan_name || 'scan')}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(plain);
}));

// ---------- lawyer: verify or reject the signed copy ----------
router.post('/requests/:id/vakalatnama/decide', requireAuth, requireVerifiedLawyer, ah(async (req, res) => {
  const x = await loadRequest(req, res, 'LAWYER'); if (!x) return;
  const v = await getVak(x.request_id);
  if (!v || v.status !== 'SIGNED_COPY_RECEIVED' || x.status !== 'ACCEPTED') return res.status(409).json({ error: 'nothing_to_check', message: 'There is no signed copy waiting to be checked.' });
  const decision = req.body && req.body.decision;
  const reason = String((req.body && req.body.reason) || '').trim().slice(0, 500);
  if (!['VERIFY', 'REJECT'].includes(decision)) return res.status(400).json({ error: 'validation', message: 'Please verify or reject.' });
  if (decision === 'REJECT' && reason.length < 3) return res.status(400).json({ error: 'validation', message: 'Please give a reason so the client knows what to fix.' });
  await tx(async (client) => {
    if (decision === 'VERIFY') await client.query(`UPDATE vakalatnamas SET status = 'VERIFIED', verified_at = now(), rejection_reason = NULL WHERE request_id = $1`, [x.request_id]);
    else await client.query(`UPDATE vakalatnamas SET status = 'SENT', rejection_reason = $2 WHERE request_id = $1`, [x.request_id, reason]);
    await appendAudit(client, { actorId: req.user.id, action: 'VAKALATNAMA_' + decision, entityType: 'request', entityId: x.request_id, ip: req.ip });
    await notify(x.victim_id, 'request_update', '/cases/' + x.case_id + '/representation', client);
  });
  res.json({ status: decision === 'VERIFY' ? 'VERIFIED' : 'SENT' });
}));

// ---------- lawyer: the original paper copy has arrived ----------
router.post('/requests/:id/vakalatnama/original', requireAuth, requireVerifiedLawyer, ah(async (req, res) => {
  const x = await loadRequest(req, res, 'LAWYER'); if (!x) return;
  const v = await getVak(x.request_id);
  if (!v || v.status !== 'VERIFIED') return res.status(409).json({ error: 'not_verified', message: 'Verify the signed copy first.' });
  await tx(async (client) => {
    await client.query(`UPDATE vakalatnamas SET status = 'ORIGINAL_RECEIVED', original_received_at = now() WHERE request_id = $1`, [x.request_id]);
    await appendAudit(client, { actorId: req.user.id, action: 'VAKALATNAMA_ORIGINAL', entityType: 'request', entityId: x.request_id, ip: req.ip });
    await notify(x.victim_id, 'request_update', '/cases/' + x.case_id + '/representation', client);
  });
  res.json({ status: 'ORIGINAL_RECEIVED' });
}));

module.exports = router;
