'use strict';
// Runs without a database. Checks the security-critical logic: hashing, encryption, key wrapping,
// tamper detection, hash-chained logs and input validation.   Run:  npm run selftest
const assert = require('assert');
const crypto = require('crypto');
const { sha256Hex, randomKey, wrapKey, unwrapKey, encryptBuffer, decryptBuffer } = require('../src/crypto');
const { custodyHash, verifyCustodyChain } = require('../src/chain');
const { isEmail, normaliseMobile, validatePassword, isUuid, isHttpUrl, EXT_TYPES } = require('../src/validators');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS  ' + name); }
  catch (e) { console.log('  FAIL  ' + name + '\n        ' + e.message); process.exitCode = 1; }
}

console.log('SafeVoice PK self-test');
const master = crypto.randomBytes(32);

test('SHA-256 of a known string', () => {
  assert.strictEqual(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('case key wraps and unwraps', () => {
  const k = randomKey(); assert.ok(unwrapKey(master, wrapKey(master, k)).equals(k));
});
test('wrapped key cannot be opened with another master key', () => {
  const w = wrapKey(master, randomKey());
  assert.throws(() => unwrapKey(crypto.randomBytes(32), w));
});
test('encrypt then decrypt returns the same bytes', () => {
  const k = randomKey(); const plain = crypto.randomBytes(5000);
  const { iv, data } = encryptBuffer(k, plain);
  assert.ok(decryptBuffer(k, iv, data).equals(plain));
  assert.ok(!data.subarray(0, plain.length).equals(plain), 'ciphertext must differ from plain text');
});
test('hash computed before encryption equals hash after decryption', () => {
  const k = randomKey(); const plain = Buffer.from('threatening message screenshot bytes');
  const h = sha256Hex(plain); const { iv, data } = encryptBuffer(k, plain);
  assert.strictEqual(sha256Hex(decryptBuffer(k, iv, data)), h);
});
test('changing one stored byte is detected (UC-04 tamper check)', () => {
  const k = randomKey(); const { iv, data } = encryptBuffer(k, Buffer.from('original evidence'));
  const bad = Buffer.from(data); bad[3] ^= 0xff;
  assert.throws(() => decryptBuffer(k, iv, bad));
});
test('truncated file is detected', () => {
  const k = randomKey(); const { iv, data } = encryptBuffer(k, Buffer.from('original evidence'));
  assert.throws(() => decryptBuffer(k, iv, data.subarray(0, data.length - 5)));
});

function makeChain(n) {
  const rows = []; let prev = null;
  for (let i = 0; i < n; i++) {
    const e = { evidence_id: 'e1', case_id: 'c1', actor_id: 'u1', action: i === 0 ? 'UPLOAD' : 'VERIFY', result: 'OK', created_at: new Date(1700000000000 + i * 1000) };
    const h = custodyHash(prev, e); rows.push({ ...e, prev_hash: prev, entry_hash: h }); prev = h;
  }
  return rows;
}
test('an untouched custody chain verifies', () => assert.strictEqual(verifyCustodyChain(makeChain(6)).valid, true));
test('editing a custody row breaks the chain', () => {
  const rows = makeChain(6); rows[2].result = 'MATCH';
  const r = verifyCustodyChain(rows); assert.strictEqual(r.valid, false); assert.strictEqual(r.brokenAt, 2);
});
test('deleting a custody row breaks the chain', () => {
  const rows = makeChain(6); rows.splice(3, 1);
  assert.strictEqual(verifyCustodyChain(rows).valid, false);
});

test('password policy accepts a strong password', () => assert.deepStrictEqual(validatePassword('Str0ng#Pass2026'), []));
test('password policy rejects "12345"', () => assert.ok(validatePassword('12345').length >= 3));
test('password policy rejects missing symbol', () => assert.ok(validatePassword('Abcdefghij1').length === 1));
test('email check', () => { assert.ok(isEmail('a@b.com')); assert.ok(!isEmail('a@b')); assert.ok(!isEmail('no at sign.com')); });
test('mobile numbers normalise', () => {
  assert.strictEqual(normaliseMobile('0300 1234567'), '03001234567');
  assert.strictEqual(normaliseMobile('+92 300 1234567'), '03001234567');
  assert.strictEqual(normaliseMobile('12345'), null);
});
test('uuid and url checks', () => {
  assert.ok(isUuid(crypto.randomUUID())); assert.ok(!isUuid('abc'));
  assert.ok(isHttpUrl('https://example.com/post/1')); assert.ok(!isHttpUrl('javascript:alert(1)'));
});
test('.exe is not an allowed evidence type', () => { assert.strictEqual(EXT_TYPES['.exe'], undefined); assert.strictEqual(EXT_TYPES['.png'], 'IMAGE'); });


// ------------------------------------------------------------------ final deliverable checks
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://x:x@localhost:5432/x';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'j'.repeat(40);
process.env.MASTER_KEY = process.env.MASTER_KEY || 'a'.repeat(64);
const kbData = require('../src/kb/data');
const rules = require('../src/services/rules');
const { buildSummary } = require('../src/services/summary');
const docs = require('../src/services/documents');
const assistant = require('../src/services/assistant');
const { parseMasterKey, seal, unsealText } = require('../src/crypto');

// Build rows in the same shape as services/kb.loadRules()
const offByCode = Object.fromEntries(kbData.offences.map((o) => [o.code, { ...o, statute_name: kbData.statutes.find((x) => x.short_code === o.statute).name }]));
const forByCode = Object.fromEntries(kbData.forums.map((f) => [f.code, f]));
const ruleRows = kbData.rules.map((r, i) => ({ rule_id: 'r' + i, title: r.title, category_code: r.category, condition_json: r.condition, procedure_text_en: r.en, procedure_text_ur: r.ur, version: 1, review_date: kbData.REVIEW, offence: offByCode[r.offence], forum: forByCode[r.forum] }));
const questionRows = kbData.questions.map((q) => ({ q_key: q.q_key, applies_to: q.applies, options_json: q.options, is_mandatory: q.mandatory }));

test('knowledge base: every rule points to an existing offence, forum and category', () => {
  const cats = new Set(kbData.categories.map((c) => c.code));
  for (const r of kbData.rules) { assert.ok(offByCode[r.offence], r.offence); assert.ok(forByCode[r.forum], r.forum); assert.ok(r.category === null || cats.has(r.category), r.category); }
});
test('knowledge base: rule conditions only use real question keys', () => {
  const keys = new Set(kbData.questions.map((q) => q.q_key));
  for (const r of kbData.rules) for (const c of (r.condition.all || [])) assert.ok(keys.has(c.q), c.q);
});
test('knowledge base: question keys are unique and option categories exist', () => {
  const keys = kbData.questions.map((q) => q.q_key); assert.strictEqual(new Set(keys).size, keys.length);
  const cats = new Set(kbData.categories.map((c) => c.code));
  for (const o of kbData.questions.find((q) => q.q_key === 'incident_type').options) assert.ok(cats.has(o.category));
  for (const s of kbData.support) for (const c of s.cats) assert.ok(cats.has(c));
});
test('legal mapping: online blackmail by a known person -> cyber stalking, intimidation, NCCIA and police', () => {
  const a = { incident_type: 'harassment', money_demanded: 'yes', offender_known: 'known', victim_is_child: 'no' };
  const cat = rules.classify(questionRows, a); assert.strictEqual(cat, 'CYBER_HARASSMENT');
  const m = rules.mapLaw(cat, ruleRows, a);
  const codes = m.offences.map((o) => o.code); const forums = m.forums.map((f) => f.code);
  assert.ok(codes.includes('PECA_S24') && codes.includes('PPC_S506') && codes.includes('PPC_S509'));
  assert.ok(forums.includes('NCCIA') && forums.includes('POLICE'));
});
test('legal mapping: images already posted adds the PTA removal route', () => {
  const a = { incident_type: 'images', images_shared: 'yes' };
  const m = rules.mapLaw(rules.classify(questionRows, a), ruleRows, a);
  assert.ok(m.forums.some((f) => f.code === 'PTA') && m.offences.some((o) => o.code === 'PECA_S21'));
});
test('legal mapping: a child victim adds child protection whatever the category', () => {
  const a = { incident_type: 'harassment', victim_is_child: 'yes' };
  assert.ok(rules.mapLaw('CYBER_HARASSMENT', ruleRows, a).forums.some((f) => f.code === 'CPWB'));
});
test('legal mapping: domestic violence points to the women protection route', () => {
  const a = { incident_type: 'domestic', injury: 'yes' };
  const m = rules.mapLaw(rules.classify(questionRows, a), ruleRows, a);
  assert.ok(m.forums.some((f) => f.code === 'WPC') && m.offences.some((o) => o.code === 'PPC_HURT'));
});
test('legal mapping: no category gives no offences (general guidance)', () => {
  assert.strictEqual(rules.classify(questionRows, {}), null);
  assert.strictEqual(rules.mapLaw(null, ruleRows.filter((r) => r.category_code), {}).matched, 0);
});
test('intake: category-specific questions appear only for their category', () => {
  const dv = rules.visibleQuestions(questionRows, { incident_type: 'domestic' }).map((q) => q.q_key);
  assert.ok(dv.includes('injury') && !dv.includes('images_shared'));
  const before = rules.visibleQuestions(questionRows, {}).map((q) => q.q_key);
  assert.ok(!before.includes('injury') && before.includes('incident_type'));
});
test('intake: mandatory questions are enforced', () => {
  assert.deepStrictEqual(rules.missingMandatory(questionRows, {}).sort(), ['incident_type', 'ongoing', 'victim_is_child'].sort());
  assert.deepStrictEqual(rules.missingMandatory(questionRows, { incident_type: 'harassment', victim_is_child: 'no', ongoing: 'yes' }), []);
});
test('anonymised summary hides identity, free text and exact date', () => {
  const s = buildSummary({ categoryName: 'Online harassment', answers: { incident_start: '2026-09-17', platform: 'whatsapp', city: 'Lahore', summary: 'My name is Ayesha Khan and my number is 0300', full_name: 'Ayesha Khan' }, evidenceCount: 3, note: '' });
  assert.ok(s.includes('September 2026') && s.includes('Lahore') && s.includes('3'));
  assert.ok(!s.includes('Ayesha') && !s.includes('0300') && !s.includes('17'));
});
test('master key accepts 64 hex or a passphrase', () => {
  assert.strictEqual(parseMasterKey('b'.repeat(64)).length, 32);
  assert.strictEqual(parseMasterKey('a long passphrase for deployment use').length, 32);
  assert.throws(() => parseMasterKey('short'));
});
test('messages and answers are sealed and unsealed with the case key', () => {
  const k = randomKey(); const sealed = seal(k, 'Hello, please send the documents');
  assert.ok(!sealed.includes(Buffer.from('Hello'))); assert.strictEqual(unsealText(k, sealed), 'Hello, please send the documents');
});
test('assistant retrieval finds the NCCIA helpline from the knowledge base', () => {
  const chunks = assistant.buildChunks({ categories: kbData.categories, offences: Object.values(offByCode), forums: kbData.forums, rules: ruleRows,
    support: kbData.support.map((s) => ({ ...s, city: s.city, phone: s.phone, description: s.description })) });
  const hit = assistant.retrieve('Which helpline do I call for cybercrime?', chunks);
  assert.ok(hit.some((h) => /1799/.test(h.title + h.text)));
  assert.ok(assistant.retrieve('cyber stalking section 24', chunks).some((h) => /Section 24/.test(h.title)));
});

const pdfDone = (async () => {
  try {
    const text = docs.buildComplaintText({ referenceCode: 'SV-2026-0001', complainantName: 'Test Person', contact: '0300', categoryName: 'Online harassment', answers: { platform: 'whatsapp', ongoing: 'yes' },
      incidentTypeLabel: 'Threats', evidence: [{ name: 'chat.png', type: 'Image', date: '01 Nov 2026', hash: 'a'.repeat(64) }], mapping: { forums: [forByCode.NCCIA], offences: [offByCode.PECA_S24] }, dateText: '1 November 2026' });
    const blocks = docs.parseBlocks(text);
    assert.ok(text.includes('Cyber stalking') && text.includes('chat.png'));
    const pdf = await docs.blocksToPdf(blocks, { title: 'Complaint', footer: 'x' });
    const docx = await docs.blocksToDocx(blocks, { title: 'Complaint' });
    assert.strictEqual(pdf.subarray(0, 5).toString(), '%PDF-'); assert.strictEqual(docx.subarray(0, 2).toString(), 'PK');
    const v = await docs.blocksToPdf(docs.parseBlocks(docs.buildVakalatnamaText({ clientName: 'Test Person', forumText: 'NCCIA', matterText: 'complaint', lawyerName: 'Adv. Sample', barNo: 'DEMO-1', referenceCode: 'SV-2026-0001', dateText: '1 November 2026' })), { footer: 'v' });
    assert.strictEqual(v.subarray(0, 5).toString(), '%PDF-');
    passed++; console.log('  PASS  complaint draft exports to PDF and Word, vakalatnama exports to PDF');
  } catch (e) { process.exitCode = 1; console.log('  FAIL  document export\n        ' + e.message); }
})();

pdfDone.then(() => console.log(`\n${passed} checks passed${process.exitCode ? ' (some FAILED)' : ''}.`));

