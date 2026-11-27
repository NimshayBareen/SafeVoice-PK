import { createContext, useContext, useEffect, useState, useCallback } from 'react';

const en = {
  'nav.home': 'Home', 'nav.cases': 'My Cases', 'nav.login': 'Log in', 'nav.register': 'Register', 'nav.logout': 'Log out',
  'nav.quickExit': 'QUICK EXIT', 'nav.lang': 'اردو',
  'hero.badge': 'Cybercrime  •  Women  •  Children',
  'hero.title': 'Your Voice. Your Evidence. Your Right to Justice.',
  'hero.sub': 'A secure place to keep evidence of cybercrime and of crimes against women and children, understand your legal options, and reach verified advocates, discreetly and safely.',
  'hero.cta1': 'Get started', 'hero.cta2': 'I already have an account',
  'hero.note': 'Legal information and tools, not legal advice.',
  'sec.how': 'How SafeVoice PK protects you',
  'tag.live': 'Available now', 'tag.soon': 'Coming in the full version',
  'f1.t': 'Secure Evidence Vault', 'f1.d': 'Upload screenshots, chats, audio and links. Every file is fingerprinted (SHA-256) and encrypted (AES-256).',
  'f2.t': 'Proof that nothing changed', 'f2.d': 'Check integrity at any time and see a tamper-evident chain of custody for every item.',
  'f3.t': 'Private and discreet', 'f3.d': 'Alias accounts, neutral names and a Quick Exit button on every page.',
  'f4.t': 'Know your legal route', 'f4.d': 'Answer simple questions and see likely offences, laws, procedure and the right forum in Urdu or English.',
  'f5.t': 'Verified advocates', 'f5.d': 'Find Bar Council-verified lawyers and share evidence only with your consent.',
  'f6.t': 'Ready-to-file complaint', 'f6.d': 'Generate a complaint draft with your evidence index as PDF or Word.',
  'protect.title': 'Who SafeVoice PK protects',
  'p1.t': 'Women', 'p1.d': 'Online harassment, blackmail, stalking, misuse of images and domestic abuse.',
  'p2.t': 'Children', 'p2.d': 'Online exploitation, threats and abuse. Evidence is kept safe for guardians and lawyers.',
  'p3.t': 'Cybercrime victims', 'p3.d': 'Hacking, fraud, impersonation, threats and image-based abuse under cyber law (PECA 2016).',
  'footer.text': 'SafeVoice PK gives legal information and tools, not legal advice. If you are in danger now, contact emergency services immediately.',
  'footer.exit': 'Tip: press Esc three times to leave this site at once.',
  'register.title': 'Create your account', 'register.email': 'Email', 'register.mobile': 'Mobile number (optional)',
  'register.alias': 'Alias (optional)', 'register.aliasHint': 'You do not need to use your real name.',
  'register.password': 'Password', 'register.passwordHint': 'At least 10 characters with upper case, lower case, a digit and a symbol.',
  'register.submit': 'Register', 'register.have': 'Already registered? Log in',
  'register.success': 'Registration received. Please verify your account using the link we sent you.',
  'register.devNote': 'Demo mode: no e-mail server is connected, so the link is shown here.', 'register.verifyNow': 'Verify now',
  'login.title': 'Log in to your account', 'login.identifier': 'Email or mobile number', 'login.submit': 'Log in',
  'login.no': 'No account yet? Register', 'login.expired': 'Your session has ended. Please log in again.',
  'login.verified': 'Your account is verified. Please log in.',
  'verify.working': 'Verifying…', 'verify.ok': 'Your account is verified.', 'verify.fail': 'This link is invalid or has expired.',
  'dash.hello': 'Welcome', 'dash.title': 'My Cases', 'dash.new': 'Start a new case',
  'dash.empty': 'No cases yet. Start a case and begin keeping your evidence safe.', 'dash.items': 'evidence items',
  'dash.open': 'Open evidence vault', 'dash.ref': 'Case',
  'status.DRAFT': 'Draft',
  'vault.title': 'Evidence Vault', 'vault.upload': 'Upload evidence', 'vault.choose': 'Choose a file',
  'vault.description': 'Short description (optional)', 'vault.uploadBtn': 'Upload',
  'vault.supported': 'Images, audio, video, PDF, text or Word. Up to 25 MB.',
  'vault.urlTitle': 'Save a web link', 'vault.urlLabel': 'Link', 'vault.saveUrl': 'Save link',
  'col.item': 'Item', 'col.type': 'Type', 'col.added': 'Added', 'col.hash': 'SHA-256 (start)', 'col.integrity': 'Integrity', 'col.actions': 'Actions',
  'vault.verify': 'Verify', 'vault.verifyAll': 'Verify all', 'vault.download': 'Download', 'vault.empty': 'No evidence yet.',
  'vault.encrypted': 'Every file is encrypted (AES-256). Every upload, check and download is written to the chain of custody.',
  'res.MATCH': 'Verified', 'res.MISMATCH': 'ALTERED!', 'res.ERROR': 'File unreadable', 'res.NONE': 'Not checked yet',
  'custody.title': 'Chain of custody', 'custody.ok': 'Chain intact', 'custody.broken': 'Chain BROKEN',
  'custody.sub': 'Every upload, check and download is recorded here and cannot be changed.',
  'type.IMAGE': 'Image', 'type.AUDIO': 'Audio', 'type.VIDEO': 'Video', 'type.DOCUMENT': 'Document', 'type.URL': 'Link',
  'act.UPLOAD': 'Uploaded', 'act.VERIFY': 'Integrity check', 'act.DOWNLOAD': 'Downloaded', 'act.SHARE': 'Shared with your lawyer', 'act.REVOKE': 'Sharing stopped', 'act.VIEW': 'Viewed',
  'common.loading': 'Loading…', 'common.back': 'Back',
};

const ur = {
  'nav.home': 'ہوم', 'nav.cases': 'میرے کیسز', 'nav.login': 'لاگ اِن', 'nav.register': 'رجسٹر کریں', 'nav.logout': 'لاگ آؤٹ',
  'nav.quickExit': 'فوری باہر نکلیں', 'nav.lang': 'English',
  'hero.badge': 'سائبر کرائم  •  خواتین  •  بچے',
  'hero.title': 'آپ کی آواز۔ آپ کا ثبوت۔ انصاف آپ کا حق۔',
  'hero.sub': 'سائبر کرائم اور خواتین و بچوں کے خلاف جرائم کے ثبوت محفوظ رکھنے، اپنے قانونی راستے سمجھنے اور تصدیق شدہ وکلاء تک پہنچنے کی ایک محفوظ جگہ، رازداری کے ساتھ۔',
  'hero.cta1': 'آغاز کریں', 'hero.cta2': 'میرا اکاؤنٹ پہلے سے ہے',
  'hero.note': 'یہ قانونی معلومات اور ٹولز ہیں، قانونی مشورہ نہیں۔',
  'sec.how': 'سیف وائس پاکستان آپ کی حفاظت کیسے کرتا ہے',
  'tag.live': 'دستیاب ہے', 'tag.soon': 'مکمل ورژن میں آ رہا ہے',
  'f1.t': 'محفوظ ثبوت والٹ', 'f1.d': 'اسکرین شاٹس، چیٹس، آڈیو اور لنکس اپ لوڈ کریں۔ ہر فائل کا ہیش (SHA-256) بنتا ہے اور اسے انکرپٹ (AES-256) کیا جاتا ہے۔',
  'f2.t': 'ثبوت میں تبدیلی کا پتا', 'f2.d': 'جب چاہیں سالمیت چیک کریں اور ہر آئٹم کی تبدیلی سے محفوظ چین آف کسٹڈی دیکھیں۔',
  'f3.t': 'نجی اور رازدارانہ', 'f3.d': 'فرضی نام والا اکاؤنٹ، غیر جانبدار نام، اور ہر صفحے پر فوری باہر نکلنے کا بٹن۔',
  'f4.t': 'اپنا قانونی راستہ جانیں', 'f4.d': 'چند سادہ سوالوں کے جواب دیں اور ممکنہ جرائم، قوانین، طریقۂ کار اور درست فورم اردو یا انگریزی میں دیکھیں۔',
  'f5.t': 'تصدیق شدہ وکلاء', 'f5.d': 'بار کونسل سے تصدیق شدہ وکلاء تلاش کریں اور ثبوت صرف اپنی رضامندی سے شیئر کریں۔',
  'f6.t': 'فائل کرنے کے لیے تیار شکایت', 'f6.d': 'ثبوت کی فہرست کے ساتھ شکایت کا مسودہ PDF یا ورڈ میں تیار کریں۔',
  'protect.title': 'سیف وائس پاکستان کن کی حفاظت کرتا ہے',
  'p1.t': 'خواتین', 'p1.d': 'آن لائن ہراسانی، بلیک میلنگ، تعاقب، تصاویر کا غلط استعمال اور گھریلو تشدد۔',
  'p2.t': 'بچے', 'p2.d': 'آن لائن استحصال، دھمکیاں اور بدسلوکی۔ ثبوت سرپرستوں اور وکلاء کے لیے محفوظ رکھا جاتا ہے۔',
  'p3.t': 'سائبر کرائم کے متاثرین', 'p3.d': 'ہیکنگ، فراڈ، جعلسازی، دھمکیاں اور تصویری بدسلوکی، سائبر قانون (PECA 2016) کے تحت۔',
  'footer.text': 'سیف وائس پاکستان قانونی معلومات اور ٹولز فراہم کرتا ہے، قانونی مشورہ نہیں۔ اگر آپ ابھی خطرے میں ہیں تو فوراً ایمرجنسی سروسز سے رابطہ کریں۔',
  'footer.exit': 'مشورہ: اس سائٹ سے فوراً نکلنے کے لیے Esc تین بار دبائیں۔',
  'register.title': 'نیا اکاؤنٹ بنائیں', 'register.email': 'ای میل', 'register.mobile': 'موبائل نمبر (اختیاری)',
  'register.alias': 'فرضی نام (اختیاری)', 'register.aliasHint': 'اصل نام استعمال کرنا ضروری نہیں۔',
  'register.password': 'پاس ورڈ', 'register.passwordHint': 'کم از کم 10 حروف: بڑا حرف، چھوٹا حرف، ہندسہ اور علامت۔',
  'register.submit': 'رجسٹر کریں', 'register.have': 'پہلے سے اکاؤنٹ ہے؟ لاگ اِن کریں',
  'register.success': 'رجسٹریشن موصول ہو گئی۔ براہِ کرم بھیجے گئے لنک سے اکاؤنٹ کی تصدیق کریں۔',
  'register.devNote': 'ڈیمو موڈ: ای میل سرور منسلک نہیں، اس لیے لنک یہاں دکھایا گیا ہے۔', 'register.verifyNow': 'ابھی تصدیق کریں',
  'login.title': 'اپنے اکاؤنٹ میں لاگ اِن کریں', 'login.identifier': 'ای میل یا موبائل نمبر', 'login.submit': 'لاگ اِن',
  'login.no': 'اکاؤنٹ نہیں ہے؟ رجسٹر کریں', 'login.expired': 'آپ کا سیشن ختم ہو گیا ہے۔ دوبارہ لاگ اِن کریں۔',
  'login.verified': 'آپ کے اکاؤنٹ کی تصدیق ہو گئی۔ اب لاگ اِن کریں۔',
  'verify.working': 'تصدیق ہو رہی ہے…', 'verify.ok': 'آپ کے اکاؤنٹ کی تصدیق ہو گئی۔', 'verify.fail': 'یہ لنک غلط ہے یا اس کی میعاد ختم ہو چکی ہے۔',
  'dash.hello': 'خوش آمدید', 'dash.title': 'میرے کیسز', 'dash.new': 'نیا کیس شروع کریں',
  'dash.empty': 'ابھی کوئی کیس نہیں۔ نیا کیس شروع کریں اور اپنا ثبوت محفوظ کرنا شروع کریں۔', 'dash.items': 'ثبوت',
  'dash.open': 'ثبوت والٹ کھولیں', 'dash.ref': 'کیس',
  'status.DRAFT': 'مسودہ',
  'vault.title': 'ثبوت والٹ', 'vault.upload': 'ثبوت اپ لوڈ کریں', 'vault.choose': 'فائل منتخب کریں',
  'vault.description': 'مختصر وضاحت (اختیاری)', 'vault.uploadBtn': 'اپ لوڈ',
  'vault.supported': 'تصاویر، آڈیو، ویڈیو، PDF، ٹیکسٹ یا ورڈ۔ زیادہ سے زیادہ 25 MB۔',
  'vault.urlTitle': 'ویب لنک محفوظ کریں', 'vault.urlLabel': 'لنک', 'vault.saveUrl': 'لنک محفوظ کریں',
  'col.item': 'آئٹم', 'col.type': 'قسم', 'col.added': 'تاریخ', 'col.hash': 'ہیش (SHA-256)', 'col.integrity': 'سالمیت', 'col.actions': 'عمل',
  'vault.verify': 'چیک کریں', 'vault.verifyAll': 'سب چیک کریں', 'vault.download': 'ڈاؤن لوڈ', 'vault.empty': 'ابھی کوئی ثبوت نہیں۔',
  'vault.encrypted': 'ہر فائل انکرپٹڈ (AES-256) ہے۔ ہر اپ لوڈ، چیک اور ڈاؤن لوڈ چین آف کسٹڈی میں درج ہوتا ہے۔',
  'res.MATCH': 'تصدیق شدہ', 'res.MISMATCH': 'تبدیل شدہ!', 'res.ERROR': 'فائل نہیں کھل سکی', 'res.NONE': 'ابھی چیک نہیں ہوا',
  'custody.title': 'چین آف کسٹڈی', 'custody.ok': 'چین محفوظ ہے', 'custody.broken': 'چین ٹوٹ گئی ہے',
  'custody.sub': 'ہر اپ لوڈ، چیک اور ڈاؤن لوڈ یہاں درج ہوتا ہے اور بدلا نہیں جا سکتا۔',
  'type.IMAGE': 'تصویر', 'type.AUDIO': 'آڈیو', 'type.VIDEO': 'ویڈیو', 'type.DOCUMENT': 'دستاویز', 'type.URL': 'لنک',
  'act.UPLOAD': 'اپ لوڈ ہوا', 'act.VERIFY': 'سالمیت کا چیک', 'act.DOWNLOAD': 'ڈاؤن لوڈ ہوا', 'act.SHARE': 'وکیل کے ساتھ شیئر کیا', 'act.REVOKE': 'شیئرنگ بند کی گئی', 'act.VIEW': 'دیکھا گیا',
  'common.loading': 'لوڈ ہو رہا ہے…', 'common.back': 'واپس',
};

const dict = { en, ur };
const LangCtx = createContext(null);
export const useLang = () => useContext(LangCtx);

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('sv_lang') || 'en');
  useEffect(() => {
    localStorage.setItem('sv_lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';
  }, [lang]);
  const t = useCallback((k) => dict[lang][k] || en[k] || k, [lang]);
  const toggle = useCallback(() => setLang((l) => (l === 'en' ? 'ur' : 'en')), []);
  const fmtDate = useCallback((d) => new Date(d).toLocaleString(lang === 'ur' ? 'ur-PK' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }), [lang]);
  // L('English text', 'اردو متن'): inline bilingual text; falls back to English when no Urdu is given
  const L = useCallback((en, urText) => (lang === 'ur' && urText ? urText : en), [lang]);
  return <LangCtx.Provider value={{ lang, t, toggle, fmtDate, L }}>{children}</LangCtx.Provider>;
}
