'use strict';
// Cases: create a case with its own encryption key, list the victim's own cases.
const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const { pool, tx } = require('../db');
const { randomKey, wrapKey } = require('../crypto');
const { appendAudit } = require('../chain');
const { isUuid } = require('../validators');
const { requireAuth, requireRole, ah } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireRole('VICTIM'));

const CASE_SELECT = `SELECT c.case_id, c.reference_code, c.status, c.created_at, cc.code AS category_code, cc.name_en AS category_name_en, cc.name_ur AS category_name_ur,
            (SELECT count(*) FROM evidence_items e WHERE e.case_id = c.case_id AND NOT e.is_deleted)::int AS evidence_count,
            (SELECT rr.request_id FROM representation_requests rr WHERE rr.case_id = c.case_id AND rr.status = 'ACCEPTED' ORDER BY rr.created_at DESC LIMIT 1) AS accepted_request_id
     FROM cases c LEFT JOIN case_categories cc ON cc.category_id = c.category_id`;

// Neutral reference code, e.g. SV-2026-0412. It never contains personal or case details.
const newReference = () => `SV-${new Date().getFullYear()}-${String(crypto.randomInt(0, 10000)).padStart(4, '0')}`;

router.post('/', ah(async (req, res) => {
  const wrapped = wrapKey(config.masterKey, randomKey());
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const id = await tx(async (client) => {
        const r = await client.query(
          `INSERT INTO cases (victim_id, reference_code, status, wrapped_case_key) VALUES ($1, $2, 'DRAFT', $3) RETURNING case_id`,
          [req.user.id, newReference(), wrapped]);
        await appendAudit(client, { actorId: req.user.id, action: 'CASE_CREATED', entityType: 'case', entityId: r.rows[0].case_id, ip: req.ip });
        return r.rows[0].case_id;
      });
      const c = await pool.query(CASE_SELECT + ' WHERE c.case_id = $1', [id]);
      return res.status(201).json({ case: c.rows[0] });
    } catch (e) {
      if (e.code !== '23505') throw e; // reference code collision: try another code
    }
  }
  res.status(500).json({ error: 'server_error', message: 'Could not create the case. Please try again.' });
}));

router.get('/', ah(async (req, res) => {
  const r = await pool.query(CASE_SELECT + ' WHERE c.victim_id = $1 ORDER BY c.created_at DESC', [req.user.id]);
  res.json({ cases: r.rows });
}));

router.get('/:caseId', ah(async (req, res) => {
  if (!isUuid(req.params.caseId)) return res.status(404).json({ error: 'not_found', message: 'Case not found.' });
  const r = await pool.query(CASE_SELECT + ' WHERE c.case_id = $1 AND c.victim_id = $2', [req.params.caseId, req.user.id]);
  if (!r.rows.length) return res.status(404).json({ error: 'not_found', message: 'Case not found.' });
  res.json({ case: r.rows[0] });
}));

module.exports = router;
