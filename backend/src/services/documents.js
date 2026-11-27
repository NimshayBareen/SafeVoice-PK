'use strict';
// UC-07 Generate Complaint Draft and UC-11 Vakalatnama drafting.
// Draft text is stored as plain text with three light markers so that it stays editable and can be exported:
//   "## "  heading      "- "  bullet      "|"  table row (cells separated by |)      anything else = paragraph
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const D = require('docx');

const FIELD_LABELS = {
  incident_type: 'Type of incident', offender_known: 'Offender', platform: 'Where it happens', incident_start: 'Started (approximately)',
  ongoing: 'Still happening', money_demanded: 'Demand for money or other things', images_shared: 'Images or videos already shared', injury: 'Physical injury', city: 'City',
};
const VALUE_LABELS = {
  yes: 'Yes', no: 'No', known: 'A person known to me', family: 'A family member or partner', unknown: 'Not known',
  whatsapp: 'WhatsApp', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', other_online: 'Another app, website or phone call', not_online: 'Not online',
};

// ---------------------------------------------------------------- complaint text
function buildComplaintText({ referenceCode, complainantName, contact, categoryName, answers, incidentTypeLabel, evidence, mapping, dateText }) {
  const L = [];
  const forum = mapping && mapping.forums && mapping.forums[0] ? mapping.forums[0].name_en : 'The Concerned Authority';
  L.push(`Date: ${dateText}`);
  L.push(`Reference: ${referenceCode}`);
  L.push('');
  L.push('To,');
  L.push(`The Officer In-Charge, ${forum}`);
  L.push('');
  L.push(`## Subject: Complaint regarding ${categoryName || 'an offence'}`);
  L.push('');
  L.push('Respected Sir/Madam,');
  L.push('');
  L.push('I, the undersigned, respectfully submit the following complaint and request that it be registered and investigated according to law.');
  L.push('');
  L.push('## 1. Complainant');
  L.push(`- Name: ${complainantName || '____________________'}`);
  L.push(`- Contact: ${contact || '____________________'}`);
  if (answers.city) L.push(`- City: ${answers.city}`);
  L.push('');
  L.push('## 2. Facts of the case');
  if (incidentTypeLabel) L.push(`- Nature of the incident: ${incidentTypeLabel}`);
  for (const k of ['offender_known', 'platform', 'incident_start', 'ongoing', 'money_demanded', 'images_shared', 'injury']) {
    if (answers[k]) L.push(`- ${FIELD_LABELS[k]}: ${VALUE_LABELS[answers[k]] || answers[k]}`);
  }
  if (answers.victim_is_child === 'yes') L.push('- The person affected is under 18 years of age.');
  L.push('');
  if (answers.summary && String(answers.summary).trim()) {
    L.push('Description in my own words:');
    L.push(String(answers.summary).trim());
  } else {
    L.push('Description in my own words: ____________________________________________');
  }
  L.push('');
  L.push('## 3. Evidence available');
  if (evidence.length) {
    L.push('The following items are stored with a SHA-256 fingerprint, which shows that they have not been changed since they were saved:');
    L.push('|No.|Item|Type|Saved on|SHA-256 (first 16 characters)');
    evidence.forEach((e, i) => L.push(`|${i + 1}|${e.name}|${e.type}|${e.date}|${e.hash.slice(0, 16)}`));
  } else {
    L.push('No evidence items have been stored yet.');
  }
  L.push('');
  L.push('## 4. Legal provisions that may apply');
  if (mapping && mapping.offences && mapping.offences.length) {
    for (const o of mapping.offences) L.push(`- ${o.statute_name}${o.section_ref ? ', ' + o.section_ref : ''}: ${o.title_en}`);
    L.push('This list is for guidance only. The authority and the court decide which provisions apply.');
  } else {
    L.push('To be determined by the authority on the basis of the facts above.');
  }
  L.push('');
  L.push('## 5. Request');
  L.push('- Please register my complaint and issue a receipt or complaint number.');
  L.push('- Please investigate the matter, identify the person responsible and take legal action.');
  L.push('- Please take steps to remove the harmful content and to protect me from further harm.');
  L.push('');
  L.push('I confirm that the information above is true to the best of my knowledge.');
  L.push('');
  L.push('Signature: ____________________        Date: ______________');
  return L.join('\n');
}

// ---------------------------------------------------------------- text -> blocks
function parseBlocks(text) {
  const blocks = [];
  const lines = String(text).split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('## ')) blocks.push({ t: 'h', text: l.slice(3) });
    else if (l.startsWith('- ')) blocks.push({ t: 'li', text: l.slice(2) });
    else if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) { rows.push(lines[i].slice(1).split('|')); i++; }
      i--; blocks.push({ t: 'table', rows });
    } else if (l.trim() === '') blocks.push({ t: 'gap' });
    else blocks.push({ t: 'p', text: l });
  }
  return blocks;
}

// ---------------------------------------------------------------- PDF
function wrapText(font, size, text, maxWidth) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/); let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) line = test;
      else { if (line) out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

// pdf-lib's built-in fonts only cover Latin text, so anything else is replaced by "?"
const latin = (s) => String(s).replace(/[^\x20-\x7E\u00A0-\u00FF]/g, '?');

async function blocksToPdf(blocks, { title, footer }) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595, H = 842, M = 56, maxW = W - 2 * M;
  let page = pdf.addPage([W, H]); let y = H - M;
  const ensure = (need) => { if (y - need < M + 20) { page = pdf.addPage([W, H]); y = H - M; } };
  const draw = (text, o = {}) => {
    const size = o.size || 11, f = o.bold ? bold : font, indent = o.indent || 0, lh = size * 1.4;
    for (const ln of wrapText(f, size, latin(text), maxW - indent)) {
      ensure(lh); page.drawText(ln, { x: M + indent, y: y - size, size, font: f, color: rgb(0.1, 0.12, 0.18) }); y -= lh;
    }
  };
  if (title) { draw(title, { size: 16, bold: true }); y -= 6; }
  for (const b of blocks) {
    if (b.t === 'gap') y -= 6;
    else if (b.t === 'h') { y -= 4; draw(b.text, { bold: true, size: 12 }); }
    else if (b.t === 'li') { ensure(16); page.drawText('-', { x: M + 4, y: y - 11, size: 11, font }); draw(b.text, { indent: 16 }); }
    else if (b.t === 'p') draw(b.text);
    else if (b.t === 'table') {
      const cols = b.rows[0].length; const widths = cols === 5 ? [30, 190, 60, 90, 117] : Array(cols).fill(maxW / cols);
      b.rows.forEach((r, ri) => {
        const cells = r.map((c, ci) => wrapText(ri === 0 ? bold : font, 9, latin(c), widths[ci] - 6));
        const rowH = Math.max(...cells.map((c) => c.length)) * 12 + 4;
        ensure(rowH);
        let x = M;
        cells.forEach((lines, ci) => {
          page.drawRectangle({ x, y: y - rowH, width: widths[ci], height: rowH, borderColor: rgb(0.7, 0.72, 0.78), borderWidth: 0.5, color: ri === 0 ? rgb(0.93, 0.95, 0.98) : undefined });
          lines.forEach((ln, li) => page.drawText(ln, { x: x + 3, y: y - 11 - li * 12, size: 9, font: ri === 0 ? bold : font }));
          x += widths[ci];
        });
        y -= rowH;
      });
      y -= 4;
    }
  }
  const pages = pdf.getPages();
  pages.forEach((p, i) => p.drawText(latin(`${footer || ''}   Page ${i + 1} of ${pages.length}`), { x: M, y: 24, size: 8, font, color: rgb(0.45, 0.47, 0.55) }));
  return Buffer.from(await pdf.save());
}

// ---------------------------------------------------------------- DOCX
async function blocksToDocx(blocks, { title }) {
  const kids = [];
  if (title) kids.push(new D.Paragraph({ heading: D.HeadingLevel.TITLE, children: [new D.TextRun({ text: title, bold: true })] }));
  const border = { style: D.BorderStyle.SINGLE, size: 4, color: 'B8C2D0' };
  const borders = { top: border, bottom: border, left: border, right: border };
  for (const b of blocks) {
    if (b.t === 'gap') kids.push(new D.Paragraph({ children: [] }));
    else if (b.t === 'h') kids.push(new D.Paragraph({ heading: D.HeadingLevel.HEADING_2, spacing: { before: 160, after: 80 }, children: [new D.TextRun({ text: b.text, bold: true })] }));
    else if (b.t === 'li') kids.push(new D.Paragraph({ numbering: { reference: 'bul', level: 0 }, children: [new D.TextRun(b.text)] }));
    else if (b.t === 'p') kids.push(new D.Paragraph({ spacing: { after: 60 }, children: [new D.TextRun(b.text)] }));
    else if (b.t === 'table') {
      const cols = b.rows[0].length; const total = 9360;
      const widths = cols === 5 ? [600, 3600, 1200, 1700, 2260] : Array(cols).fill(Math.floor(total / cols));
      kids.push(new D.Table({
        width: { size: widths.reduce((a, c) => a + c, 0), type: D.WidthType.DXA }, columnWidths: widths,
        rows: b.rows.map((r, ri) => new D.TableRow({
          children: r.map((c, ci) => new D.TableCell({
            borders, width: { size: widths[ci], type: D.WidthType.DXA }, margins: { top: 40, bottom: 40, left: 80, right: 80 },
            shading: ri === 0 ? { fill: 'EEF2F8', type: D.ShadingType.CLEAR, color: 'auto' } : undefined,
            children: [new D.Paragraph({ children: [new D.TextRun({ text: c, bold: ri === 0, size: 18 })] })],
          })),
        })),
      }));
      kids.push(new D.Paragraph({ children: [] }));
    }
  }
  const doc = new D.Document({
    styles: { default: { document: { run: { font: 'Arial', size: 22 } } } },
    numbering: { config: [{ reference: 'bul', levels: [{ level: 0, format: D.LevelFormat.BULLET, text: '\u2022', alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] }] },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } } }, children: kids }],
  });
  return Buffer.from(await D.Packer.toBuffer(doc));
}

// ---------------------------------------------------------------- vakalatnama
function buildVakalatnamaText({ clientName, parentage, forumText, matterText, lawyerName, barNo, barName, referenceCode, dateText }) {
  return [
    '## VAKALATNAMA',
    `Reference: ${referenceCode}`,
    '',
    `IN THE COURT / BEFORE: ${forumText || '______________________________'}`,
    `IN THE MATTER OF: ${matterText}`,
    '',
    `I / We, ${clientName}${parentage ? ', ' + parentage : ''}, the undersigned, do hereby appoint and constitute`,
    `${lawyerName}, Advocate (Bar Council enrolment no. ${barNo}${barName ? ', ' + barName : ''}),`,
    'as my counsel in the above matter, and authorise him/her to:',
    '- appear, plead and act on my behalf before the court, authority or agency concerned;',
    '- file, sign and verify applications, complaints, replies and other documents;',
    '- receive notices and documents on my behalf and to inspect the record;',
    '- engage other counsel to assist, where necessary and with my consent.',
    '',
    'I agree to pay the agreed fee, if any, and to cooperate with my counsel. I understand that I may withdraw this authority at any time by written notice.',
    '',
    `Dated: ${dateText}`,
    '',
    'Signature / thumb impression of the client: ______________________',
    '',
    'Witness 1 (name, signature): ______________________',
    'Witness 2 (name, signature): ______________________',
    '',
    'Accepted: ______________________  Advocate',
    '',
    'Template prepared by SafeVoice PK for review by the advocate before signing. The advocate may need to change it to suit the court or authority.',
  ].join('\n');
}

module.exports = { buildComplaintText, parseBlocks, blocksToPdf, blocksToDocx, buildVakalatnamaText, VALUE_LABELS };
