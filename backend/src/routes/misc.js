'use strict';
// UC-14 Support Directory, notifications, misuse reports and the AI assistant endpoint
const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool, tx } = require('../db');
const { appendAudit } = require('../chain');
const { writeAudit } = require('../audit');
const { notify } = require('../notify');
const { isUuid } = require('../validators');
const { requestForUser } = require('../services/access');
const { loadKB } = require('../services/kb');
const assistant = require('../services/assistant');
const { requireAuth, ah } = require('../middleware/auth');

const router = express.Router();

// ---------- public: case categories (used by the advocate registration form) ----------
router.get('/public/categories', ah(async (req, res) => {
  const r = await pool.query('SELECT code, name_en, name_ur FROM case_categories WHERE is_active ORDER BY name_en');
  res.json({ categories: r.rows });
}));

// ---------- support directory ----------
router.get('/support', requireAuth, ah(async (req, res) => {
  const city = typeof req.query.city === 'string' && req.query.city.trim() ? req.query.city.trim().slice(0, 60) : null;
  const cat = typeof req.query.category === 'string' && req.query.category.trim() ? req.query.category.trim().slice(0, 40) : null;
  const run = (cityFilter) => pool.query(
    `SELECT s.entry_id, s.name, s.name_ur, s.entry_type, s.city, s.is_national, s.phone, s.address, s.website, s.description
     FROM support_entries s
     WHERE s.is_active
       AND ($1::text IS NULL OR s.city ILIKE '%' || $1 || '%' OR s.is_national)
       AND ($2::text IS NULL OR EXISTS (SELECT 1 FROM support_entry_categories sc JOIN case_categories cc ON cc.category_id = sc.category_id WHERE sc.entry_id = s.entry_id AND cc.code = $2))
     ORDER BY s.is_national DESC, s.name`, [cityFilter, cat]);
  let r = await run(city);
let fallback = Boolean(city && !r.rows.some((entry) => !entry.is_national));

if (!r.rows.length) {
  r = await pool.query(`SELECT entry_id, name, name_ur, entry_type, city, is_national, phone, address, website, description FROM support_entries WHERE is_active AND is_national ORDER BY name`);
  fallback = true;
}
  res.json({ entries: r.rows, fallback });
}));

// ---------- notifications (always neutral text) ----------
router.get('/notifications', requireAuth, ah(async (req, res) => {
  const r = await pool.query('SELECT notification_id, type, neutral_text, link, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30', [req.user.id]);
  const unread = (await pool.query('SELECT count(*)::int AS n FROM notifications WHERE user_id = $1 AND NOT is_read', [req.user.id])).rows[0].n;
  res.json({ notifications: r.rows, unread });
}));
router.post('/notifications/read-all', requireAuth, ah(async (req, res) => {
  await pool.query('UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND NOT is_read', [req.user.id]);
  res.json({ ok: true });
}));

// ---------- report misuse (victim reports lawyer or lawyer reports victim, from a request) ----------
const REASONS = ['HARASSMENT', 'FAKE_CREDENTIALS', 'INAPPROPRIATE', 'OTHER'];
router.post('/reports', requireAuth, ah(async (req, res) => {
  const b = req.body || {};
  if (!isUuid(b.requestId) || !REASONS.includes(b.reason)) return res.status(400).json({ error: 'validation', message: 'Please choose a reason.' });
  const x = await requestForUser(pool, req.user, b.requestId);
  if (!x) return res.status(404).json({ error: 'not_found', message: 'Not found.' });
  const reported = x.side === 'VICTIM' ? x.lawyer_user_id : x.victim_id;
  const id = await tx(async (client) => {
    const r = await client.query('INSERT INTO misuse_reports (reporter_id, reported_user_id, reason, details) VALUES ($1,$2,$3,$4) RETURNING report_id',
      [req.user.id, reported, b.reason, b.details ? String(b.details).trim().slice(0, 1000) : null]);
    await appendAudit(client, { actorId: req.user.id, action: 'REPORT_FILED', entityType: 'report', entityId: r.rows[0].report_id, ip: req.ip });
    return r.rows[0].report_id;
  });
  const admins = await pool.query(`SELECT user_id FROM users WHERE role = 'ADMIN' AND status = 'ACTIVE'`);
  for (const a of admins.rows) await notify(a.user_id, 'report', '/admin/reports');
  res.status(201).json({ reportId: id });
}));

// ---------- AI assistant (answers from the legal knowledge base; nothing typed is stored) ----------
const assistantLimit = rateLimit({ windowMs: 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false, message: { error: 'too_many_requests', message: 'Please wait a moment before asking again.' } });
router.post('/assistant', requireAuth, assistantLimit, ah(async (req, res) => {
  const question = String((req.body && req.body.question) || '').trim();
  if (question.length < 3 || question.length > 1000) return res.status(400).json({ error: 'validation', message: 'Please type a question of up to 1000 characters.' });
  const kb = await loadKB(pool);
  const out = await assistant.ask({ question, history: req.body.history, chunks: assistant.buildChunks(kb), lang: req.body.lang === 'ur' ? 'ur' : 'en' });
  await writeAudit({ actorId: req.user.id, action: 'ASSISTANT_USED', entityType: 'assistant', details: { mode: out.mode }, ip: req.ip });
  res.json(out);
}));

module.exports = router;
