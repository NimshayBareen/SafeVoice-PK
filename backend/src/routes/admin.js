'use strict';
// UC-18 Verify Lawyer Credentials, UC-19 Manage Legal Knowledge Base and Support Directory, UC-20 Review Audit Logs and Misuse Reports
const express = require('express');
const { pool, tx } = require('../db');
const { appendAudit, auditHash } = require('../chain');
const { notify } = require('../notify');
const { isUuid } = require('../validators');
const { requireAuth, requireRole, ah } = require('../middleware/auth');

const router = express.Router();
router.use('/admin', requireAuth, requireRole('ADMIN'));
const notFound = (res, m = 'Not found.') => res.status(404).json({ error: 'not_found', message: m });

// ============================================================ stats
router.get('/admin/stats', ah(async (req, res) => {
  const q = (sql) => pool.query(sql).then((r) => r.rows);
  const [users, lawyers, reqs, misc] = await Promise.all([
    q(`SELECT role, count(*)::int AS n FROM users GROUP BY role`),
    q(`SELECT verification_status, count(*)::int AS n FROM lawyer_profiles GROUP BY verification_status`),
    q(`SELECT status, count(*)::int AS n FROM representation_requests GROUP BY status`),
    q(`SELECT (SELECT count(*) FROM cases)::int AS cases, (SELECT count(*) FROM evidence_items WHERE NOT is_deleted)::int AS evidence,
              (SELECT count(*) FROM misuse_reports WHERE status = 'OPEN')::int AS open_reports, (SELECT count(*) FROM audit_logs)::int AS audit_entries`),
  ]);
  res.json({ users, lawyers, requests: reqs, ...misc[0] });
}));

// ============================================================ UC-18 lawyer verification
router.get('/admin/lawyers', ah(async (req, res) => {
  const st = ['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'MORE_INFO_REQUIRED'].includes(req.query.status) ? req.query.status : null;
  const r = await pool.query(
    `SELECT lp.lawyer_id, lp.full_name, lp.bar_council_no, lp.bar_council_name, lp.city, lp.languages, lp.fee_type, lp.bio, lp.verification_status, lp.verification_note, lp.verified_at,
            u.email, u.status AS account_status,
            COALESCE((SELECT json_agg(json_build_object('doc_id', d.doc_id, 'doc_type', d.doc_type, 'name', d.original_filename, 'uploaded_at', d.uploaded_at) ORDER BY d.uploaded_at) FROM lawyer_documents d WHERE d.lawyer_id = lp.lawyer_id), '[]'::json) AS documents
     FROM lawyer_profiles lp JOIN users u ON u.user_id = lp.user_id
     WHERE ($1::text IS NULL OR lp.verification_status = $1) ORDER BY lp.verification_status = 'PENDING_VERIFICATION' DESC, lp.full_name`, [st]);
  res.json({ lawyers: r.rows });
}));

router.post('/admin/lawyers/:id/decision', ah(async (req, res) => {
  if (!isUuid(req.params.id)) return notFound(res);
  const map = { APPROVE: 'VERIFIED', REJECT: 'REJECTED', MORE_INFO: 'MORE_INFO_REQUIRED' };
  const status = map[req.body && req.body.decision];
  const note = String((req.body && req.body.note) || '').trim().slice(0, 500);
  if (!status) return res.status(400).json({ error: 'validation', message: 'Please choose approve, reject or request more information.' });
  if (status !== 'VERIFIED' && note.length < 3) return res.status(400).json({ error: 'validation', message: 'Please write a short note for the lawyer.' });
  const lp = (await pool.query('SELECT lawyer_id, user_id FROM lawyer_profiles WHERE lawyer_id = $1', [req.params.id])).rows[0];
  if (!lp) return notFound(res, 'Lawyer not found.');
  await tx(async (client) => {
    await client.query(
      `UPDATE lawyer_profiles SET verification_status = $2::varchar, verification_note = $3, verified_by = $4, verified_at = CASE WHEN $2::varchar = 'VERIFIED'::varchar THEN now() ELSE NULL END WHERE lawyer_id = $1`,
      [lp.lawyer_id, status, note || null, req.user.id]);
    await appendAudit(client, { actorId: req.user.id, action: 'LAWYER_' + status, entityType: 'lawyer', entityId: lp.lawyer_id, ip: req.ip });
    await notify(lp.user_id, 'profile_update', '/lawyer/profile', client);
  });
  res.json({ status });
}));

// ============================================================ UC-19 knowledge base (generic, field-whitelisted)
const REVIEW = { versioned: true };
const E = {
  categories: { table: 'case_categories', pk: 'category_id', order: 'name_en', fields: [
    { name: 'code', type: 'text', required: true, pattern: /^[A-Z0-9_]{3,40}$/, hint: 'Capital letters, digits and _ only, e.g. CYBER_HARASSMENT' },
    { name: 'name_en', type: 'text', required: true }, { name: 'name_ur', type: 'text' }, { name: 'description', type: 'textarea' }, { name: 'is_active', type: 'bool', default: true }] },
  statutes: { table: 'statutes', pk: 'statute_id', order: 'name', ...REVIEW, reviewCol: 'last_reviewed_on', fields: [
    { name: 'short_code', type: 'text', required: true, pattern: /^[A-Za-z0-9_]{2,30}$/ }, { name: 'name', type: 'text', required: true }, { name: 'year', type: 'number' }] },
  offences: { table: 'offences', pk: 'offence_id', order: 'title_en', fields: [
    { name: 'statute_id', type: 'select', lookup: 'statutes', required: true }, { name: 'code', type: 'text', pattern: /^[A-Z0-9_]{2,40}$/ },
    { name: 'title_en', type: 'text', required: true }, { name: 'title_ur', type: 'text' }, { name: 'section_ref', type: 'text' },
    { name: 'ingredients_text', type: 'textarea' }, { name: 'is_active', type: 'bool', default: true }] },
  forums: { table: 'forums', pk: 'forum_id', order: 'name_en', fields: [
    { name: 'code', type: 'text', pattern: /^[A-Z0-9_]{2,40}$/ }, { name: 'name_en', type: 'text', required: true }, { name: 'name_ur', type: 'text' },
    { name: 'forum_type', type: 'enum', options: ['INVESTIGATION', 'POLICE', 'REGULATOR', 'PROTECTION', 'COURT', 'OTHER'], required: true }, { name: 'contact_info', type: 'textarea' }] },
  rules: { table: 'legal_rules', pk: 'rule_id', order: 'title', ...REVIEW, reviewCol: 'review_date', fields: [
    { name: 'title', type: 'text', required: true }, { name: 'category_id', type: 'select', lookup: 'categories', hint: 'Leave empty for a rule that applies to every category' },
    { name: 'offence_id', type: 'select', lookup: 'offences', required: true }, { name: 'forum_id', type: 'select', lookup: 'forums', required: true },
    { name: 'condition_json', type: 'json', required: true, hint: '{"all":[{"q":"question_key","op":"eq","v":"yes"}]}  Operators: eq, ne, in, exists. {} means always.' },
    { name: 'procedure_text_en', type: 'textarea', required: true, hint: 'One step per line' }, { name: 'procedure_text_ur', type: 'textarea' }, { name: 'is_active', type: 'bool', default: true }] },
  questions: { table: 'intake_questions', pk: 'question_id', order: 'display_order', fields: [
    { name: 'q_key', type: 'text', required: true, pattern: /^[a-z0-9_]{2,40}$/, hint: 'Lower-case key used in rules, e.g. money_demanded' },
    { name: 'text_en', type: 'textarea', required: true }, { name: 'text_ur', type: 'textarea' },
    { name: 'answer_type', type: 'enum', options: ['SINGLE', 'YESNO', 'TEXT', 'DATE'], required: true },
    { name: 'options_json', type: 'json', hint: '[{"value":"yes","label_en":"Yes","label_ur":"جی ہاں"}]. For the first question add "category":"CODE" to each option.' },
    { name: 'applies_to', type: 'tags', hint: 'Category codes separated by commas. Empty = shown for every category.' },
    { name: 'display_order', type: 'number', default: 100 }, { name: 'is_mandatory', type: 'bool', default: false }, { name: 'is_active', type: 'bool', default: true }] },
  support: { table: 'support_entries', pk: 'entry_id', order: 'name', extraCategories: true, fields: [
    { name: 'name', type: 'text', required: true }, { name: 'name_ur', type: 'text' }, { name: 'entry_type', type: 'enum', options: ['HELPLINE', 'SHELTER', 'NGO', 'GOV_OFFICE'], required: true },
    { name: 'city', type: 'text' }, { name: 'is_national', type: 'bool', default: false }, { name: 'phone', type: 'text' }, { name: 'address', type: 'textarea' },
    { name: 'website', type: 'text' }, { name: 'description', type: 'textarea' }, { name: 'is_active', type: 'bool', default: true }] },
};

function validateCondition(c) {
  if (typeof c !== 'object' || c === null || Array.isArray(c)) return 'The condition must be a JSON object.';
  if (c.all === undefined) return Object.keys(c).length === 0 ? null : 'Use {"all":[...]} or {}.';
  if (!Array.isArray(c.all)) return '"all" must be a list.';
  for (const x of c.all) {
    if (!x || typeof x.q !== 'string' || !['eq', 'ne', 'in', 'exists'].includes(x.op)) return 'Each condition needs "q" and an operator (eq, ne, in, exists).';
    if (x.op === 'in' && !Array.isArray(x.v)) return 'The operator "in" needs a list value.';
  }
  return null;
}
function validateOptions(o) {
  if (o === null) return null;
  if (!Array.isArray(o) || o.some((x) => !x || typeof x.value !== 'string' || typeof x.label_en !== 'string')) return 'Options must be a list of {"value","label_en"} objects.';
  return null;
}

// Converts the incoming value to something safe to store. Returns { value } or { error }.
function coerce(f, raw) {
  const empty = raw === undefined || raw === null || raw === '';
  if (empty) {
    if (f.required && f.type !== 'bool') return { error: `${f.name} is required.` };
    return { value: f.type === 'bool' ? !!f.default : null };
  }
  switch (f.type) {
    case 'text': case 'textarea': {
      const s = String(raw).trim().slice(0, f.type === 'text' ? 300 : 6000);
      if (f.pattern && !f.pattern.test(s)) return { error: `${f.name} has the wrong format.` };
      return { value: s };
    }
    case 'number': { const n = Number(raw); return Number.isFinite(n) ? { value: Math.trunc(n) } : { error: `${f.name} must be a number.` }; }
    case 'bool': return { value: raw === true || raw === 'true' || raw === 1 };
    case 'select': return isUuid(String(raw)) ? { value: String(raw) } : { error: `${f.name} must be chosen from the list.` };
    case 'enum': return f.options.includes(raw) ? { value: raw } : { error: `${f.name} must be one of ${f.options.join(', ')}.` };
    case 'tags': {
      const arr = (Array.isArray(raw) ? raw : String(raw).split(',')).map((x) => String(x).trim().toUpperCase()).filter(Boolean).slice(0, 20);
      return { value: arr };
    }
    case 'json': {
      let v = raw;
      if (typeof raw === 'string') { try { v = JSON.parse(raw); } catch (_) { return { error: `${f.name} is not valid JSON.` }; } }
      const err = f.name === 'condition_json' ? validateCondition(v) : f.name === 'options_json' ? validateOptions(v) : null;
      return err ? { error: err } : { value: JSON.stringify(v) };
    }
    default: return { error: `${f.name} is not supported.` };
  }
}

const castFor = (f) => (f.type === 'json' ? '::jsonb' : f.type === 'tags' ? '::text[]' : '');

async function listEntity(ent) {
  const extra = ent.extraCategories
    ? `, COALESCE((SELECT array_agg(cc.code ORDER BY cc.code) FROM support_entry_categories sc JOIN case_categories cc ON cc.category_id = sc.category_id WHERE sc.entry_id = t.${ent.pk}), '{}') AS categories`
    : '';
  const r = await pool.query(`SELECT t.*${extra} FROM ${ent.table} t ORDER BY ${ent.order === 'display_order' ? 't.display_order, t.q_key' : 't.' + ent.order}`);
  return r.rows;
}

router.get('/admin/kb/schema', (req, res) => {
  const out = {};
  for (const [k, e] of Object.entries(E)) {
    out[k] = { pk: e.pk, versioned: !!e.versioned, extraCategories: !!e.extraCategories,
      fields: e.fields.map((f) => ({ name: f.name, type: f.type, required: !!f.required, options: f.options || null, lookup: f.lookup || null, hint: f.hint || null, default: f.default === undefined ? null : f.default })) };
  }
  res.json({ entities: out });
});

router.get('/admin/kb/lookups', ah(async (req, res) => {
  const q = (sql) => pool.query(sql).then((r) => r.rows);
  const [categories, statutes, offences, forums] = await Promise.all([
    q('SELECT category_id AS id, name_en AS label, code FROM case_categories ORDER BY name_en'),
    q('SELECT statute_id AS id, short_code AS label FROM statutes ORDER BY short_code'),
    q(`SELECT o.offence_id AS id, s.short_code || ' ' || COALESCE(o.section_ref, '') || ': ' || o.title_en AS label FROM offences o JOIN statutes s ON s.statute_id = o.statute_id ORDER BY 2`),
    q('SELECT forum_id AS id, name_en AS label FROM forums ORDER BY name_en'),
  ]);
  res.json({ categories, statutes, offences, forums });
}));

router.get('/admin/kb/:entity', ah(async (req, res) => {
  const ent = E[req.params.entity]; if (!ent) return notFound(res);
  res.json({ rows: await listEntity(ent) });
}));

async function saveCategories(client, entryId, codes) {
  await client.query('DELETE FROM support_entry_categories WHERE entry_id = $1', [entryId]);
  if (codes.length) await client.query('INSERT INTO support_entry_categories (entry_id, category_id) SELECT $1::uuid, category_id FROM case_categories WHERE code = ANY($2::text[])', [entryId, codes]);
}

router.post('/admin/kb/:entity', ah(async (req, res) => {
  const ent = E[req.params.entity]; if (!ent) return notFound(res);
  const cols = []; const vals = []; const holders = []; const errors = [];
  for (const f of ent.fields) {
    const c = coerce(f, req.body[f.name]);
    if (c.error) { errors.push(c.error); continue; }
    cols.push(f.name); vals.push(c.value); holders.push(`$${vals.length}${castFor(f)}`);
  }
  if (errors.length) return res.status(400).json({ error: 'validation', messages: errors });
  try {
    const row = await tx(async (client) => {
      const r = await client.query(`INSERT INTO ${ent.table} (${cols.join(',')}) VALUES (${holders.join(',')}) RETURNING *`, vals);
      if (ent.extraCategories) await saveCategories(client, r.rows[0][ent.pk], Array.isArray(req.body.categories) ? req.body.categories.map(String) : []);
      await appendAudit(client, { actorId: req.user.id, action: 'KB_CHANGE', entityType: req.params.entity, entityId: r.rows[0][ent.pk], details: { op: 'create' }, ip: req.ip });
      return r.rows[0];
    });
    res.status(201).json({ row });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'duplicate', message: 'An entry with the same code or key already exists.' });
    if (e.code === '23503') return res.status(400).json({ error: 'validation', message: 'A selected item does not exist.' });
    throw e;
  }
}));

router.put('/admin/kb/:entity/:id', ah(async (req, res) => {
  const ent = E[req.params.entity]; if (!ent) return notFound(res);
  if (!isUuid(req.params.id)) return notFound(res);
  const sets = []; const vals = []; const errors = [];
  for (const f of ent.fields) {
    if (req.body[f.name] === undefined) continue;
    const c = coerce(f, req.body[f.name]);
    if (c.error) { errors.push(c.error); continue; }
    vals.push(c.value); sets.push(`${f.name} = $${vals.length}${castFor(f)}`);
  }
  if (errors.length) return res.status(400).json({ error: 'validation', messages: errors });
  if (!sets.length && !ent.extraCategories) return res.status(400).json({ error: 'validation', message: 'Nothing to change.' });
  if (ent.versioned) sets.push('version = version + 1', `${ent.reviewCol} = CURRENT_DATE`);
  vals.push(req.params.id); let where = `${ent.pk} = $${vals.length}`;
  const ev = req.body.expected_version;
  if (ent.versioned && ev !== undefined && ev !== null) { vals.push(Number(ev)); where += ` AND version = $${vals.length}`; }
  try {
    const row = await tx(async (client) => {
      let r;
      if (sets.length) r = await client.query(`UPDATE ${ent.table} SET ${sets.join(', ')} WHERE ${where} RETURNING *`, vals);
      else r = await client.query(`SELECT * FROM ${ent.table} WHERE ${ent.pk} = $1`, [req.params.id]);
      if (!r.rows.length) return null;
      if (ent.extraCategories && Array.isArray(req.body.categories)) await saveCategories(client, req.params.id, req.body.categories.map(String));
      await appendAudit(client, { actorId: req.user.id, action: 'KB_CHANGE', entityType: req.params.entity, entityId: req.params.id, details: { op: 'update' }, ip: req.ip });
      return r.rows[0];
    });
    if (!row) {
      const exists = await pool.query(`SELECT 1 FROM ${ent.table} WHERE ${ent.pk} = $1`, [req.params.id]);
      if (exists.rows.length) return res.status(409).json({ error: 'conflict', message: 'Someone else changed this entry. Please reload and try again.' });
      return notFound(res);
    }
    res.json({ row });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'duplicate', message: 'An entry with the same code or key already exists.' });
    if (e.code === '23503') return res.status(400).json({ error: 'validation', message: 'A selected item does not exist.' });
    throw e;
  }
}));

router.delete('/admin/kb/:entity/:id', ah(async (req, res) => {
  const ent = E[req.params.entity]; if (!ent) return notFound(res);
  if (!isUuid(req.params.id)) return notFound(res);
  try {
    const r = await tx(async (client) => {
      const d = await client.query(`DELETE FROM ${ent.table} WHERE ${ent.pk} = $1`, [req.params.id]);
      if (d.rowCount) await appendAudit(client, { actorId: req.user.id, action: 'KB_CHANGE', entityType: req.params.entity, entityId: req.params.id, details: { op: 'delete' }, ip: req.ip });
      return d.rowCount;
    });
    if (!r) return notFound(res);
    res.json({ deleted: true });
  } catch (e) {
    if (e.code === '23503') return res.status(409).json({ error: 'in_use', message: 'This entry is used elsewhere. Deactivate it instead of deleting it.' });
    throw e;
  }
}));

// ============================================================ UC-20 audit logs
function auditFilter(q) {
  const conds = []; const params = [];
  if (q.actor) { params.push('%' + String(q.actor).slice(0, 80) + '%'); conds.push(`(u.email ILIKE $${params.length} OR u.alias ILIKE $${params.length})`); }
  if (q.action) { params.push(String(q.action).slice(0, 40)); conds.push(`a.action = $${params.length}`); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.from || '')) { params.push(q.from); conds.push(`a.created_at >= $${params.length}::date`); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(q.to || '')) { params.push(q.to); conds.push(`a.created_at < ($${params.length}::date + 1)`); }
  return { where: conds.length ? 'WHERE ' + conds.join(' AND ') : '', params };
}
const AUDIT_SELECT = `SELECT a.audit_id, a.created_at, a.action, a.entity_type, a.entity_id, host(a.ip_address) AS ip, u.email AS actor_email, u.role AS actor_role, a.entry_hash
     FROM audit_logs a LEFT JOIN users u ON u.user_id = a.actor_id`;

router.get('/admin/audit', ah(async (req, res) => {
  const f = auditFilter(req.query);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const total = (await pool.query(`SELECT count(*)::int AS n FROM audit_logs a LEFT JOIN users u ON u.user_id = a.actor_id ${f.where}`, f.params)).rows[0].n;
  const r = await pool.query(`${AUDIT_SELECT} ${f.where} ORDER BY a.audit_id DESC LIMIT ${limit} OFFSET ${offset}`, f.params);
  const actions = (await pool.query('SELECT DISTINCT action FROM audit_logs ORDER BY action')).rows.map((x) => x.action);
  res.json({ total, entries: r.rows, actions });
}));

router.get('/admin/audit/verify', ah(async (req, res) => {
  let last = 0; let prev = null; let checked = 0;
  for (;;) {
    const r = await pool.query(
      `SELECT audit_id, actor_id, action, entity_type, entity_id, created_at, prev_hash, entry_hash FROM audit_logs WHERE audit_id > $1 ORDER BY audit_id LIMIT 5000`, [last]);
    if (!r.rows.length) break;
    for (const row of r.rows) {
      const ph = row.prev_hash ? row.prev_hash.trim() : null;
      if (ph !== prev || auditHash(prev, row) !== row.entry_hash.trim()) return res.json({ valid: false, checked, brokenAtId: row.audit_id });
      prev = row.entry_hash.trim(); checked++; last = row.audit_id;
    }
  }
  res.json({ valid: true, checked, brokenAtId: null });
}));

router.get('/admin/audit/export.csv', ah(async (req, res) => {
  const f = auditFilter(req.query);
  const r = await pool.query(`${AUDIT_SELECT} ${f.where} ORDER BY a.audit_id DESC LIMIT 5000`, f.params);
  const esc = (v) => { const s = v === null || v === undefined ? '' : String(v instanceof Date ? v.toISOString() : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const lines = ['audit_id,time,action,actor,role,entity_type,entity_id,ip,entry_hash'];
  for (const x of r.rows) lines.push([x.audit_id, x.created_at, x.action, x.actor_email, x.actor_role, x.entity_type, x.entity_id, x.ip, x.entry_hash.trim()].map(esc).join(','));
  await tx((client) => appendAudit(client, { actorId: req.user.id, action: 'AUDIT_EXPORTED', entityType: 'audit', details: { rows: r.rows.length }, ip: req.ip }));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="audit_log.csv"');
  res.send(lines.join('\n'));
}));

// ============================================================ misuse reports and accounts
router.get('/admin/reports', ah(async (req, res) => {
  const st = ['OPEN', 'REVIEWED', 'ACTION_TAKEN', 'DISMISSED'].includes(req.query.status) ? req.query.status : null;
  const r = await pool.query(
    `SELECT m.report_id, m.reason, m.details, m.status, m.action_taken, m.created_at, m.reviewed_at,
            rp.email AS reporter_email, rp.role AS reporter_role, ru.user_id AS reported_user_id, ru.email AS reported_email, ru.role AS reported_role, ru.status AS reported_status
     FROM misuse_reports m JOIN users rp ON rp.user_id = m.reporter_id JOIN users ru ON ru.user_id = m.reported_user_id
     WHERE ($1::text IS NULL OR m.status = $1) ORDER BY (m.status = 'OPEN') DESC, m.created_at DESC LIMIT 200`, [st]);
  res.json({ reports: r.rows });
}));

router.post('/admin/reports/:id/action', ah(async (req, res) => {
  if (!isUuid(req.params.id)) return notFound(res);
  const action = req.body && req.body.action;
  if (!['WARN', 'SUSPEND', 'DISMISS'].includes(action)) return res.status(400).json({ error: 'validation', message: 'Please choose warn, suspend or dismiss.' });
  const m = (await pool.query('SELECT report_id, reported_user_id, status FROM misuse_reports WHERE report_id = $1', [req.params.id])).rows[0];
  if (!m) return notFound(res);
  const target = (await pool.query('SELECT role FROM users WHERE user_id = $1', [m.reported_user_id])).rows[0];
  if (action === 'SUSPEND' && target.role === 'ADMIN') return res.status(400).json({ error: 'validation', message: 'Administrator accounts cannot be suspended here.' });
  await tx(async (client) => {
    await client.query(`UPDATE misuse_reports SET status = $2, action_taken = $3, reviewed_by = $4, reviewed_at = now() WHERE report_id = $1`,
      [m.report_id, action === 'DISMISS' ? 'DISMISSED' : 'ACTION_TAKEN', action, req.user.id]);
    if (action === 'SUSPEND') await client.query(`UPDATE users SET status = 'SUSPENDED' WHERE user_id = $1`, [m.reported_user_id]);
    if (action === 'WARN') await notify(m.reported_user_id, 'warning', null, client);
    await appendAudit(client, { actorId: req.user.id, action: 'REPORT_' + action, entityType: 'report', entityId: m.report_id, ip: req.ip });
  });
  res.json({ status: action === 'DISMISS' ? 'DISMISSED' : 'ACTION_TAKEN' });
}));

router.get('/admin/users', ah(async (req, res) => {
  const role = ['VICTIM', 'LAWYER', 'ADMIN'].includes(req.query.role) ? req.query.role : null;
  const q = typeof req.query.q === 'string' && req.query.q.trim() ? req.query.q.trim().slice(0, 80) : null;
  const r = await pool.query(
    `SELECT user_id, email, role, alias, status, created_at, last_login_at FROM users
     WHERE ($1::text IS NULL OR role = $1) AND ($2::text IS NULL OR email ILIKE '%' || $2 || '%' OR alias ILIKE '%' || $2 || '%') ORDER BY created_at DESC LIMIT 100`, [role, q]);
  res.json({ users: r.rows });
}));

router.post('/admin/users/:id/status', ah(async (req, res) => {
  if (!isUuid(req.params.id)) return notFound(res);
  const status = req.body && req.body.status;
  if (!['ACTIVE', 'SUSPENDED'].includes(status)) return res.status(400).json({ error: 'validation', message: 'Invalid status.' });
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'validation', message: 'You cannot change your own account.' });
  const u = (await pool.query('SELECT role FROM users WHERE user_id = $1', [req.params.id])).rows[0];
  if (!u) return notFound(res);
  if (u.role === 'ADMIN') return res.status(400).json({ error: 'validation', message: 'Administrator accounts cannot be changed here.' });
  await tx(async (client) => {
    await client.query('UPDATE users SET status = $2 WHERE user_id = $1', [req.params.id, status]);
    await appendAudit(client, { actorId: req.user.id, action: 'USER_' + status, entityType: 'user', entityId: req.params.id, ip: req.ip });
  });
  res.json({ status });
}));

module.exports = router;
