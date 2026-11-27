'use strict';
// Legal mapping engine (UC-05 and UC-06). Pure functions: no database, easy to test.
// Rules are DATA (legal_rules.condition_json), so administrators can add categories and rules without code changes.

// answers: { question_key: value }
function conditionMatches(condition, answers) {
  const all = condition && Array.isArray(condition.all) ? condition.all : [];
  return all.every((c) => {
    const have = answers[c.q];
    switch (c.op) {
      case 'eq': return have === c.v;
      case 'ne': return have !== c.v;
      case 'in': return Array.isArray(c.v) && c.v.includes(have);
      case 'exists': return have !== undefined && have !== null && have !== '';
      default: return false;
    }
  });
}

// Category comes from the selected option of the first question (option.category holds the category code).
function classify(questions, answers) {
  const q = questions.find((x) => x.q_key === 'incident_type');
  if (!q || !Array.isArray(q.options_json)) return null;
  const opt = q.options_json.find((o) => o.value === answers.incident_type);
  return opt && opt.category ? opt.category : null;
}

// rules: rows with {rule_id, category_code (null = global), title, condition_json, offence:{...}, forum:{...}, procedure_text_en/ur, version, review_date}
function mapLaw(categoryCode, rules, answers) {
  const matched = rules.filter((r) => (r.category_code === categoryCode || r.category_code === null) && conditionMatches(r.condition_json, answers));
  const offences = []; const forums = []; const steps = [];
  const seenO = new Set(); const seenF = new Set(); const seenP = new Set();
  for (const r of matched) {
    if (!seenO.has(r.offence.code)) { seenO.add(r.offence.code); offences.push(r.offence); }
    if (!seenF.has(r.forum.code)) { seenF.add(r.forum.code); forums.push(r.forum); }
    if (!seenP.has(r.forum.code)) { seenP.add(r.forum.code); steps.push({ forum: r.forum, text_en: r.procedure_text_en, text_ur: r.procedure_text_ur }); }
  }
  const dates = matched.map((r) => r.review_date).filter(Boolean).sort();
  return { matched: matched.length, offences, forums, procedures: steps, lastReviewed: dates.length ? dates[dates.length - 1] : null, ruleVersions: matched.map((r) => ({ id: r.rule_id, version: r.version })) };
}

// Which questions should the victim see for the current answers?
function visibleQuestions(questions, answers) {
  const cat = classify(questions, answers);
  return questions.filter((q) => !q.applies_to || q.applies_to.length === 0 || (cat && q.applies_to.includes(cat)));
}

function missingMandatory(questions, answers) {
  return visibleQuestions(questions, answers)
    .filter((q) => q.is_mandatory && (answers[q.q_key] === undefined || answers[q.q_key] === null || String(answers[q.q_key]).trim() === ''))
    .map((q) => q.q_key);
}

module.exports = { conditionMatches, classify, mapLaw, visibleQuestions, missingMandatory };
