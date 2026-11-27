'use strict';
// UC-12 Exchange Secure Messages (text is encrypted with the case key before it is stored)
const express = require('express');
const config = require('../config');
const { pool } = require('../db');
const { unwrapKey, seal, unsealText } = require('../crypto');
const { notify } = require('../notify');
const { isUuid } = require('../validators');
const { requestForUser } = require('../services/access');
const { requireAuth, ah } = require('../middleware/auth');

const router = express.Router();
const notFound = (res) => res.status(404).json({ error: 'not_found', message: 'Not found.' });

// Lawyers may use messaging only while the request is ACCEPTED. A victim can still read the history after withdrawing.
function canRead(x) { return x.status === 'ACCEPTED' || (x.side === 'VICTIM' && x.status === 'WITHDRAWN'); }

router.get('/requests/:id/messages', requireAuth, ah(async (req, res) => {
  if (!isUuid(req.params.id)) return notFound(res);
  const x = await requestForUser(pool, req.user, req.params.id);
  if (!x) return notFound(res);
  if (!canRead(x)) return res.status(403).json({ error: 'messaging_closed', message: 'Messaging is available only while the lawyer is representing you.' });
  const key = unwrapKey(config.masterKey, x.wrapped_case_key);
  const r = await pool.query('SELECT message_id, sender_id, body_encrypted, sent_at FROM messages WHERE request_id = $1 ORDER BY sent_at ASC LIMIT 500', [x.request_id]);
  await pool.query('UPDATE messages SET read_at = now() WHERE request_id = $1 AND sender_id <> $2 AND read_at IS NULL', [x.request_id, req.user.id]);
  res.json({
    open: x.status === 'ACCEPTED',
    messages: r.rows.map((m) => {
      let text = '';
      try { text = unsealText(key, m.body_encrypted); } catch (_) { text = '[message could not be read]'; }
      return { id: m.message_id, mine: m.sender_id === req.user.id, text, sent_at: m.sent_at };
    }),
  });
}));

router.post('/requests/:id/messages', requireAuth, ah(async (req, res) => {
  if (!isUuid(req.params.id)) return notFound(res);
  const x = await requestForUser(pool, req.user, req.params.id);
  if (!x) return notFound(res);
  if (x.status !== 'ACCEPTED') return res.status(403).json({ error: 'messaging_closed', message: 'Messaging is available only while the lawyer is representing you.' });
  const text = String((req.body && req.body.text) || '').trim();
  if (!text || text.length > 2000) return res.status(400).json({ error: 'validation', message: 'Please write a message of up to 2000 characters.' });
  const key = unwrapKey(config.masterKey, x.wrapped_case_key);
  const r = await pool.query('INSERT INTO messages (request_id, sender_id, body_encrypted) VALUES ($1,$2,$3) RETURNING message_id, sent_at', [x.request_id, req.user.id, seal(key, text)]);
  const other = x.side === 'VICTIM' ? x.lawyer_user_id : x.victim_id;
  await notify(other, 'message', x.side === 'VICTIM' ? '/lawyer/requests/' + x.request_id : '/cases/' + x.case_id + '/representation');
  res.status(201).json({ message: { id: r.rows[0].message_id, mine: true, text, sent_at: r.rows[0].sent_at } });
}));

module.exports = router;
