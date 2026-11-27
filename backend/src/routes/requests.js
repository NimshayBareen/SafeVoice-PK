'use strict';
// UC-09 Request Representation, UC-10 Manage Evidence-Sharing Consent, UC-16 Review Case Request and Shared Evidence
const express = require('express');
const config = require('../config');
const storage = require('../storage');
const { pool, tx } = require('../db');
const { unwrapKey, decryptBuffer } = require('../crypto');
const { appendAudit, appendCustody } = require('../chain');
const { notify } = require('../notify');
const { isUuid } = require('../validators');
const { loadAnswers, requestForUser } = require('../services/access');
const { buildSummary } = require('../services/summary');
const { checkOne } = require('../services/integrity');
const { requireAuth, requireRole, requireVerifiedLawyer, ah } = require('../middleware/auth');

const router = express.Router();
const victimOnly = [requireAuth, requireRole('VICTIM')];

const notFound = (res, what = 'Not found.') => res.status(404).json({ error: 'not_found', message: what });

async function victimCase(userId, caseId) {
  if (!isUuid(caseId)) return null;
  const r = await pool.query(
    `SELECT c.case_id, c.reference_code, c.status, c.wrapped_case_key, cc.name_en AS category_name
     FROM cases c LEFT JOIN case_categories cc ON cc.category_id = c.category_id WHERE c.case_id = $1 AND c.victim_id = $2`, [caseId, userId]);
  return r.rows[0] || null;
}

async function makeSummary(c, note) {
  const key = unwrapKey(config.masterKey, c.wrapped_case_key);
  const answers = await loadAnswers(pool, c.case_id, key);
  const n = (await pool.query('SELECT count(*)::int AS n FROM evidence_items WHERE case_id = $1 AND NOT is_deleted', [c.case_id])).rows[0].n;
  return buildSummary({ categoryName: c.category_name, answers, evidenceCount: n, note });
}

async function verifiedLawyer(lawyerId) {
  if (!isUuid(lawyerId)) return null;
  const r = await pool.query(
    `SELECT lp.lawyer_id, lp.user_id, lp.full_name FROM lawyer_profiles lp JOIN users u ON u.user_id = lp.user_id
     WHERE lp.lawyer_id = $1 AND lp.verification_status = 'VERIFIED' AND u.status = 'ACTIVE'`, [lawyerId]);
  return r.rows[0] || null;
}

// ---------- victim: preview the anonymised summary ----------
router.post('/cases/:caseId/requests/preview', ...victimOnly, ah(async (req, res) => {
  const c = await victimCase(req.user.id, req.params.caseId);
  if (!c) return notFound(res, 'Case not found.');
  if (c.status !== 'INTAKE_COMPLETE') return res.status(409).json({ error: 'intake_incomplete', message: 'Please complete and submit the questions first.' });
  if (!(await verifiedLawyer(req.body && req.body.lawyerId))) return res.status(409).json({ error: 'lawyer_unavailable', message: 'This lawyer is no longer available.' });
  res.json({ summary: await makeSummary(c, req.body.note) });
}));

// ---------- victim: send the request ----------
router.post('/cases/:caseId/requests', ...victimOnly, ah(async (req, res) => {
  const c = await victimCase(req.user.id, req.params.caseId);
  if (!c) return notFound(res, 'Case not found.');
  if (c.status !== 'INTAKE_COMPLETE') return res.status(409).json({ error: 'intake_incomplete', message: 'Please complete and submit the questions first.' });
  const lawyer = await verifiedLawyer(req.body && req.body.lawyerId);
  if (!lawyer) return res.status(409).json({ error: 'lawyer_unavailable', message: 'This lawyer is no longer available.' });
  const summary = await makeSummary(c, req.body.note);
  try {
    const row = await tx(async (client) => {
      const r = await client.query(
        `INSERT INTO representation_requests (case_id, lawyer_id, anonymised_summary) VALUES ($1,$2,$3) RETURNING request_id, status, created_at`,
        [c.case_id, lawyer.lawyer_id, summary]);
      await appendAudit(client, { actorId: req.user.id, action: 'REQUEST_SENT', entityType: 'request', entityId: r.rows[0].request_id, ip: req.ip });
      await notify(lawyer.user_id, 'new_request', '/lawyer/requests/' + r.rows[0].request_id, client);
      return r.rows[0];
    });
    res.status(201).json({ request: row });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'already_requested', message: 'You already have an open request with this lawyer for this case.' });
    throw e;
  }
}));

// ---------- victim: requests of a case ----------
router.get('/cases/:caseId/requests', ...victimOnly, ah(async (req, res) => {
  const c = await victimCase(req.user.id, req.params.caseId);
  if (!c) return notFound(res, 'Case not found.');
  const r = await pool.query(
    `SELECT rr.request_id, rr.status, rr.created_at, rr.responded_at, lp.full_name AS lawyer_name, lp.city AS lawyer_city, v.status AS vakalatnama_status,
            (SELECT count(*)::int FROM evidence_shares s WHERE s.request_id = rr.request_id AND s.is_active) AS shared_count
     FROM representation_requests rr JOIN lawyer_profiles lp ON lp.lawyer_id = rr.lawyer_id
     LEFT JOIN vakalatnamas v ON v.request_id = rr.request_id
     WHERE rr.case_id = $1 ORDER BY rr.created_at DESC`, [c.case_id]);
  res.json({ requests: r.rows });
}));

// ---------- both sides: one request ----------
router.get('/requests/:id', requireAuth, ah(async (req, res) => {
  if (!isUuid(req.params.id)) return notFound(res);
  const x = await requestForUser(pool, req.user, req.params.id);
  if (!x) return notFound(res);
  const out = {
    request_id: x.request_id, status: x.status, created_at: x.created_at, responded_at: x.responded_at, summary: x.anonymised_summary,
    side: x.side, caseRef: x.reference_code, lawyer: { id: x.lawyer_id, name: x.lawyer_name, barCouncilNo: x.bar_council_no },
  };
  if (x.side === 'VICTIM') {
    const ev = await pool.query(
      `SELECT e.evidence_id, e.evidence_type, e.original_filename, e.url_value, e.description, e.uploaded_at,
              EXISTS (SELECT 1 FROM evidence_shares s WHERE s.request_id = $1 AND s.evidence_id = e.evidence_id AND s.is_active) AS shared
       FROM evidence_items e WHERE e.case_id = $2 AND NOT e.is_deleted ORDER BY e.uploaded_at`, [x.request_id, x.case_id]);
    out.evidence = ev.rows;
  } else if (x.status === 'ACCEPTED') {
    const ev = await pool.query(
      `SELECT e.evidence_id, e.evidence_type, e.original_filename, e.url_value, e.description, e.uploaded_at, e.sha256_hash
       FROM evidence_shares s JOIN evidence_items e ON e.evidence_id = s.evidence_id
       WHERE s.request_id = $1 AND s.is_active AND NOT e.is_deleted ORDER BY e.uploaded_at`, [x.request_id]);
    out.evidence = ev.rows.map((e) => ({ ...e, sha256_hash: e.sha256_hash.trim(), shared: true }));
  } else out.evidence = [];
  const v = (await pool.query('SELECT status, rejection_reason, generated_at, scan_uploaded_at, verified_at, original_received_at FROM vakalatnamas WHERE request_id = $1', [x.request_id])).rows[0];
  out.vakalatnama = v || null;
  res.json({ request: out });
}));

// ---------- victim: end the representation ----------
router.post('/requests/:id/withdraw', ...victimOnly, ah(async (req, res) => {
  if (!isUuid(req.params.id)) return notFound(res);
  const x = await requestForUser(pool, req.user, req.params.id);
  if (!x) return notFound(res);
  if (!['PENDING', 'ACCEPTED'].includes(x.status)) return res.status(409).json({ error: 'not_open', message: 'This request is already closed.' });
  await tx(async (client) => {
    await client.query(`UPDATE representation_requests SET status = 'WITHDRAWN', responded_at = now() WHERE request_id = $1`, [x.request_id]);
    const sh = await client.query(`UPDATE evidence_shares SET is_active = FALSE, revoked_at = now() WHERE request_id = $1 AND is_active RETURNING evidence_id`, [x.request_id]);
    for (const s of sh.rows) await appendCustody(client, { evidenceId: s.evidence_id, caseId: x.case_id, actorId: req.user.id, action: 'REVOKE', result: 'OK', ip: req.ip });
    await appendAudit(client, { actorId: req.user.id, action: 'REQUEST_WITHDRAWN', entityType: 'request', entityId: x.request_id, ip: req.ip });
    await notify(x.lawyer_user_id, 'request_update', '/lawyer/requests/' + x.request_id, client);
  });
  res.json({ status: 'WITHDRAWN' });
}));

// ---------- victim: consent. The full set of shared items is sent; anything not in the list is revoked at once ----------
router.put('/requests/:id/shares', ...victimOnly, ah(async (req, res) => {
  if (!isUuid(req.params.id)) return notFound(res);
  const x = await requestForUser(pool, req.user, req.params.id);
  if (!x) return notFound(res);
  if (x.status !== 'ACCEPTED') return res.status(409).json({ error: 'not_accepted', message: 'You can share evidence only after the lawyer has accepted your request.' });
  const ids = Array.isArray(req.body && req.body.evidenceIds) ? req.body.evidenceIds.filter(isUuid) : null;
  if (!ids) return res.status(400).json({ error: 'validation', message: 'No evidence list was sent.' });
  const valid = (await pool.query('SELECT evidence_id FROM evidence_items WHERE case_id = $1 AND NOT is_deleted AND evidence_id = ANY($2::uuid[])', [x.case_id, ids])).rows.map((r) => r.evidence_id);
  await tx(async (client) => {
    const revoked = await client.query(
      `UPDATE evidence_shares SET is_active = FALSE, revoked_at = now() WHERE request_id = $1 AND is_active AND NOT (evidence_id = ANY($2::uuid[])) RETURNING evidence_id`, [x.request_id, valid]);
    for (const s of revoked.rows) await appendCustody(client, { evidenceId: s.evidence_id, caseId: x.case_id, actorId: req.user.id, action: 'REVOKE', result: 'OK', ip: req.ip });
    const added = await client.query(
      `INSERT INTO evidence_shares (request_id, evidence_id) SELECT $1::uuid, e FROM unnest($2::uuid[]) AS e
       WHERE NOT EXISTS (SELECT 1 FROM evidence_shares s WHERE s.request_id = $1 AND s.evidence_id = e AND s.is_active) RETURNING evidence_id`, [x.request_id, valid]);
    for (const s of added.rows) await appendCustody(client, { evidenceId: s.evidence_id, caseId: x.case_id, actorId: req.user.id, action: 'SHARE', result: 'OK', ip: req.ip });
    await appendAudit(client, { actorId: req.user.id, action: 'SHARING_UPDATED', entityType: 'request', entityId: x.request_id, details: { shared: valid.length }, ip: req.ip });
    if (added.rows.length) await notify(x.lawyer_user_id, 'request_update', '/lawyer/requests/' + x.request_id, client);
  });
  res.json({ shared: valid });
}));

// ---------- lawyer: inbox ----------
router.get('/lawyer/requests', requireAuth, requireVerifiedLawyer, ah(async (req, res) => {
  const r = await pool.query(
    `SELECT rr.request_id, rr.status, rr.created_at, rr.responded_at, rr.anonymised_summary, c.reference_code, v.status AS vakalatnama_status,
            (SELECT count(*)::int FROM evidence_shares s WHERE s.request_id = rr.request_id AND s.is_active) AS shared_count
     FROM representation_requests rr JOIN cases c ON c.case_id = rr.case_id LEFT JOIN vakalatnamas v ON v.request_id = rr.request_id
     WHERE rr.lawyer_id = $1 ORDER BY (rr.status = 'PENDING') DESC, rr.created_at DESC`, [req.lawyer.id]);
  res.json({ requests: r.rows });
}));

// ---------- lawyer: accept or decline ----------
router.post('/requests/:id/respond', requireAuth, requireVerifiedLawyer, ah(async (req, res) => {
  if (!isUuid(req.params.id)) return notFound(res);
  const x = await requestForUser(pool, req.user, req.params.id);
  if (!x) return notFound(res);
  const decision = req.body && req.body.decision;
  if (!['ACCEPT', 'DECLINE'].includes(decision)) return res.status(400).json({ error: 'validation', message: 'Please accept or decline.' });
  if (x.status !== 'PENDING') return res.status(409).json({ error: 'not_pending', message: 'This request has already been answered or withdrawn.' });
  const status = decision === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
  await tx(async (client) => {
    await client.query('UPDATE representation_requests SET status = $2, responded_at = now() WHERE request_id = $1', [x.request_id, status]);
    await appendAudit(client, { actorId: req.user.id, action: 'REQUEST_' + status, entityType: 'request', entityId: x.request_id, ip: req.ip });
    await notify(x.victim_id, 'request_update', '/cases/' + x.case_id + '/representation', client);
  });
  res.json({ status });
}));

// ---------- lawyer: shared evidence only (active share, accepted request) ----------
async function sharedItem(req, res) {
  if (!isUuid(req.params.id) || !isUuid(req.params.evidenceId)) { notFound(res); return null; }
  const x = await requestForUser(pool, req.user, req.params.id);
  if (!x || x.side !== 'LAWYER') { notFound(res); return null; }
  if (x.status !== 'ACCEPTED') { res.status(403).json({ error: 'forbidden', message: 'Access denied.' }); return null; }
  const r = await pool.query(
    `SELECT e.*, c.wrapped_case_key FROM evidence_shares s
     JOIN evidence_items e ON e.evidence_id = s.evidence_id JOIN cases c ON c.case_id = e.case_id
     WHERE s.request_id = $1 AND s.evidence_id = $2 AND s.is_active AND NOT e.is_deleted`, [x.request_id, req.params.evidenceId]);
  if (!r.rows.length) { res.status(403).json({ error: 'no_access', message: 'You do not have access to this item. The client may have stopped sharing it.' }); return null; }
  return r.rows[0];
}

router.post('/requests/:id/evidence/:evidenceId/verify', requireAuth, requireVerifiedLawyer, ah(async (req, res) => {
  const ev = await sharedItem(req, res); if (!ev) return;
  res.json(await checkOne(ev, req.user.id, req.ip));
}));

router.get('/requests/:id/evidence/:evidenceId/download', requireAuth, requireVerifiedLawyer, ah(async (req, res) => {
  const ev = await sharedItem(req, res); if (!ev) return;
  if (ev.evidence_type === 'URL') return res.status(400).json({ error: 'not_a_file', message: 'A saved web address has no file to download.' });
  let plain;
  try { plain = decryptBuffer(unwrapKey(config.masterKey, ev.wrapped_case_key), ev.encryption_iv, await storage.get(ev.storage_path)); }
  catch (_) { return res.status(409).json({ error: 'integrity_error', message: 'This file could not be read safely. Run an integrity check.' }); }
  await tx((client) => appendCustody(client, { evidenceId: ev.evidence_id, caseId: ev.case_id, actorId: req.user.id, action: 'DOWNLOAD', result: 'LAWYER', ip: req.ip }));
  res.setHeader('Content-Type', ev.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(ev.original_filename || 'evidence')}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(plain);
}));

module.exports = router;
