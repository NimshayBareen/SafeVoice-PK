'use strict';
// Anonymised case summary shown to a lawyer BEFORE the victim shares anything else (FR-6.1, FR-8.3).
// It is built only from coarse, non-identifying answers. Names, contact details, the free-text description,
// exact dates and evidence files are never included.

const LABELS = {
  offender_known: { known: 'a person known to the victim', family: 'a family member or partner', unknown: 'not known' },
  platform: { whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', other_online: 'another app, website or phone call', not_online: 'not online' },
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function monthYear(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(iso || '');
  return m ? `${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}` : null;
}

function buildSummary({ categoryName, answers, evidenceCount, note }) {
  const lines = [];
  lines.push(`Type of matter: ${categoryName || 'Not yet classified'}`);
  if (answers.victim_is_child) lines.push(`Person affected is under 18: ${answers.victim_is_child === 'yes' ? 'yes' : 'no'}`);
  if (answers.offender_known) lines.push(`Offender: ${LABELS.offender_known[answers.offender_known] || 'not stated'}`);
  if (answers.platform) lines.push(`Where it happens: ${LABELS.platform[answers.platform] || 'not stated'}`);
  const since = monthYear(answers.incident_start);
  if (since) lines.push(`Started: ${since}`);
  if (answers.ongoing) lines.push(`Still happening: ${answers.ongoing === 'yes' ? 'yes' : 'no'}`);
  if (answers.money_demanded) lines.push(`Money or other demand made: ${answers.money_demanded === 'yes' ? 'yes' : 'no'}`);
  if (answers.injury) lines.push(`Physical injury: ${answers.injury === 'yes' ? 'yes' : 'no'}`);
  if (answers.images_shared) lines.push(`Images or videos already shared: ${answers.images_shared === 'yes' ? 'yes' : 'no'}`);
  if (answers.city) lines.push(`City: ${String(answers.city).trim().slice(0, 60)}`);
  lines.push(`Evidence items stored in the vault: ${evidenceCount}`);
  if (note && note.trim()) lines.push(`Message from the victim: ${note.trim().slice(0, 600)}`);
  lines.push('No name, contact details or evidence files are shared at this stage.');
  return lines.join('\n');
}

module.exports = { buildSummary };
