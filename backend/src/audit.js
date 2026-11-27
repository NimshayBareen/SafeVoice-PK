'use strict';
const { tx } = require('./db');
const { appendAudit } = require('./chain');

// Writes one audit entry in its own transaction. Never throws: a logging problem must not break the request.
async function writeAudit(entry) {
  try {
    await tx((client) => appendAudit(client, entry));
  } catch (e) {
    console.error('Audit write failed:', e.message);
  }
}

module.exports = { writeAudit };
