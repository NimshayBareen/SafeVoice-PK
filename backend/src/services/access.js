'use strict';
// Shared lookups that also enforce who may see what.
const { unsealText } = require('../crypto');

// Decrypted intake answers of a case as { q_key: value }
async function loadAnswers(db, caseId, caseKey) {
  const r = await db.query(
    `SELECT q.q_key, a.answer_value_enc FROM intake_answers a JOIN intake_questions q ON q.question_id = a.question_id WHERE a.case_id = $1`, [caseId]);
  const out = {};
  for (const row of r.rows) { try { out[row.q_key] = unsealText(caseKey, row.answer_value_enc); } catch (_) { /* skip unreadable */ } }
  return out;
}

// A representation request, but only if `user` is the victim who owns the case or the lawyer it was sent to.
async function requestForUser(db, user, requestId) {
  const r = await db.query(
    `SELECT rr.request_id, rr.case_id, rr.lawyer_id, rr.anonymised_summary, rr.status, rr.created_at, rr.responded_at,
            c.victim_id, c.reference_code, c.wrapped_case_key, c.category_id,
            lp.user_id AS lawyer_user_id, lp.full_name AS lawyer_name, lp.bar_council_no, lp.bar_council_name, lp.verification_status
     FROM representation_requests rr
     JOIN cases c ON c.case_id = rr.case_id
     JOIN lawyer_profiles lp ON lp.lawyer_id = rr.lawyer_id
     WHERE rr.request_id = $1`, [requestId]);
  const x = r.rows[0];
  if (!x) return null;
  if (user.role === 'VICTIM' && x.victim_id === user.id) return { ...x, side: 'VICTIM' };
  if (user.role === 'LAWYER' && x.lawyer_user_id === user.id) return { ...x, side: 'LAWYER' };
  return null;
}

module.exports = { loadAnswers, requestForUser };
