'use strict';
// Append-only, hash-chained logs (Design Document, Sections 4.2 and 6.8).
// entry_hash = SHA-256 of [prev_hash, ...entry fields]. Changing or removing an old row breaks the chain.
// - custody_log is chained per case (one chain for each case).
// - audit_logs is one global chain.
const { sha256Hex } = require('./crypto');

function custodyHash(prev, e) {
  return sha256Hex(JSON.stringify([
    prev || null, e.evidence_id || null, e.case_id, e.actor_id || null,
    e.action, e.result || null, new Date(e.created_at).toISOString(),
  ]));
}

function auditHash(prev, e) {
  return sha256Hex(JSON.stringify([
    prev || null, e.actor_id || null, e.action, e.entity_type || null,
    e.entity_id || null, new Date(e.created_at).toISOString(),
  ]));
}

// Pure function: rows must be ordered by log_id ascending. Returns { valid, brokenAt }.
function verifyChain(rows, hashFn) {
  let prev = null;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if ((r.prev_hash || null) !== prev) return { valid: false, brokenAt: i };
    if (hashFn(prev, r) !== r.entry_hash) return { valid: false, brokenAt: i };
    prev = r.entry_hash;
  }
  return { valid: true, brokenAt: null };
}
const verifyCustodyChain = (rows) => verifyChain(rows, custodyHash);

// `client` must be a pg client that is inside a transaction (BEGIN ... COMMIT).
async function appendCustody(client, { evidenceId, caseId, actorId, action, result, ip }) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['custody:' + caseId]);
  const last = await client.query(
    'SELECT entry_hash FROM custody_log WHERE case_id = $1 ORDER BY log_id DESC LIMIT 1', [caseId]);
  const prev = last.rows[0] ? last.rows[0].entry_hash.trim() : null;
  const created_at = new Date();
  const entry = { evidence_id: evidenceId || null, case_id: caseId, actor_id: actorId || null, action, result: result || null, created_at };
  const entry_hash = custodyHash(prev, entry);
  await client.query(
    `INSERT INTO custody_log (evidence_id, case_id, actor_id, action, result, ip_address, created_at, prev_hash, entry_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [entry.evidence_id, caseId, entry.actor_id, action, entry.result, ip || null, created_at, prev, entry_hash]);
}

async function appendAudit(client, { actorId, action, entityType, entityId, details, ip }) {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['audit']);
  const last = await client.query('SELECT entry_hash FROM audit_logs ORDER BY audit_id DESC LIMIT 1');
  const prev = last.rows[0] ? last.rows[0].entry_hash.trim() : null;
  const created_at = new Date();
  const entry = { actor_id: actorId || null, action, entity_type: entityType || null, entity_id: entityId ? String(entityId) : null, created_at };
  const entry_hash = auditHash(prev, entry);
  await client.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details_json, ip_address, created_at, prev_hash, entry_hash)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)`,
    [entry.actor_id, action, entry.entity_type, entry.entity_id, details ? JSON.stringify(details) : null, ip || null, created_at, prev, entry_hash]);
}

module.exports = { custodyHash, auditHash, verifyChain, verifyCustodyChain, appendCustody, appendAudit };
