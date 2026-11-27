'use strict';
// UC-13 Track Case Progress
const express = require('express');
const { pool, tx } = require('../db');
const { appendAudit } = require('../chain');
const { notify } = require('../notify');
const { isUuid } = require('../validators');
const { requestForUser } = require('../services/access');
const { requireAuth, requireVerifiedLawyer, ah } = require('../middleware/auth');

const router = express.Router();
const STAGES = ['Case accepted', 'Documents being prepared', 'Complaint filed / FIR registered', 'Investigation ongoing', 'Court proceedings', 'Hearing scheduled', 'Judgment / closed', 'Other'];
const notFound = (res) => res.status(404).json({ error: 'not_found', message: 'Not found.' });

function validDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  return d.getTime() >= today.getTime() - 86400000; // today or later (one day of slack for time zones)
}

router.get('/requests/:id/tracking', requireAuth, ah(async (req, res) => {
  if (!isUuid(req.params.id)) return notFound(res);
  const x = await requestForUser(pool, req.user, req.params.id);
  if (!x) return notFound(res);
  if (!(x.status === 'ACCEPTED' || (x.side === 'VICTIM' && x.status === 'WITHDRAWN'))) return res.status(403).json({ error: 'forbidden', message: 'Access denied.' });
  const upd = await pool.query(`SELECT update_id, stage, note, created_at FROM case_updates WHERE case_id = $1 ORDER BY created_at DESC LIMIT 100`, [x.case_id]);
  const dates = await pool.query(`SELECT date_id, title, to_char(event_date, 'YYYY-MM-DD') AS event_date FROM case_dates WHERE case_id = $1 ORDER BY event_date`, [x.case_id]);
  res.json({ stages: STAGES, updates: upd.rows, dates: dates.rows, canEdit: x.side === 'LAWYER' && x.status === 'ACCEPTED' });
}));

router.post('/requests/:id/tracking/update', requireAuth, requireVerifiedLawyer, ah(async (req, res) => {
  if (!isUuid(req.params.id)) return notFound(res);
  const x = await requestForUser(pool, req.user, req.params.id);
  if (!x || x.side !== 'LAWYER') return notFound(res);
  if (x.status !== 'ACCEPTED') return res.status(403).json({ error: 'forbidden', message: 'You are not representing this case.' });
  const b = req.body || {};
  if (!STAGES.includes(b.stage)) return res.status(400).json({ error: 'validation', message: 'Please choose a stage.' });
  const date = b.date && (b.date.title || b.date.eventDate) ? b.date : null;
  if (date && (!String(date.title || '').trim() || !validDate(date.eventDate))) return res.status(400).json({ error: 'validation', message: 'Please give the date a title and a valid date that is not in the past.' });
  await tx(async (client) => {
    await client.query('INSERT INTO case_updates (case_id, stage, note, updated_by) VALUES ($1,$2,$3,$4)', [x.case_id, b.stage, b.note ? String(b.note).trim().slice(0, 1000) : null, req.user.id]);
    if (date) await client.query('INSERT INTO case_dates (case_id, title, event_date, created_by) VALUES ($1,$2,$3,$4)', [x.case_id, String(date.title).trim().slice(0, 120), date.eventDate, req.user.id]);
    await appendAudit(client, { actorId: req.user.id, action: 'CASE_STAGE_UPDATED', entityType: 'case', entityId: x.case_id, ip: req.ip });
    await notify(x.victim_id, 'case_update', '/cases/' + x.case_id + '/representation', client);
  });
  res.status(201).json({ saved: true });
}));

module.exports = router;
