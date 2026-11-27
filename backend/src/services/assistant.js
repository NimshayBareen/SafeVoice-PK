'use strict';
// AI legal-information assistant. It answers ONLY from the administrator-managed legal knowledge base (retrieval),
// through the Anthropic API when ANTHROPIC_API_KEY is set, or with a plain extract from the knowledge base when it is not.
// It never gives legal advice, never asks for personal details and nothing typed into it is stored.
const config = require('../config');

const STOP = new Set(('the and for are was were with that this from have has had not you your can will what when where which who how why does did about into out any all ' +
  'مجھے ہے ہیں ہوں کیا کے کی کا کو نے سے میں اور پر یہ وہ').split(/\s+/));

function tokens(text) {
  return String(text || '').toLowerCase().split(/[^a-z0-9\u0600-\u06FF]+/).filter((t) => t.length > 2 && !STOP.has(t));
}

// kb: { categories, offences(with statute_name), forums, rules(with offence/forum), support }
function buildChunks(kb) {
  const chunks = [];
  for (const c of kb.categories) chunks.push({ title: c.name_en, text: `${c.name_en}. ${c.description || ''}` });
  for (const o of kb.offences) chunks.push({ title: `${o.statute_name}${o.section_ref ? ', ' + o.section_ref : ''}: ${o.title_en}`, text: `${o.statute_name} ${o.section_ref || ''} ${o.title_en}. ${o.ingredients_text || ''}` });
  for (const f of kb.forums) chunks.push({ title: f.name_en, text: `${f.name_en}. ${f.contact_info || ''}` });
  const seen = new Set();
  for (const r of kb.rules) {
    if (seen.has(r.forum.code)) continue; seen.add(r.forum.code);
    chunks.push({ title: `What to do: ${r.forum.name_en}`, text: `Procedure for ${r.forum.name_en}:\n${r.procedure_text_en}` });
  }
  for (const s of kb.support) chunks.push({ title: `${s.name}${s.phone ? ' (' + s.phone + ')' : ''}`, text: `${s.name} ${s.phone || ''} ${s.city || ''} ${s.description || ''}` });
  return chunks;
}

function retrieve(question, chunks, k = 6) {
  const q = Array.from(new Set(tokens(question)));
  if (!q.length) return [];
  const docs = chunks.map((c) => ({ c, t: tokens(c.title + ' ' + c.text), tt: new Set(tokens(c.title)) }));
  const df = {};
  for (const w of q) df[w] = docs.filter((d) => d.t.includes(w)).length;
  const scored = docs.map((d) => {
    let s = 0;
    for (const w of q) {
      if (!df[w]) continue;
      const idf = Math.log(1 + docs.length / df[w]);
      const tf = d.t.filter((x) => x === w).length;
      s += idf * (Math.min(tf, 3) + (d.tt.has(w) ? 2 : 0));
    }
    return { c: d.c, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  return scored.slice(0, k).map((x) => x.c);
}

const DANGER = /(immediate danger|in danger|kill me|suicide|beating me|beat me|abduct|kidnap|threaten(ed)? to kill|\bnow\b.*(hurt|attack)|خطرے میں|جان سے مار|مار پیٹ|اغوا)/i;
const EMERGENCY_EN = 'If you or someone else is in immediate danger, call Police Helpline 15 now.';
const EMERGENCY_UR = 'اگر آپ یا کوئی اور فوری خطرے میں ہے تو ابھی پولیس ہیلپ لائن 15 پر کال کریں۔';

const SYSTEM = `You are the legal-information assistant of SafeVoice PK, a platform that helps victims of cybercrime and of crimes against women and children in Pakistan.
Rules:
- Answer ONLY from the KNOWLEDGE BASE EXCERPTS you are given. If they do not contain the answer, say you do not have that information and suggest speaking to a verified lawyer or calling a relevant helpline from the excerpts.
- You give legal INFORMATION, not legal advice. Never predict the result of a case, never tell the user what they "must" do legally, and remind them to confirm with a lawyer when the question is about their own case.
- Be calm, kind and clear, in short paragraphs or a short list. Reply in the language of the user's question (Urdu or English).
- If there is any sign of immediate danger, start with: call Police Helpline 15.
- Do not ask for names, addresses, phone numbers or other personal details. Do not blame the victim.
- Mention section numbers and helpline numbers exactly as written in the excerpts.`;

function fallbackAnswer(question, hits, lang) {
  if (!hits.length) {
    return lang === 'ur'
      ? 'مجھے اس سوال کا جواب اپنے قانونی ڈیٹا بیس میں نہیں ملا۔ براہِ کرم کسی تصدیق شدہ وکیل سے بات کریں یا سپورٹ ڈائریکٹری میں دی گئی ہیلپ لائنز پر رابطہ کریں (مثلاً پولیس 15، NCCIA سائبر کرائم 1799)۔'
      : 'I could not find an answer to that in the legal knowledge base. Please speak to a verified lawyer or call a helpline from the Support Directory (for example Police 15 or NCCIA cybercrime 1799).';
  }
  const head = lang === 'ur' ? 'قانونی ڈیٹا بیس سے متعلقہ معلومات:' : 'Relevant information from the legal knowledge base:';
  return head + '\n\n' + hits.slice(0, 3).map((h) => `${h.title}\n${h.text}`).join('\n\n');
}

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));
}

async function ask({ question, history, chunks, lang }) {
  const hits = retrieve(question, chunks);
  const urdu = lang === 'ur' || /[\u0600-\u06FF]/.test(question);
  const emergency = DANGER.test(question) ? (urdu ? EMERGENCY_UR : EMERGENCY_EN) : null;
  let answer; let mode;
  if (config.anthropicKey) {
    try {
      const context = hits.length ? hits.map((h, i) => `[${i + 1}] ${h.title}\n${h.text}`).join('\n\n') : '(no relevant excerpts found)';
      const msgs = cleanHistory(history);
      while (msgs.length && msgs[0].role !== 'user') msgs.shift();
      msgs.push({ role: 'user', content: `KNOWLEDGE BASE EXCERPTS:\n${context}\n\nUSER QUESTION:\n${question}` });
      const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 25000);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': config.anthropicKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: config.anthropicModel, max_tokens: 700, system: SYSTEM, messages: msgs }),
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error('AI service status ' + res.status);
      const data = await res.json();
      answer = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
      if (!answer) throw new Error('empty answer');
      mode = 'ai';
    } catch (e) {
      console.error('Assistant AI call failed:', e.message);
      answer = fallbackAnswer(question, hits, urdu ? 'ur' : 'en'); mode = 'kb';
    }
  } else {
    answer = fallbackAnswer(question, hits, urdu ? 'ur' : 'en'); mode = 'kb';
  }
  if (emergency && !answer.includes('15')) answer = emergency + '\n\n' + answer;
  return { answer, mode, sources: hits.slice(0, 4).map((h) => h.title), emergency: !!emergency };
}

module.exports = { buildChunks, retrieve, ask, tokens };
