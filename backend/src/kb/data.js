'use strict';
// Starter legal knowledge base (loaded by `npm run migrate`, only inserts what is missing).
// SAMPLE CONTENT for a university project. It was checked against public sources in November 2026
// (PECA 2016 sections 20, 21, 22 and 24; NCCIA helpline 1799; Punjab helplines 1043, 1737, 1121; MoHR 1099; Madadgaar 1098)
// but it is legal INFORMATION, not legal advice. Administrators can edit everything in the Admin panel,
// and each rule carries a version and a review date. Always confirm the current law with a lawyer.

const REVIEW = '2026-11-20';

const categories = [
  { code: 'CYBER_HARASSMENT', name_en: 'Online harassment, stalking and blackmail', name_ur: 'آن لائن ہراسانی، تعاقب اور بلیک میلنگ', description: 'Repeated unwanted contact, threats, intimidation or blackmail through phones, messaging apps or social media.' },
  { code: 'IMAGE_ABUSE', name_en: 'Misuse of private photos or videos', name_ur: 'نجی تصاویر یا ویڈیوز کا غلط استعمال', description: 'Private or edited images or videos shared, threatened to be shared, or used to pressure a person.' },
  { code: 'FRAUD_IMPERSONATION', name_en: 'Fake profile, hacked account or online fraud', name_ur: 'جعلی پروفائل، ہیک شدہ اکاؤنٹ یا آن لائن فراڈ', description: 'Someone pretends to be you, takes over your account or cheats you online.' },
  { code: 'DOMESTIC_VIOLENCE', name_en: 'Domestic violence and abuse', name_ur: 'گھریلو تشدد اور بدسلوکی', description: 'Physical, emotional, sexual or economic abuse, or threats, by a partner or family member.' },
  { code: 'CHILD_ABUSE', name_en: 'Abuse or online exploitation of a child', name_ur: 'بچے کے ساتھ بدسلوکی یا آن لائن استحصال', description: 'A person under 18 is being abused, groomed, threatened or exploited, online or offline.' },
];

const statutes = [
  { short_code: 'PECA2016', name: 'Prevention of Electronic Crimes Act, 2016', year: 2016 },
  { short_code: 'PPC', name: 'Pakistan Penal Code, 1860', year: 1860 },
  { short_code: 'PPWAVA2016', name: 'Punjab Protection of Women against Violence Act, 2016', year: 2016 },
];

const offences = [
  { code: 'PECA_S20', statute: 'PECA2016', title_en: 'Offences against the dignity of a natural person', title_ur: 'کسی شخص کے وقار کے خلاف جرائم', section_ref: 'Section 20',
    ingredients_text: 'Intentionally and publicly displaying or sending information that the offender knows to be false and that intimidates a person or harms their reputation or privacy.' },
  { code: 'PECA_S21', statute: 'PECA2016', title_en: 'Offences against the modesty of a natural person or minor', title_ur: 'کسی شخص یا نابالغ کی عزت و حیا کے خلاف جرائم', section_ref: 'Section 21',
    ingredients_text: 'Includes placing a person\u2019s face on a sexually explicit image or video, and threatening a person with a sexual act or with sexually explicit images or videos of them. Stronger provisions apply where the victim is a minor.' },
  { code: 'PECA_S22', statute: 'PECA2016', title_en: 'Child pornography', title_ur: 'بچوں کی فحش مواد سے متعلق جرم', section_ref: 'Section 22',
    ingredients_text: 'Producing, possessing, sharing or distributing sexually explicit material that shows a minor.' },
  { code: 'PECA_S24', statute: 'PECA2016', title_en: 'Cyber stalking', title_ur: 'سائبر اسٹاکنگ (آن لائن تعاقب)', section_ref: 'Section 24',
    ingredients_text: 'Repeatedly following, contacting or monitoring a person through electronic means after they have clearly shown they do not want contact, or otherwise intimidating them online.' },
  { code: 'PECA_S3', statute: 'PECA2016', title_en: 'Unauthorised access to an information system or data', title_ur: 'معلوماتی نظام یا ڈیٹا تک غیر مجاز رسائی', section_ref: 'Section 3',
    ingredients_text: 'Gaining access to someone\u2019s account, phone or data without permission.' },
  { code: 'PECA_S14', statute: 'PECA2016', title_en: 'Electronic fraud', title_ur: 'الیکٹرانک فراڈ', section_ref: 'Section 14',
    ingredients_text: 'Using an information system to deceive a person for gain or to cause loss.' },
  { code: 'PECA_S16', statute: 'PECA2016', title_en: 'Unauthorised use of identity information', title_ur: 'شناختی معلومات کا غیر مجاز استعمال', section_ref: 'Section 16',
    ingredients_text: 'Using another person\u2019s identity information (for example a name, photo or number) without permission, including to create a fake profile.' },
  { code: 'PPC_S506', statute: 'PPC', title_en: 'Criminal intimidation', title_ur: 'مجرمانہ دھمکی', section_ref: 'Section 506',
    ingredients_text: 'Threatening a person with injury to their person, reputation or property to cause alarm or to make them do something they are not legally bound to do.' },
  { code: 'PPC_S509', statute: 'PPC', title_en: 'Insulting the modesty of a woman', title_ur: 'عورت کی عزت و حیا کی توہین', section_ref: 'Section 509',
    ingredients_text: 'Words, gestures or acts, including harassing conduct, intended to insult the modesty of a woman.' },
  { code: 'PPC_HURT', statute: 'PPC', title_en: 'Hurt and related offences against the body', title_ur: 'ضرب اور جسم کے خلاف متعلقہ جرائم', section_ref: 'Chapter XVI',
    ingredients_text: 'Causing physical hurt to a person. The exact section depends on the injury, so a medical report is important.' },
  { code: 'PPC_S377A', statute: 'PPC', title_en: 'Sexual abuse', title_ur: 'جنسی بدسلوکی', section_ref: 'Sections 377A and 377B',
    ingredients_text: 'Sexual abuse of a person, including a child. Check the current text and punishment with a lawyer.' },
  { code: 'PPWAVA_PROT', statute: 'PPWAVA2016', title_en: 'Protection against domestic, psychological, economic and cyber abuse of women', title_ur: 'خواتین کے خلاف گھریلو، نفسیاتی، معاشی اور سائبر تشدد سے تحفظ', section_ref: null,
    ingredients_text: 'The Act protects women in Punjab from violence including domestic, psychological, economic and sexual abuse, stalking and cybercrime. It provides protection orders, residence orders, Violence Against Women Centres and shelter.' },
];

const forums = [
  { code: 'NCCIA', name_en: 'National Cyber Crime Investigation Agency (NCCIA)', name_ur: 'نیشنل سائبر کرائم انویسٹی گیشن ایجنسی (NCCIA)', forum_type: 'INVESTIGATION',
    contact_info: 'Helpline 1799. Complaints can also be made at an NCCIA zonal office. NCCIA took over from the FIA Cyber Crime Wing in 2025.' },
  { code: 'POLICE', name_en: 'Police station / Police Helpline 15', name_ur: 'تھانہ / پولیس ہیلپ لائن 15', forum_type: 'POLICE',
    contact_info: 'Call 15 in an emergency. Visit the nearest police station (ask for the women help desk where available) to report an offence.' },
  { code: 'PTA', name_en: 'Platform report, then PTA complaint portal (content removal)', name_ur: 'پلیٹ فارم پر رپورٹ، پھر PTA شکایت پورٹل (مواد ہٹانے کے لیے)', forum_type: 'REGULATOR',
    contact_info: 'Report to the social media platform first. If the content stays, complain to PTA through its online complaint portal. PTA helpline 0800-55055.' },
  { code: 'WPC', name_en: 'Violence Against Women Centre / Women Protection Centre (Punjab)', name_ur: 'ویمن پروٹیکشن سینٹر / وائلنس اگینسٹ ویمن سینٹر (پنجاب)', forum_type: 'PROTECTION',
    contact_info: 'Punjab Women\u2019s Helpline 1043 and Women Protection Helpline 1737 can direct you to the nearest centre, shelter, medical and legal help.' },
  { code: 'CPWB', name_en: 'Child Protection and Welfare Bureau (Punjab)', name_ur: 'چائلڈ پروٹیکشن اینڈ ویلفیئر بیورو (پنجاب)', forum_type: 'PROTECTION',
    contact_info: 'Child helpline 1121.' },
];

const NCCIA_PROC_EN = [
  '1. Do not delete anything. Keep the chats, calls and profiles exactly as they are, and store them in your vault.',
  '2. Report the account or content to the platform (WhatsApp, Facebook, Instagram, TikTok and so on).',
  '3. Complain to NCCIA: call 1799 or visit your nearest NCCIA zonal office, and give them the complaint draft and the evidence index.',
  '4. Note the complaint number and keep following up. A lawyer can help if there is no response.',
].join('\n');
const NCCIA_PROC_UR = [
  '1. کچھ بھی ڈیلیٹ نہ کریں۔ چیٹس، کالز اور پروفائلز جیسے ہیں ویسے ہی رہنے دیں اور اپنے والٹ میں محفوظ کریں۔',
  '2. اکاؤنٹ یا مواد کی متعلقہ پلیٹ فارم (واٹس ایپ، فیس بک، انسٹاگرام، ٹک ٹاک وغیرہ) پر رپورٹ کریں۔',
  '3. NCCIA میں شکایت کریں: 1799 پر کال کریں یا قریبی NCCIA دفتر جائیں، اور شکایت کا مسودہ اور ثبوت کی فہرست ساتھ دیں۔',
  '4. شکایت نمبر نوٹ کریں اور پیروی کرتے رہیں۔ جواب نہ ملے تو وکیل مدد کر سکتا ہے۔',
].join('\n');
const POLICE_PROC_EN = [
  '1. If you are in danger now, call 15.',
  '2. Go to the nearest police station (the women help desk if there is one) and report the offence. You can ask for an FIR to be registered.',
  '3. Take the complaint draft, your identity document and the evidence index. Keep copies.',
  '4. If you were injured, ask for a medico-legal examination as soon as possible.',
].join('\n');
const POLICE_PROC_UR = [
  '1. اگر آپ ابھی خطرے میں ہیں تو 15 پر کال کریں۔',
  '2. قریبی تھانے (اگر ہو تو ویمن ہیلپ ڈیسک) جا کر جرم کی رپورٹ کریں۔ آپ ایف آئی آر درج کرنے کا مطالبہ کر سکتی/سکتے ہیں۔',
  '3. شکایت کا مسودہ، شناختی دستاویز اور ثبوت کی فہرست ساتھ لے جائیں۔ سب کی نقول رکھیں۔',
  '4. اگر آپ زخمی ہوئی/ہوئے ہیں تو جلد از جلد میڈیکو لیگل معائنہ کروائیں۔',
].join('\n');
const PTA_PROC_EN = [
  '1. Save evidence of the content before it is removed (screenshots and links in your vault).',
  '2. Use the platform\u2019s report tool to ask for removal.',
  '3. If it is not removed, complain to PTA through its online complaint portal (helpline 0800-55055) under the web content category.',
].join('\n');
const PTA_PROC_UR = [
  '1. مواد ہٹنے سے پہلے اس کا ثبوت (اسکرین شاٹ اور لنکس) اپنے والٹ میں محفوظ کریں۔',
  '2. ہٹانے کے لیے پلیٹ فارم کا رپورٹ ٹول استعمال کریں۔',
  '3. مواد نہ ہٹے تو PTA کے آن لائن شکایت پورٹل (ہیلپ لائن 0800-55055) پر ویب کنٹینٹ کے زمرے میں شکایت کریں۔',
].join('\n');
const WPC_PROC_EN = [
  '1. Call the Punjab Women\u2019s Helpline 1043 or the Women Protection Helpline 1737 (24 hours).',
  '2. They can connect you to the Violence Against Women Centre or Women Protection Centre in your district, a shelter, medical help and legal help.',
  '3. Ask about a protection order or a residence order under the Punjab Protection of Women against Violence Act, 2016.',
  '4. If you are in immediate danger, call 15.',
].join('\n');
const WPC_PROC_UR = [
  '1. پنجاب ویمن ہیلپ لائن 1043 یا ویمن پروٹیکشن ہیلپ لائن 1737 (24 گھنٹے) پر کال کریں۔',
  '2. وہ آپ کو اپنے ضلع کے وائلنس اگینسٹ ویمن سینٹر یا ویمن پروٹیکشن سینٹر، شیلٹر، طبی اور قانونی مدد سے ملا سکتے ہیں۔',
  '3. پنجاب تحفظِ خواتین ایکٹ 2016 کے تحت پروٹیکشن آرڈر یا ریزیڈنس آرڈر کے بارے میں پوچھیں۔',
  '4. فوری خطرہ ہو تو 15 پر کال کریں۔',
].join('\n');
const CPWB_PROC_EN = [
  '1. Call the Child Protection and Welfare Bureau helpline 1121. A parent, guardian or trusted adult can call on behalf of the child.',
  '2. If the child is in danger now, call 15.',
  '3. Do not confront the abuser. Keep any messages or images as evidence in the vault and do not share them further.',
  '4. Seek medical care for the child if needed and ask for a medico-legal examination where there are injuries.',
].join('\n');
const CPWB_PROC_UR = [
  '1. چائلڈ پروٹیکشن اینڈ ویلفیئر بیورو کی ہیلپ لائن 1121 پر کال کریں۔ والدین، سرپرست یا کوئی قابلِ اعتماد بالغ بچے کی طرف سے کال کر سکتا ہے۔',
  '2. اگر بچہ ابھی خطرے میں ہے تو 15 پر کال کریں۔',
  '3. بدسلوکی کرنے والے کا سامنا نہ کریں۔ پیغامات یا تصاویر ثبوت کے طور پر والٹ میں رکھیں اور آگے شیئر نہ کریں۔',
  '4. ضرورت ہو تو بچے کا طبی معائنہ کروائیں اور زخم ہوں تو میڈیکو لیگل معائنہ کا کہیں۔',
].join('\n');

// condition_json: { all: [ { q: 'question key', op: 'eq' | 'ne' | 'in' | 'exists', v: value } ] }. No condition means "always".
const rules = [
  { category: 'CYBER_HARASSMENT', offence: 'PECA_S24', forum: 'NCCIA', title: 'Cyber stalking and harassment', condition: {}, en: NCCIA_PROC_EN, ur: NCCIA_PROC_UR },
  { category: 'CYBER_HARASSMENT', offence: 'PPC_S506', forum: 'POLICE', title: 'Threats and intimidation', condition: { all: [{ q: 'money_demanded', op: 'eq', v: 'yes' }] }, en: POLICE_PROC_EN, ur: POLICE_PROC_UR },
  { category: 'CYBER_HARASSMENT', offence: 'PPC_S509', forum: 'POLICE', title: 'Harassment of a woman', condition: { all: [{ q: 'offender_known', op: 'in', v: ['known', 'family'] }] }, en: POLICE_PROC_EN, ur: POLICE_PROC_UR },
  { category: 'IMAGE_ABUSE', offence: 'PECA_S21', forum: 'NCCIA', title: 'Misuse of images and threats to share them', condition: {}, en: NCCIA_PROC_EN, ur: NCCIA_PROC_UR },
  { category: 'IMAGE_ABUSE', offence: 'PPC_S506', forum: 'POLICE', title: 'Criminal intimidation', condition: { all: [{ q: 'money_demanded', op: 'eq', v: 'yes' }] }, en: POLICE_PROC_EN, ur: POLICE_PROC_UR },
  { category: 'IMAGE_ABUSE', offence: 'PECA_S21', forum: 'PTA', title: 'Images already posted: removal', condition: { all: [{ q: 'images_shared', op: 'eq', v: 'yes' }] }, en: PTA_PROC_EN, ur: PTA_PROC_UR },
  { category: 'FRAUD_IMPERSONATION', offence: 'PECA_S16', forum: 'NCCIA', title: 'Fake profile or misuse of identity', condition: {}, en: NCCIA_PROC_EN, ur: NCCIA_PROC_UR },
  { category: 'FRAUD_IMPERSONATION', offence: 'PECA_S3', forum: 'NCCIA', title: 'Hacked account', condition: { all: [{ q: 'platform', op: 'in', v: ['whatsapp', 'facebook', 'instagram', 'tiktok', 'other_online'] }] }, en: NCCIA_PROC_EN, ur: NCCIA_PROC_UR },
  { category: 'FRAUD_IMPERSONATION', offence: 'PECA_S14', forum: 'NCCIA', title: 'Online fraud', condition: { all: [{ q: 'money_demanded', op: 'eq', v: 'yes' }] }, en: NCCIA_PROC_EN, ur: NCCIA_PROC_UR },
  { category: 'DOMESTIC_VIOLENCE', offence: 'PPWAVA_PROT', forum: 'WPC', title: 'Protection order and shelter', condition: {}, en: WPC_PROC_EN, ur: WPC_PROC_UR },
  { category: 'DOMESTIC_VIOLENCE', offence: 'PPC_HURT', forum: 'POLICE', title: 'Physical injury', condition: { all: [{ q: 'injury', op: 'eq', v: 'yes' }] }, en: POLICE_PROC_EN, ur: POLICE_PROC_UR },
  { category: 'DOMESTIC_VIOLENCE', offence: 'PPC_S506', forum: 'POLICE', title: 'Threats', condition: { all: [{ q: 'offender_known', op: 'in', v: ['known', 'family'] }] }, en: POLICE_PROC_EN, ur: POLICE_PROC_UR },
  { category: 'CHILD_ABUSE', offence: 'PECA_S21', forum: 'NCCIA', title: 'Online exploitation of a child', condition: { all: [{ q: 'platform', op: 'in', v: ['whatsapp', 'facebook', 'instagram', 'tiktok', 'other_online'] }] }, en: NCCIA_PROC_EN, ur: NCCIA_PROC_UR },
  { category: 'CHILD_ABUSE', offence: 'PECA_S22', forum: 'NCCIA', title: 'Sexual images of a child', condition: { all: [{ q: 'images_shared', op: 'eq', v: 'yes' }] }, en: NCCIA_PROC_EN, ur: NCCIA_PROC_UR },
  { category: 'CHILD_ABUSE', offence: 'PPC_S377A', forum: 'POLICE', title: 'Sexual abuse of a child', condition: {}, en: POLICE_PROC_EN, ur: POLICE_PROC_UR },
  { category: 'CHILD_ABUSE', offence: 'PPC_S377A', forum: 'CPWB', title: 'Child protection services', condition: {}, en: CPWB_PROC_EN, ur: CPWB_PROC_UR },
  // Global rule: applies to any category when the person affected is under 18
  { category: null, offence: 'PECA_S21', forum: 'CPWB', title: 'A minor is involved', condition: { all: [{ q: 'victim_is_child', op: 'eq', v: 'yes' }] }, en: CPWB_PROC_EN, ur: CPWB_PROC_UR },
];

const O = (value, en, ur, category) => ({ value, label_en: en, label_ur: ur, ...(category ? { category } : {}) });
const YN = [O('yes', 'Yes', 'جی ہاں'), O('no', 'No', 'نہیں')];

const questions = [
  { q_key: 'incident_type', applies: [], order: 10, mandatory: true, type: 'SINGLE',
    en: 'What best describes what happened?', ur: 'جو کچھ ہوا اسے سب سے بہتر کیا بیان کرتا ہے؟',
    options: [
      O('harassment', 'Threats, blackmail or repeated harassment online', 'آن لائن دھمکیاں، بلیک میلنگ یا بار بار ہراسانی', 'CYBER_HARASSMENT'),
      O('images', 'Private photos or videos shared, or threatened to be shared', 'نجی تصاویر یا ویڈیوز شیئر کی گئیں یا شیئر کرنے کی دھمکی دی گئی', 'IMAGE_ABUSE'),
      O('fraud', 'Fake profile, hacked account or online fraud', 'جعلی پروفائل، ہیک شدہ اکاؤنٹ یا آن لائن فراڈ', 'FRAUD_IMPERSONATION'),
      O('domestic', 'Violence or abuse at home', 'گھر میں تشدد یا بدسلوکی', 'DOMESTIC_VIOLENCE'),
      O('child', 'A child is being abused or exploited', 'کسی بچے کے ساتھ بدسلوکی یا استحصال ہو رہا ہے', 'CHILD_ABUSE'),
    ] },
  { q_key: 'victim_is_child', applies: [], order: 20, mandatory: true, type: 'YESNO', en: 'Is the person affected under 18 years old?', ur: 'کیا متاثرہ شخص کی عمر 18 سال سے کم ہے؟', options: YN },
  { q_key: 'immediate_danger', applies: [], order: 30, mandatory: false, type: 'YESNO', en: 'Are you in immediate danger right now?', ur: 'کیا آپ اس وقت فوری خطرے میں ہیں؟', options: YN },
  { q_key: 'offender_known', applies: [], order: 40, mandatory: false, type: 'SINGLE', en: 'Do you know who is doing this?', ur: 'کیا آپ جانتی/جانتے ہیں کہ یہ کون کر رہا ہے؟',
    options: [O('known', 'Yes, someone I know', 'جی ہاں، کوئی جاننے والا'), O('family', 'Yes, a family member or partner', 'جی ہاں، خاندان کا فرد یا شریکِ حیات'), O('unknown', 'No, I do not know', 'نہیں، مجھے معلوم نہیں')] },
  { q_key: 'platform', applies: [], order: 50, mandatory: false, type: 'SINGLE', en: 'Where is it happening?', ur: 'یہ کہاں ہو رہا ہے؟',
    options: [O('whatsapp', 'WhatsApp', 'واٹس ایپ'), O('facebook', 'Facebook', 'فیس بک'), O('instagram', 'Instagram', 'انسٹاگرام'), O('tiktok', 'TikTok', 'ٹک ٹاک'), O('other_online', 'Another app, website or phone call', 'کوئی اور ایپ، ویب سائٹ یا فون کال'), O('not_online', 'Not online', 'آن لائن نہیں')] },
  { q_key: 'incident_start', applies: [], order: 60, mandatory: false, type: 'DATE', en: 'Approximately when did it start?', ur: 'تقریباً کب شروع ہوا؟', options: null },
  { q_key: 'ongoing', applies: [], order: 70, mandatory: true, type: 'YESNO', en: 'Is it still happening?', ur: 'کیا یہ اب بھی جاری ہے؟', options: YN },
  { q_key: 'city', applies: [], order: 80, mandatory: false, type: 'TEXT', en: 'Which city are you in? (helps to find lawyers and support near you)', ur: 'آپ کس شہر میں ہیں؟ (قریبی وکلاء اور مدد تلاش کرنے کے لیے)', options: null },
  { q_key: 'money_demanded', applies: ['CYBER_HARASSMENT', 'IMAGE_ABUSE', 'FRAUD_IMPERSONATION'], order: 110, mandatory: false, type: 'YESNO', en: 'Has money or anything else been demanded?', ur: 'کیا پیسے یا کسی اور چیز کا مطالبہ کیا گیا ہے؟', options: YN },
  { q_key: 'images_shared', applies: ['IMAGE_ABUSE', 'CHILD_ABUSE'], order: 120, mandatory: false, type: 'YESNO', en: 'Have images or videos already been posted or sent to others?', ur: 'کیا تصاویر یا ویڈیوز پہلے ہی پوسٹ یا دوسروں کو بھیجی جا چکی ہیں؟', options: YN },
  { q_key: 'injury', applies: ['DOMESTIC_VIOLENCE'], order: 130, mandatory: false, type: 'YESNO', en: 'Were you physically injured?', ur: 'کیا آپ جسمانی طور پر زخمی ہوئی/ہوئے؟', options: YN },
  { q_key: 'summary', applies: [], order: 200, mandatory: false, type: 'TEXT', en: 'Describe what happened in your own words (optional, stored encrypted, never shown to lawyers unless you write it in your request).', ur: 'جو ہوا اپنے الفاظ میں لکھیں (اختیاری، انکرپٹڈ رہتا ہے، آپ خود درخواست میں نہ لکھیں تو وکلاء کو نہیں دکھایا جاتا)۔', options: null },
];

// Support directory. Verified against public government and news sources in November 2026. Confirm before relying on a number.
const support = [
  { name: 'Police Emergency (Helpline 15)', name_ur: 'پولیس ایمرجنسی (ہیلپ لائن 15)', entry_type: 'HELPLINE', national: true, city: null, phone: '15', description: 'Emergency police help. Police helplines are also linked with the NCCIA system for cyber complaints.', cats: ['CYBER_HARASSMENT', 'IMAGE_ABUSE', 'FRAUD_IMPERSONATION', 'DOMESTIC_VIOLENCE', 'CHILD_ABUSE'] },
  { name: 'NCCIA Cybercrime Helpline', name_ur: 'NCCIA سائبر کرائم ہیلپ لائن', entry_type: 'HELPLINE', national: true, city: null, phone: '1799', description: 'National Cyber Crime Investigation Agency helpline for online harassment, blackmail, fraud and misuse of images.', cats: ['CYBER_HARASSMENT', 'IMAGE_ABUSE', 'FRAUD_IMPERSONATION', 'CHILD_ABUSE'] },
  { name: 'Punjab Women\u2019s Toll-Free Helpline', name_ur: 'پنجاب ویمن ٹول فری ہیلپ لائن', entry_type: 'HELPLINE', national: false, city: 'Punjab', phone: '1043', description: '24/7 helpline (Punjab Commission on the Status of Women) for women facing violence, harassment or denial of rights. Legal guidance and referrals.', cats: ['DOMESTIC_VIOLENCE', 'CYBER_HARASSMENT', 'IMAGE_ABUSE'] },
  { name: 'Punjab Women Protection Helpline', name_ur: 'پنجاب ویمن پروٹیکشن ہیلپ لائن', entry_type: 'HELPLINE', national: false, city: 'Punjab', phone: '1737', description: 'Punjab Women Protection Authority helpline linked to Women Protection Centres.', cats: ['DOMESTIC_VIOLENCE'] },
  { name: 'Ministry of Human Rights Legal Advice Helpline', name_ur: 'وزارتِ انسانی حقوق قانونی مشورہ ہیلپ لائن', entry_type: 'HELPLINE', national: true, city: null, phone: '1099', description: 'Free legal advice on human rights violations, including for women and children.', cats: ['DOMESTIC_VIOLENCE', 'CYBER_HARASSMENT', 'IMAGE_ABUSE', 'CHILD_ABUSE', 'FRAUD_IMPERSONATION'] },
  { name: 'Madadgaar National Helpline', name_ur: 'مددگار نیشنل ہیلپ لائن', entry_type: 'HELPLINE', national: true, city: null, phone: '1098', description: 'National helpline for gender-based violence and child protection.', cats: ['DOMESTIC_VIOLENCE', 'CHILD_ABUSE'] },
  { name: 'Child Protection and Welfare Bureau Helpline', name_ur: 'چائلڈ پروٹیکشن اینڈ ویلفیئر بیورو ہیلپ لائن', entry_type: 'HELPLINE', national: false, city: 'Punjab', phone: '1121', description: 'Punjab child helpline for children facing violence, exploitation, abuse or neglect.', cats: ['CHILD_ABUSE'] },
  { name: 'Digital Rights Foundation Cyber Harassment Helpline', name_ur: 'ڈیجیٹل رائٹس فاؤنڈیشن سائبر ہراسمنٹ ہیلپ لائن', entry_type: 'NGO', national: true, city: null, phone: '0800-39393', description: 'Free, confidential support, digital security help and legal guidance for people facing online harassment (weekday office hours).', cats: ['CYBER_HARASSMENT', 'IMAGE_ABUSE', 'FRAUD_IMPERSONATION'] },
  { name: 'PTA Complaint Helpline', name_ur: 'پی ٹی اے شکایت ہیلپ لائن', entry_type: 'GOV_OFFICE', national: true, city: null, phone: '0800-55055', description: 'Pakistan Telecommunication Authority: complaints about harmful online content (after reporting to the platform) and unauthorised SIMs.', cats: ['IMAGE_ABUSE', 'CYBER_HARASSMENT', 'FRAUD_IMPERSONATION'] },
];

module.exports = { REVIEW, categories, statutes, offences, forums, rules, questions, support };
