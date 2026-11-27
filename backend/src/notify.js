'use strict';
// In-app notifications. Text is always neutral: it never contains case details (NFR-2.3, FR-8.3).
const { pool } = require('./db');

async function notify(userId, type, link, client) {
  try {
    await (client || pool).query(
      `INSERT INTO notifications (user_id, type, neutral_text, link) VALUES ($1, $2, 'You have a new update.', $3)`,
      [userId, type, link || null]);
  } catch (e) { console.error('Notification failed:', e.message); }
}

module.exports = { notify };
