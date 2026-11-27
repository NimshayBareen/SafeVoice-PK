'use strict';
// UC-05 Complete Case Intake
const express = require('express');
const { pool, tx } = require('../db');
const { unwrapKey, seal } = require('../crypto');
const config = require('../config');
const { appendAudit } = require('../chain');
const { isUuid } = require('../validators');
const { loadQuestions } = require('../services/kb');
const { loadAnswers } = require('../services/access');
const { classify, missingMandatory } = require('../services/rules');
const { requireAuth, requireRole, ah } = require('../middleware/auth');

const router = express.Router();
router.use(['/cases', '/evidence', '/complaint'], requireAuth, requireRole('VICTIM')); // victim-only paths; other roles use /requests and /lawyer

async function ownedCase(userId, caseId) {
  if (!isUuid(caseId)) return null;
  const r = await pool.query('SELECT case_id, wrapped_case_key, status, category_id FROM cases WHERE case_id = $1 AND victim_id = $2', [caseId, userId]);
  return r.rows[0] || null;
}

const publicQuestion = (q) => ({ key: q.q_key, applies_to: q.applies_to, text_en: q.text_en, text_ur: q.text_ur, type: q.answer_type, options: q.options_json, mandatory: q.is_mandatory });

router.get('/cases/:caseId/intake', ah(async (req, res) => {
  const c = await ownedCase(req.user.id, req.params.caseId);
  if (!c) return res.status(404).json({ error: 'not_found', message: 'Case not found.' });
  const key = unwrapKey(config.masterKey, c.wrapped_case_key);
  const questions = await loadQuestions(pool);
  const answers = await loadAnswers(pool, c.case_id, key);
  res.json({ status: c.status, questions: questions.map(publicQuestion), answers, categoryCode: classify(questions, answers) });
}));

function validateAnswer(q, value) {
  const v = String(value);
  if (q.answer_type === 'SINGLE' || q.answer_type === 'YESNO') {
    return (q.options_json || []).some((o) => o.value === v) ? null : 'Please choose one of the options.';
  }
  if (q.answer_type === 'DATE') {
    const d = new Date(v + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(d.getTime())) return 'Please enter a valid date.';
    if (d.getTime() > Date.now() + 86400000) return 'The date cannot be in the future.';
    return null;
  }
  return v.length <= 3000 ? null : 'That answer is too long.';
}

router.put('/cases/:caseId/intake', ah(async (req, res) => {
  const c = await ownedCase(req.user.id, req.params.caseId);
  if (!c) return res.status(404).json({ error: 'not_found', message: 'Case not found.' });
  const incoming = req.body && req.body.answers;
  if (!incoming || typeof incoming !== 'object') return res.status(400).json({ error: 'validation', message: 'No answers were sent.' });
  const key = unwrapKey(config.masterKey, c.wrapped_case_key);
  const questions = await loadQuestions(pool);
  const byKey = Object.fromEntries(questions.map((q) => [q.q_key, q]));
  const errors = {};
  for (const [k, v] of Object.entries(incoming)) {
    const q = byKey[k];
    if (!q) { errors[k] = 'Unknown question.'; continue; }
    if (v === '' || v === null) continue;
    const e = validateAnswer(q, v); if (e) errors[k] = e;
  }
  if (Object.keys(errors).length) return res.status(400).json({ error: 'validation', message: 'Some answers need to be corrected.', fields: errors });
  await tx(async (client) => {
    for (const [k, v] of Object.entries(incoming)) {
      const q = byKey[k];
      if (v === '' || v === null) {
        await client.query('DELETE FROM intake_answers WHERE case_id = $1 AND question_id = $2', [c.case_id, q.question_id]);
      } else {
        await client.query(
          `INSERT INTO intake_answers (case_id, question_id, answer_value_enc) VALUES ($1,$2,$3)
           ON CONFLICT (case_id, question_id) DO UPDATE SET answer_value_enc = EXCLUDED.answer_value_enc, updated_at = now()`,
          [c.case_id, q.question_id, seal(key, String(v))]);
      }
    }
    await client.query(`UPDATE cases SET status = 'DRAFT', updated_at = now() WHERE case_id = $1`, [c.case_id]); // needs a new submit
  });
  res.json({ saved: true });
}));

router.post('/cases/:caseId/intake/submit', ah(async (req, res) => {
  const c = await ownedCase(req.user.id, req.params.caseId);
  if (!c) return res.status(404).json({ error: 'not_found', message: 'Case not found.' });
  const key = unwrapKey(config.masterKey, c.wrapped_case_key);
  const questions = await loadQuestions(pool);
  const answers = await loadAnswers(pool, c.case_id, key);
  const missing = missingMandatory(questions, answers);
  if (missing.length) return res.status(422).json({ error: 'missing_answers', message: 'Please answer the required questions.', missing });
  const code = classify(questions, answers);
  const cat = code ? (await pool.query('SELECT category_id, name_en, name_ur FROM case_categories WHERE code = $1 AND is_active', [code])).rows[0] : null;
  await tx(async (client) => {
    await client.query(`UPDATE cases SET status = 'INTAKE_COMPLETE', category_id = $2, updated_at = now() WHERE case_id = $1`, [c.case_id, cat ? cat.category_id : null]);
    await appendAudit(client, { actorId: req.user.id, action: 'INTAKE_SUBMITTED', entityType: 'case', entityId: c.case_id, details: { category: code }, ip: req.ip });
  });
  res.json({ status: 'INTAKE_COMPLETE', categoryCode: code, categoryName: cat ? { en: cat.name_en, ur: cat.name_ur } : null, generalGuidance: !cat });
}));

module.exports = router;
