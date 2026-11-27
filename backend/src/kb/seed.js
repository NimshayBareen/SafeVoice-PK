'use strict';
// Loads the starter knowledge base. Idempotent: it only adds what is missing and never overwrites administrator edits.
const data = require('./data');

async function seedKnowledgeBase(db) {
  const added = { categories: 0, statutes: 0, offences: 0, forums: 0, rules: 0, questions: 0, support: 0 };
  const ins = async (sql, params) => (await db.query(sql, params)).rowCount;

  for (const c of data.categories) added.categories += await ins(
    'INSERT INTO case_categories (code, name_en, name_ur, description) VALUES ($1,$2,$3,$4) ON CONFLICT (code) DO NOTHING', [c.code, c.name_en, c.name_ur, c.description]);
  for (const s of data.statutes) added.statutes += await ins(
    'INSERT INTO statutes (short_code, name, year, last_reviewed_on) VALUES ($1,$2,$3,$4) ON CONFLICT (short_code) DO NOTHING', [s.short_code, s.name, s.year, data.REVIEW]);
  const statuteId = Object.fromEntries((await db.query('SELECT short_code, statute_id FROM statutes')).rows.map((r) => [r.short_code, r.statute_id]));
  for (const o of data.offences) added.offences += await ins(
    `INSERT INTO offences (statute_id, code, title_en, title_ur, section_ref, ingredients_text) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (code) DO NOTHING`,
    [statuteId[o.statute], o.code, o.title_en, o.title_ur, o.section_ref, o.ingredients_text]);
  for (const f of data.forums) added.forums += await ins(
    'INSERT INTO forums (code, name_en, name_ur, forum_type, contact_info) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (code) DO NOTHING', [f.code, f.name_en, f.name_ur, f.forum_type, f.contact_info]);

  const catId = Object.fromEntries((await db.query('SELECT code, category_id FROM case_categories')).rows.map((r) => [r.code, r.category_id]));
  const offId = Object.fromEntries((await db.query('SELECT code, offence_id FROM offences')).rows.map((r) => [r.code, r.offence_id]));
  const forId = Object.fromEntries((await db.query('SELECT code, forum_id FROM forums')).rows.map((r) => [r.code, r.forum_id]));

  for (const r of data.rules) {
    const category = r.category ? catId[r.category] : null;
    const exists = await db.query(
      'SELECT 1 FROM legal_rules WHERE title = $1 AND offence_id = $2 AND forum_id = $3 AND category_id IS NOT DISTINCT FROM $4', [r.title, offId[r.offence], forId[r.forum], category]);
    if (exists.rows.length) continue;
    added.rules += await ins(
      `INSERT INTO legal_rules (category_id, offence_id, forum_id, title, condition_json, procedure_text_en, procedure_text_ur, review_date)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)`,
      [category, offId[r.offence], forId[r.forum], r.title, JSON.stringify(r.condition), r.en, r.ur, data.REVIEW]);
  }

  for (const q of data.questions) added.questions += await ins(
    `INSERT INTO intake_questions (q_key, applies_to, text_en, text_ur, answer_type, options_json, display_order, is_mandatory)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8) ON CONFLICT (q_key) DO NOTHING`,
    [q.q_key, q.applies, q.en, q.ur, q.type, q.options ? JSON.stringify(q.options) : null, q.order, q.mandatory]);

  for (const s of data.support) {
    const exists = await db.query('SELECT entry_id FROM support_entries WHERE name = $1', [s.name]);
    if (exists.rows.length) continue;
    const r = await db.query(
      `INSERT INTO support_entries (name, name_ur, entry_type, city, is_national, phone, description) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING entry_id`,
      [s.name, s.name_ur, s.entry_type, s.city, s.national, s.phone, s.description]);
    added.support++;
    for (const code of s.cats) await db.query('INSERT INTO support_entry_categories (entry_id, category_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [r.rows[0].entry_id, catId[code]]);
  }
  return added;
}

module.exports = { seedKnowledgeBase };
