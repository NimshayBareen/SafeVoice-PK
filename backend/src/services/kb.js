'use strict';
// Loads the administrator-managed knowledge base from the database.
async function loadQuestions(db) {
  const r = await db.query(
    `SELECT question_id, q_key, applies_to, text_en, text_ur, answer_type, options_json, display_order, is_mandatory
     FROM intake_questions WHERE is_active ORDER BY display_order, q_key`);
  return r.rows;
}

async function loadRules(db) {
  const r = await db.query(
    `SELECT r.rule_id, r.title, r.condition_json, r.procedure_text_en, r.procedure_text_ur, r.version,
            to_char(r.review_date, 'YYYY-MM-DD') AS review_date, c.code AS category_code,
            o.code AS o_code, o.title_en AS o_title_en, o.title_ur AS o_title_ur, o.section_ref AS o_section_ref,
            o.ingredients_text AS o_ingredients, s.name AS statute_name, s.short_code AS statute_code,
            f.code AS f_code, f.name_en AS f_name_en, f.name_ur AS f_name_ur, f.contact_info AS f_contact
     FROM legal_rules r
     LEFT JOIN case_categories c ON c.category_id = r.category_id
     JOIN offences o ON o.offence_id = r.offence_id
     JOIN statutes s ON s.statute_id = o.statute_id
     JOIN forums f ON f.forum_id = r.forum_id
     WHERE r.is_active AND o.is_active`);
  return r.rows.map((x) => ({
    rule_id: x.rule_id, title: x.title, category_code: x.category_code, condition_json: x.condition_json,
    procedure_text_en: x.procedure_text_en, procedure_text_ur: x.procedure_text_ur, version: x.version, review_date: x.review_date,
    offence: { code: x.o_code, title_en: x.o_title_en, title_ur: x.o_title_ur, section_ref: x.o_section_ref, ingredients_text: x.o_ingredients, statute_name: x.statute_name, statute_code: x.statute_code },
    forum: { code: x.f_code, name_en: x.f_name_en, name_ur: x.f_name_ur, contact_info: x.f_contact },
  }));
}

async function loadKB(db) {
  const [cats, offs, forums, rules, support] = await Promise.all([
    db.query('SELECT * FROM case_categories WHERE is_active ORDER BY name_en'),
    db.query('SELECT o.*, s.name AS statute_name FROM offences o JOIN statutes s ON s.statute_id = o.statute_id WHERE o.is_active'),
    db.query('SELECT * FROM forums'),
    loadRules(db),
    db.query('SELECT * FROM support_entries WHERE is_active'),
  ]);
  return { categories: cats.rows, offences: offs.rows, forums: forums.rows, rules, support: support.rows };
}

module.exports = { loadQuestions, loadRules, loadKB };
