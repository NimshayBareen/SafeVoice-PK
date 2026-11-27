'use strict';
// UC-06 View Legal Mapping and UC-07 Generate Complaint Draft
const express = require('express');
const { pool, tx } = require('../db');
const { unwrapKey, seal, unsealText } = require('../crypto');
const config = require('../config');
const { writeAudit } = require('../audit');
const { isUuid } = require('../validators');
const { loadQuestions, loadRules } = require('../services/kb');
const { loadAnswers } = require('../services/access');
const { mapLaw } = require('../services/rules');
const docs = require('../services/documents');
const { requireAuth, requireRole, ah } = require('../middleware/auth');

const router = express.Router();
router.use(['/cases', '/evidence', '/complaint'], requireAuth, requireRole('VICTIM')); // victim-only paths; other roles use /requests and /lawyer

const DISCLAIMER_EN = 'This is legal information, not legal advice. Laws change and every case is different. Please confirm with a verified lawyer.';
const DISCLAIMER_UR = 'یہ قانونی معلومات ہیں، قانونی مشورہ نہیں۔ قوانین بدلتے رہتے ہیں اور ہر کیس مختلف ہوتا ہے۔ براہِ کرم کسی تصدیق شدہ وکیل سے تصدیق کریں۔';
const TYPE_LABEL = { IMAGE: 'Image', AUDIO: 'Audio', VIDEO: 'Video', DOCUMENT: 'Document', URL: 'Web link' };

async function ownedCase(userId, caseId) {
  if (!isUuid(caseId)) return null;
  const r = await pool.query(
    `SELECT c.case_id, c.reference_code, c.wrapped_case_key, c.status, cc.code AS category_code, cc.name_en AS category_name_en, cc.name_ur AS category_name_ur
     FROM cases c LEFT JOIN case_categories cc ON cc.category_id = c.category_id WHERE c.case_id = $1 AND c.victim_id = $2`, [caseId, userId]);
  return r.rows[0] || null;
}

async function buildMapping(c) {
  const key = unwrapKey(config.masterKey, c.wrapped_case_key);
  const [questions, rules, answers] = await Promise.all([loadQuestions(pool), loadRules(pool), loadAnswers(pool, c.case_id, key)]);
  return { key, questions, answers, mapping: mapLaw(c.category_code, rules, answers) };
}

// ---------- legal mapping ----------
router.get('/cases/:caseId/legal', ah(async (req, res) => {
  const c = await ownedCase(req.user.id, req.params.caseId);
  if (!c) return res.status(404).json({ error: 'not_found', message: 'Case not found.' });
  if (c.status !== 'INTAKE_COMPLETE') return res.status(409).json({ error: 'intake_incomplete', message: 'Please complete and submit the questions first.' });
  const { answers, mapping } = await buildMapping(c);
  await writeAudit({ actorId: req.user.id, action: 'VIEW_LEGAL_MAPPING', entityType: 'case', entityId: c.case_id, ip: req.ip });
  res.json({
    category: c.category_code ? { code: c.category_code, name_en: c.category_name_en, name_ur: c.category_name_ur } : null,
    immediateDanger: answers.immediate_danger === 'yes',
    matched: mapping.matched, offences: mapping.offences, forums: mapping.forums, procedures: mapping.procedures, lastReviewed: mapping.lastReviewed,
    disclaimer: { en: DISCLAIMER_EN, ur: DISCLAIMER_UR },
  });
}));

// ---------- complaint drafts ----------
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

router.post('/cases/:caseId/complaint', ah(async (req, res) => {
  const c = await ownedCase(req.user.id, req.params.caseId);
  if (!c) return res.status(404).json({ error: 'not_found', message: 'Case not found.' });
  if (c.status !== 'INTAKE_COMPLETE') return res.status(409).json({ error: 'intake_incomplete', message: 'Please complete and submit the questions first.' });
  const { key, questions, answers, mapping } = await buildMapping(c);
  const ev = await pool.query(`SELECT original_filename, url_value, evidence_type, sha256_hash, uploaded_at FROM evidence_items WHERE case_id = $1 AND NOT is_deleted ORDER BY uploaded_at`, [c.case_id]);
  const typeQ = questions.find((q) => q.q_key === 'incident_type');
  const typeOpt = typeQ && (typeQ.options_json || []).find((o) => o.value === answers.incident_type);
  const body = req.body || {};
  const text = docs.buildComplaintText({
    referenceCode: c.reference_code, complainantName: String(body.complainantName || '').trim().slice(0, 120), contact: String(body.contact || '').trim().slice(0, 120),
    categoryName: c.category_name_en, answers, incidentTypeLabel: typeOpt ? typeOpt.label_en : null,
    evidence: ev.rows.map((e) => ({ name: e.original_filename || e.url_value, type: TYPE_LABEL[e.evidence_type], date: fmtDate(e.uploaded_at), hash: e.sha256_hash.trim() })),
    mapping, dateText: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
  });
  const forumCode = mapping.forums[0] && mapping.forums[0].code;
  const draft = await tx(async (client) => {
    const v = (await client.query('SELECT COALESCE(MAX(version_no), 0) + 1 AS n FROM complaint_drafts WHERE case_id = $1', [c.case_id])).rows[0].n;
    const f = forumCode ? (await client.query('SELECT forum_id FROM forums WHERE code = $1', [forumCode])).rows[0] : null;
    const r = await client.query(
      `INSERT INTO complaint_drafts (case_id, forum_id, content_enc, version_no) VALUES ($1,$2,$3,$4) RETURNING draft_id, version_no, created_at`,
      [c.case_id, f ? f.forum_id : null, seal(key, text), v]);
    return r.rows[0];
  });
  await writeAudit({ actorId: req.user.id, action: 'COMPLAINT_GENERATED', entityType: 'case', entityId: c.case_id, ip: req.ip });
  res.status(201).json({ draft: { ...draft, content: text } });
}));

router.get('/cases/:caseId/complaint', ah(async (req, res) => {
  const c = await ownedCase(req.user.id, req.params.caseId);
  if (!c) return res.status(404).json({ error: 'not_found', message: 'Case not found.' });
  const key = unwrapKey(config.masterKey, c.wrapped_case_key);
  const r = await pool.query('SELECT draft_id, version_no, content_enc, created_at, updated_at FROM complaint_drafts WHERE case_id = $1 ORDER BY version_no DESC', [c.case_id]);
  const versions = r.rows.map((d) => ({ draft_id: d.draft_id, version_no: d.version_no, created_at: d.created_at, updated_at: d.updated_at }));
  res.json({ versions, latest: r.rows[0] ? { ...versions[0], content: unsealText(key, r.rows[0].content_enc) } : null });
}));

async function ownedDraft(userId, draftId) {
  if (!isUuid(draftId)) return null;
  const r = await pool.query(
    `SELECT d.draft_id, d.version_no, d.content_enc, c.case_id, c.reference_code, c.wrapped_case_key
     FROM complaint_drafts d JOIN cases c ON c.case_id = d.case_id WHERE d.draft_id = $1 AND c.victim_id = $2`, [draftId, userId]);
  return r.rows[0] || null;
}

router.get('/complaint/:draftId', ah(async (req, res) => {
  const d = await ownedDraft(req.user.id, req.params.draftId);
  if (!d) return res.status(404).json({ error: 'not_found', message: 'Draft not found.' });
  res.json({ draft: { draft_id: d.draft_id, version_no: d.version_no, content: unsealText(unwrapKey(config.masterKey, d.wrapped_case_key), d.content_enc) } });
}));

router.put('/complaint/:draftId', ah(async (req, res) => {
  const d = await ownedDraft(req.user.id, req.params.draftId);
  if (!d) return res.status(404).json({ error: 'not_found', message: 'Draft not found.' });
  const content = req.body && req.body.content;
  if (typeof content !== 'string' || content.length < 20 || content.length > 20000) return res.status(400).json({ error: 'validation', message: 'The draft text is too short or too long.' });
  await pool.query('UPDATE complaint_drafts SET content_enc = $2, updated_at = now() WHERE draft_id = $1', [d.draft_id, seal(unwrapKey(config.masterKey, d.wrapped_case_key), content)]);
  res.json({ saved: true });
}));

router.get('/complaint/:draftId/export', ah(async (req, res) => {
  const d = await ownedDraft(req.user.id, req.params.draftId);
  if (!d) return res.status(404).json({ error: 'not_found', message: 'Draft not found.' });
  const fmt = req.query.format === 'docx' ? 'docx' : 'pdf';
  const blocks = docs.parseBlocks(unsealText(unwrapKey(config.masterKey, d.wrapped_case_key), d.content_enc));
  const opts = { title: 'Complaint (draft)', footer: `${d.reference_code}  v${d.version_no}` };
  const buf = fmt === 'pdf' ? await docs.blocksToPdf(blocks, opts) : await docs.blocksToDocx(blocks, opts);
  await writeAudit({ actorId: req.user.id, action: 'COMPLAINT_EXPORTED', entityType: 'case', entityId: d.case_id, details: { format: fmt }, ip: req.ip });
  res.setHeader('Content-Type', fmt === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="Complaint_${d.reference_code}_v${d.version_no}.${fmt}"`);
  res.send(buf);
}));

module.exports = router;
