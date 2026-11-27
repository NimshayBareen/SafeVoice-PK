'use strict';
// End-to-end check of the whole system against a RUNNING server (start it with `npm start` in another terminal).
// Needs: DEV_SHOW_OTP=true and no SMTP settings (so the code comes back in the response), and a seeded administrator:
//   run `npm run seed` first (creates admin@demo.safevoice.pk), or set SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD.
//   Run:  npm run smoke
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BASE = process.env.SMOKE_URL || `http://localhost:${process.env.PORT || 5000}`;
const STORAGE = path.resolve(process.env.STORAGE_DIR || './storage');
const ADMIN = { email: process.env.SMOKE_ADMIN_EMAIL || 'admin@demo.safevoice.pk', password: process.env.SMOKE_ADMIN_PASSWORD || process.env.DEMO_PASSWORD || 'Demo#Pass2026!' };
let failed = 0;
const section = (t) => console.log('\n' + t);
function check(name, cond, extra) {
  if (cond) console.log('  PASS  ' + name);
  else { failed++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
}

async function call(method, url, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = 'Bearer ' + token;
  let body;
  if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(BASE + url, { method, headers, body });
  const ct = res.headers.get('content-type') || '';
  let data = null;
  if (ct.includes('application/json')) { try { data = await res.json(); } catch (_) { /* empty */ } }
  else data = Buffer.from(await res.arrayBuffer());
  return { status: res.status, data };
}
const file = (name, bytes, type, fields = {}) => {
  const f = new FormData(); f.append('file', new Blob([bytes], { type }), name);
  for (const [k, v] of Object.entries(fields)) f.append(k, v);
  return f;
};

function storedFile(caseId, evidenceId) {
  if (process.env.STORAGE_DRIVER === 'db') return null;
  const p = path.join(STORAGE, caseId, evidenceId + '.bin');
  return fs.existsSync(p) ? p : null;
}

async function registerAndLogin(role, email, extra = {}) {
  const password = 'Str0ng#Pass2026';
  let r = await call('POST', '/api/auth/register', { json: { role, email, password, ...extra } });
  const otp = r.data && r.data.devOtp;
  check(`register ${role.toLowerCase()} accepted (code returned in demo mode)`, r.status === 201 && !!otp, JSON.stringify(r.data));
  r = await call('POST', '/api/auth/login', { json: { identifier: email, password } });
  check('login before verification is refused', r.status === 403);
  r = await call('POST', '/api/auth/verify-otp', { json: { email, code: otp === '000000' ? '111111' : '000000' } });
  check('a wrong 6-digit code is refused', r.status === 400);
  r = await call('POST', '/api/auth/verify-otp', { json: { email, code: otp } });
  check('the right code verifies the account', r.status === 200, JSON.stringify(r.data));
  r = await call('POST', '/api/auth/verify-otp', { json: { email, code: otp } });
  check('the code cannot be used twice', r.status === 400);
  r = await call('POST', '/api/auth/login', { json: { identifier: email, password } });
  check(`${role.toLowerCase()} can log in`, r.status === 200 && !!r.data.token);
  return r.data;
}

(async () => {
  console.log('SafeVoice PK smoke test against ' + BASE);
  const h = await call('GET', '/api/health');
  check('server and database are reachable', h.status === 200, JSON.stringify(h.data));
  if (h.status !== 200) { console.log('\nStart the database and the server first.'); process.exit(1); }

  section('UC-01 / UC-02  Accounts (victim and advocate, e-mail OTP)');
  const stamp = Date.now();
  let r = await call('POST', '/api/auth/register', { json: { role: 'VICTIM', email: `weak${stamp}@example.com`, password: '12345' } });
  check('weak password is rejected', r.status === 400);
  const victim = await registerAndLogin('VICTIM', `victim${stamp}@example.com`, { alias: 'BlueBird', city: 'Lahore' });
  const v = victim.token;
  r = await call('POST', '/api/auth/login', { json: { identifier: `victim${stamp}@example.com`, password: 'Wrong#Pass2026' } });
  check('wrong password gives a generic error', r.status === 401);
  r = await call('GET', '/api/cases');
  check('protected route refuses a request without a token', r.status === 401);
  const lawyer = await registerAndLogin('LAWYER', `lawyer${stamp}@example.com`, {
    fullName: 'Adv. Smoke Test', city: 'Lahore',
    lawyer: { barCouncilNo: 'SMOKE-' + stamp, city: 'Lahore', languages: ['ur', 'en'], feeType: 'PRO_BONO', categories: ['CYBER_HARASSMENT'] },
  });
  const l = lawyer.token;
  check('advocate starts as PENDING_VERIFICATION', lawyer.user.lawyerStatus === 'PENDING_VERIFICATION');
  r = await call('GET', '/api/lawyer/requests', { token: l });
  check('an unverified advocate cannot use the inbox', r.status === 403);
  r = await call('GET', '/api/lawyers', { token: v });
  check('an unverified advocate is not listed in the directory', r.status === 200 && !r.data.lawyers.some((x) => x.bar_council_no === 'SMOKE-' + stamp));

  section('UC-15 / UC-18  Administrator verifies the advocate');
  r = await call('POST', '/api/auth/login', { json: { identifier: ADMIN.email, password: ADMIN.password } });
  check('administrator can log in', r.status === 200 && r.data.user.role === 'ADMIN', 'run "npm run seed" or set SMOKE_ADMIN_EMAIL / SMOKE_ADMIN_PASSWORD');
  if (r.status !== 200) { console.log('\nCannot continue without an administrator.'); process.exit(1); }
  const a = r.data.token;
  r = await call('GET', '/api/admin/stats', { token: v });
  check('a victim cannot open the admin API', r.status === 403);
  r = await call('POST', '/api/lawyer/documents', { token: l, form: file('licence.pdf', Buffer.from('%PDF-1.4 sample licence'), 'application/pdf', { docType: 'LICENCE' }) });
  check('advocate uploads a licence document', r.status === 201);
  r = await call('GET', '/api/admin/lawyers?status=PENDING_VERIFICATION', { token: a });
  const lp = r.data.lawyers.find((x) => x.bar_council_no === 'SMOKE-' + stamp);
  check('administrator sees the pending advocate with the document', !!lp && lp.documents.length === 1);
  r = await call('GET', '/api/admin/lawyer-documents/' + lp.documents[0].doc_id, { token: a });
  check('administrator can open the (decrypted) document', r.status === 200 && r.data.toString().startsWith('%PDF'));
  r = await call('POST', `/api/admin/lawyers/${lp.lawyer_id}/decision`, { token: a, json: { decision: 'REJECT' } });
  check('a rejection needs a note', r.status === 400);
  r = await call('POST', `/api/admin/lawyers/${lp.lawyer_id}/decision`, { token: a, json: { decision: 'APPROVE' } });
  check('administrator approves the advocate', r.status === 200);
  r = await call('GET', '/api/lawyers?city=Lahore&category=CYBER_HARASSMENT&language=ur&fee=PRO_BONO', { token: v });
  check('the verified advocate now appears in the filtered directory', r.status === 200 && r.data.lawyers.some((x) => x.lawyer_id === lp.lawyer_id));
  const lawyerId = lp.lawyer_id;

  section('UC-05 / UC-06 / UC-07  Intake, legal mapping, complaint draft');
  r = await call('POST', '/api/cases', { token: v });
  check('case created with a neutral reference code', r.status === 201 && /^SV-\d{4}-\d{4}$/.test(r.data.case.reference_code));
  const caseId = r.data.case.case_id;
  r = await call('GET', `/api/cases/${caseId}/legal`, { token: v });
  check('legal guidance is blocked until the questions are submitted', r.status === 409);
  r = await call('POST', `/api/cases/${caseId}/intake/submit`, { token: v });
  check('submitting with required answers missing is refused', r.status === 422 && r.data.missing.includes('incident_type'));
  r = await call('PUT', `/api/cases/${caseId}/intake`, { token: v, json: { answers: {
    incident_type: 'harassment', victim_is_child: 'no', ongoing: 'yes', offender_known: 'known', platform: 'whatsapp', money_demanded: 'yes',
    incident_start: '2026-09-02', city: 'Lahore', summary: 'Repeated threatening messages.' } } });
  check('answers saved', r.status === 200, JSON.stringify(r.data));
  r = await call('PUT', `/api/cases/${caseId}/intake`, { token: v, json: { answers: { incident_start: '2999-01-01' } } });
  check('a future date is rejected', r.status === 400);
  r = await call('POST', `/api/cases/${caseId}/intake/submit`, { token: v });
  check('intake submitted and classified', r.status === 200 && r.data.categoryCode === 'CYBER_HARASSMENT', JSON.stringify(r.data));
  r = await call('GET', `/api/cases/${caseId}/legal`, { token: v });
  check('legal mapping shows offences and forums', r.status === 200 && r.data.offences.length >= 2 && r.data.forums.some((f) => f.code === 'NCCIA'), JSON.stringify(r.data && r.data.matched));

  section('UC-03 / UC-04  Evidence vault');
  const content = Buffer.from('Stand-in for a screenshot of a threatening message ' + stamp);
  r = await call('POST', `/api/cases/${caseId}/evidence`, { token: v, form: file('chat-screenshot.png', content, 'image/png', { description: 'Threatening chat' }) });
  check('evidence uploaded', r.status === 201);
  const ev = r.data.evidence;
  check('server hash equals SHA-256 of the file', ev.sha256_hash === crypto.createHash('sha256').update(content).digest('hex'));
  r = await call('POST', `/api/cases/${caseId}/evidence`, { token: v, form: file('virus.exe', Buffer.from('MZ'), 'application/octet-stream') });
  check('an .exe file is refused', r.status === 400);
  r = await call('POST', `/api/cases/${caseId}/evidence/url`, { token: v, json: { url: 'https://example.com/post/1', description: 'Harassing post' } });
  check('a web link is saved as evidence', r.status === 201);
  const sf = storedFile(caseId, ev.evidence_id);
  if (sf) check('the stored file is encrypted', !fs.readFileSync(sf).includes(content));
  r = await call('POST', `/api/evidence/${ev.evidence_id}/verify`, { token: v });
  check('untouched evidence verifies (MATCH)', r.status === 200 && r.data.status === 'MATCH');

  r = await call('POST', `/api/cases/${caseId}/complaint`, { token: v, json: { complainantName: 'Test Person', contact: '03001234567' } });
  check('complaint draft generated', r.status === 201 && r.data.draft.content.includes('chat-screenshot.png'));
  const draftId = r.data.draft.draft_id;
  r = await call('GET', `/api/complaint/${draftId}/export?format=pdf`, { token: v });
  check('draft exports to PDF', r.status === 200 && r.data.subarray(0, 5).toString() === '%PDF-');
  r = await call('GET', `/api/complaint/${draftId}/export?format=docx`, { token: v });
  check('draft exports to Word', r.status === 200 && r.data.subarray(0, 2).toString() === 'PK');

  section('UC-09 / UC-10 / UC-16  Representation request and consent');
  r = await call('POST', `/api/cases/${caseId}/requests/preview`, { token: v, json: { lawyerId, note: 'Please help.' } });
  check('the preview summary hides identity and free text', r.status === 200 && !/BlueBird|0300|Repeated threatening/.test(r.data.summary) && r.data.summary.includes('Lahore'), r.data && r.data.summary);
  r = await call('POST', `/api/cases/${caseId}/requests`, { token: v, json: { lawyerId, note: 'Please help.' } });
  check('request sent', r.status === 201);
  const reqId = r.data.request.request_id;
  r = await call('POST', `/api/cases/${caseId}/requests`, { token: v, json: { lawyerId } });
  check('a duplicate open request is refused', r.status === 409);
  r = await call('PUT', `/api/requests/${reqId}/shares`, { token: v, json: { evidenceIds: [ev.evidence_id] } });
  check('evidence cannot be shared before the lawyer accepts', r.status === 409);
  r = await call('GET', `/api/requests/${reqId}`, { token: l });
  check('the advocate sees only the anonymised summary', r.status === 200 && r.data.request.evidence.length === 0 && !/BlueBird/.test(r.data.request.summary));
  r = await call('POST', `/api/requests/${reqId}/respond`, { token: l, json: { decision: 'ACCEPT' } });
  check('advocate accepts', r.status === 200, JSON.stringify(r.data));
  r = await call('GET', `/api/requests/${reqId}/evidence/${ev.evidence_id}/download`, { token: l });
  check('no evidence access before the victim consents', r.status === 403);
  r = await call('PUT', `/api/requests/${reqId}/shares`, { token: v, json: { evidenceIds: [ev.evidence_id] } });
  check('victim shares one item', r.status === 200 && r.data.shared.length === 1);
  r = await call('GET', `/api/requests/${reqId}/evidence/${ev.evidence_id}/download`, { token: l });
  check('the advocate can download the shared item (decrypted)', r.status === 200 && r.data.equals(content));
  r = await call('POST', `/api/requests/${reqId}/evidence/${ev.evidence_id}/verify`, { token: l });
  check('the advocate can verify the shared item', r.status === 200 && r.data.status === 'MATCH');
  r = await call('PUT', `/api/requests/${reqId}/shares`, { token: v, json: { evidenceIds: [] } });
  check('victim stops sharing', r.status === 200 && r.data.shared.length === 0);
  r = await call('GET', `/api/requests/${reqId}/evidence/${ev.evidence_id}/download`, { token: l });
  check('access is gone at once after revoking', r.status === 403);
  await call('PUT', `/api/requests/${reqId}/shares`, { token: v, json: { evidenceIds: [ev.evidence_id] } });

  section('UC-11 / UC-17  Vakalatnama');
  r = await call('POST', `/api/requests/${reqId}/vakalatnama`, { token: v, json: { clientName: 'Test Person', parentage: 'D/o Test Father', forumText: 'NCCIA Lahore' } });
  check('vakalatnama draft generated', r.status === 201);
  r = await call('GET', `/api/requests/${reqId}/vakalatnama/draft`, { token: l });
  check('the advocate downloads the draft PDF', r.status === 200 && r.data.subarray(0, 5).toString() === '%PDF-');
  r = await call('POST', `/api/requests/${reqId}/vakalatnama/scan`, { token: v, form: file('signed.pdf', Buffer.from('%PDF-1.4 signed copy'), 'application/pdf') });
  check('signed copy uploaded', r.status === 200 && r.data.status === 'SIGNED_COPY_RECEIVED');
  r = await call('POST', `/api/requests/${reqId}/vakalatnama/decide`, { token: l, json: { decision: 'REJECT' } });
  check('a rejection needs a reason', r.status === 400);
  r = await call('POST', `/api/requests/${reqId}/vakalatnama/decide`, { token: l, json: { decision: 'REJECT', reason: 'Signature not visible' } });
  check('rejected copy goes back to SENT', r.status === 200 && r.data.status === 'SENT');
  await call('POST', `/api/requests/${reqId}/vakalatnama/scan`, { token: v, form: file('signed2.pdf', Buffer.from('%PDF-1.4 signed copy 2'), 'application/pdf') });
  r = await call('POST', `/api/requests/${reqId}/vakalatnama/decide`, { token: l, json: { decision: 'VERIFY' } });
  check('advocate verifies the signed copy', r.status === 200 && r.data.status === 'VERIFIED');
  r = await call('POST', `/api/requests/${reqId}/vakalatnama/original`, { token: l });
  check('original recorded as received', r.status === 200 && r.data.status === 'ORIGINAL_RECEIVED');

  section('UC-12 / UC-13  Messages and case tracking');
  r = await call('POST', `/api/requests/${reqId}/messages`, { token: v, json: { text: 'Hello, thank you for accepting.' } });
  check('victim sends a message', r.status === 201);
  r = await call('GET', `/api/requests/${reqId}/messages`, { token: l });
  check('the advocate reads it', r.status === 200 && r.data.messages.length === 1 && !r.data.messages[0].mine && r.data.messages[0].text.includes('thank you'));
  r = await call('POST', `/api/requests/${reqId}/tracking/update`, { token: l, json: { stage: 'Complaint filed / FIR registered', note: 'Filed today', date: { title: 'First hearing', eventDate: '2099-01-15' } } });
  check('advocate adds a stage and a hearing date', r.status === 201);
  r = await call('POST', `/api/requests/${reqId}/tracking/update`, { token: l, json: { stage: 'Hearing scheduled', date: { title: 'Old date', eventDate: '2001-01-01' } } });
  check('a past date is rejected', r.status === 400);
  r = await call('GET', `/api/requests/${reqId}/tracking`, { token: v });
  check('the victim sees the stage and the date', r.status === 200 && r.data.updates[0].stage.startsWith('Complaint filed') && r.data.dates.length === 1);
  r = await call('GET', '/api/notifications', { token: v });
  check('notifications exist and contain only neutral text', r.status === 200 && r.data.notifications.length > 0 && r.data.notifications.every((n) => n.neutral_text === 'You have a new update.'));
  r = await call('POST', `/api/requests/${reqId}/withdraw`, { token: v });
  check('victim ends the representation', r.status === 200);
  r = await call('POST', `/api/requests/${reqId}/messages`, { token: l, json: { text: 'Still there?' } });
  check('the advocate can no longer message', r.status === 403);
  r = await call('GET', `/api/requests/${reqId}/evidence/${ev.evidence_id}/download`, { token: l });
  check('the advocate can no longer reach the evidence', r.status === 403);

  section('UC-14  Support directory and AI assistant');
  r = await call('GET', '/api/support?city=Lahore&category=CYBER_HARASSMENT', { token: v });
  check('support directory lists helplines', r.status === 200 && r.data.entries.some((e) => e.phone === '1799'));
  r = await call('GET', '/api/support?city=Atlantis', { token: v });
  check('an unknown city falls back to national helplines', r.status === 200 && r.data.fallback === true && r.data.entries.length > 0);
  r = await call('POST', '/api/assistant', { token: v, json: { question: 'Which helpline can I call about cybercrime?', lang: 'en' } });
  check('the assistant answers from the knowledge base', r.status === 200 && /1799/.test(r.data.answer + r.data.sources.join(' ')), JSON.stringify(r.data));

  section('UC-19 / UC-20  Knowledge base and audit');
  r = await call('POST', '/api/admin/kb/forums', { token: a, json: { code: 'SMOKE' + stamp, name_en: 'Smoke Test Forum', forum_type: 'OTHER' } });
  check('administrator adds a forum', r.status === 201);
  const forumRow = r.data.row;
  r = await call('POST', '/api/admin/kb/rules', { token: a, json: { title: 'bad', offence_id: crypto.randomUUID(), forum_id: forumRow.forum_id, condition_json: '{"all":[{"q":"x","op":"bogus","v":1}]}', procedure_text_en: '1. x' } });
  check('an invalid rule condition is rejected', r.status === 400);
  r = await call('DELETE', `/api/admin/kb/forums/${forumRow.forum_id}`, { token: a });
  check('the unused forum can be deleted', r.status === 200);
  r = await call('GET', '/api/admin/audit?limit=5', { token: a });
  check('the audit log lists entries', r.status === 200 && r.data.entries.length > 0);
  r = await call('GET', '/api/admin/audit/verify', { token: a });
  check('the audit log hash chain is intact', r.status === 200 && r.data.valid === true, JSON.stringify(r.data));
  r = await call('GET', `/api/cases/${caseId}/custody`, { token: v });
  check('the chain of custody is intact and lists every action', r.status === 200 && r.data.chainValid === true && r.data.entries.length >= 6, JSON.stringify(r.data && r.data.chainValid));

  section('Tamper detection');
  const p = storedFile(caseId, ev.evidence_id);
  if (p) {
    const bytes = fs.readFileSync(p); bytes[0] ^= 0xff; fs.writeFileSync(p, bytes);
    r = await call('POST', `/api/evidence/${ev.evidence_id}/verify`, { token: v });
    check('a changed file is detected (MISMATCH)', r.status === 200 && r.data.status === 'MISMATCH', JSON.stringify(r.data));
    fs.rmSync(p);
    r = await call('POST', `/api/evidence/${ev.evidence_id}/verify`, { token: v });
    check('a missing file is reported (ERROR)', r.status === 200 && r.data.status === 'ERROR');
  } else console.log('  (skipped: STORAGE_DRIVER=db, files are not on disk)');

  console.log(failed ? `\n${failed} check(s) FAILED.` : '\nAll smoke checks passed.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('Smoke test crashed:', e.message); process.exit(1); });
