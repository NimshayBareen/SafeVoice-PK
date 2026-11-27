import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';
import { Alert } from '../components/ui.jsx';

const rules = (p) => [p.length >= 10, /[a-z]/.test(p), /[A-Z]/.test(p), /\d/.test(p), /[^A-Za-z0-9]/.test(p)];
const LANGS = [['ur', 'Urdu / اردو'], ['en', 'English'], ['pa', 'Punjabi'], ['sd', 'Sindhi'], ['ps', 'Pashto']];

export default function Register() {
  const { t, lang, L } = useLang();
  const navigate = useNavigate();
  const [q, setQ] = useSearchParams();
  const role = q.get('as') === 'advocate' ? 'LAWYER' : q.get('as') === 'victim' ? 'VICTIM' : null;
  const [cats, setCats] = useState([]);
  const [f, setF] = useState({ email: '', mobile: '', alias: '', fullName: '', password: '', city: '' });
  const [lw, setLw] = useState({ barCouncilNo: '', barCouncilName: '', city: '', languages: ['ur', 'en'], feeType: 'MIXED', bio: '', categories: [] });
  const [errors, setErrors] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setL = (k) => (e) => setLw({ ...lw, [k]: e.target.value });
  const toggle = (k, v) => setLw({ ...lw, [k]: lw[k].includes(v) ? lw[k].filter((x) => x !== v) : [...lw[k], v] });
  const ok = rules(f.password);

  useEffect(() => { fetch('/api/public/categories').then((r) => r.json()).then((d) => setCats(d.categories || [])).catch(() => {}); }, []);

  async function submit(e) {
    e.preventDefault();
    setErrors([]); setBusy(true);
    try {
      const body = { ...f, role, language: lang };
      if (role === 'LAWYER') body.lawyer = { ...lw, city: lw.city || f.city };
      const d = await api('/auth/register', { method: 'POST', body });
      navigate('/verify?email=' + encodeURIComponent(f.email.trim().toLowerCase()), { state: { devOtp: d.devOtp, emailSent: d.emailSent } });
    } catch (err) {
      setErrors(err.data.messages || [err.message]);
    } finally { setBusy(false); }
  }

  if (!role) {
    return (
      <div className="container narrow wide">
        <h1 className="center-title">{L('Who are you registering as?', 'آپ کس حیثیت سے رجسٹر ہو رہے ہیں؟')}</h1>
        <div className="gold-rule" />
        <div className="grid2 role-grid">
          <button className="card role-card" onClick={() => setQ({ as: 'victim' })}>
            <div className="role-icon">🛡️</div>
            <h3>{L('I need help', 'مجھے مدد چاہیے')}</h3>
            <p>{L('I am a victim, or I am helping a woman, a child or someone affected by cybercrime. I want to keep evidence safe, understand the law and find a lawyer.', 'میں متاثرہ ہوں، یا کسی خاتون، بچے یا سائبر کرائم کے متاثرہ شخص کی مدد کر رہی/رہا ہوں۔ میں ثبوت محفوظ رکھنا، قانون سمجھنا اور وکیل تلاش کرنا چاہتی/چاہتا ہوں۔')}</p>
            <span className="btn btn-gold">{L('Register as Victim', 'متاثرہ کے طور پر رجسٹر کریں')}</span>
          </button>
          <button className="card role-card" onClick={() => setQ({ as: 'advocate' })}>
            <div className="role-icon">⚖️</div>
            <h3>{L('I am an Advocate', 'میں وکیل ہوں')}</h3>
            <p>{L('I am a licensed lawyer and want to help victims. My profile is checked by an administrator before it appears in the directory.', 'میں لائسنس یافتہ وکیل ہوں اور متاثرین کی مدد کرنا چاہتی/چاہتا ہوں۔ ڈائریکٹری میں آنے سے پہلے ایڈمنسٹریٹر میری پروفائل کی جانچ کرتا ہے۔')}</p>
            <span className="btn btn-navy">{L('Register as Advocate', 'وکیل کے طور پر رجسٹر کریں')}</span>
          </button>
        </div>
        <p className="form-foot"><Link to="/login">{t('register.have')}</Link></p>
      </div>
    );
  }

  const adv = role === 'LAWYER';
  return (
    <div className={'container narrow' + (adv ? ' wide' : '')}>
      <form className="card form-card" onSubmit={submit} noValidate>
        <h2>{adv ? L('Create your advocate account', 'وکیل اکاؤنٹ بنائیں') : t('register.title')}</h2>
        <div className="gold-rule left" />
        <p className="muted small"><button type="button" className="linklike dark" onClick={() => setQ({})}>← {L('Change role', 'کردار تبدیل کریں')}</button></p>
        <Alert>{errors.length > 0 && errors.map((m, i) => <div key={i}>{m}</div>)}</Alert>
        {adv && <label>{L('Full name', 'پورا نام')}<input value={f.fullName} onChange={set('fullName')} autoComplete="name" /></label>}
        <label>{t('register.email')}
          <input type="email" value={f.email} onChange={set('email')} autoComplete="email" />
          <small>{L('We send a 6-digit verification code to this email.', 'ہم اس ای میل پر 6 ہندسوں کا تصدیقی کوڈ بھیجتے ہیں۔')}</small>
        </label>
        <label>{t('register.mobile')}<input type="tel" value={f.mobile} onChange={set('mobile')} placeholder="03001234567" autoComplete="tel" /></label>
        {!adv && <label>{t('register.alias')}<input value={f.alias} onChange={set('alias')} maxLength={60} /><small>{t('register.aliasHint')}</small></label>}
        {!adv && <label>{L('City (optional)', 'شہر (اختیاری)')}<input value={f.city} onChange={set('city')} maxLength={60} /></label>}
        <label>{t('register.password')}
          <input type="password" value={f.password} onChange={set('password')} autoComplete="new-password" />
          <small>{t('register.passwordHint')}</small>
        </label>
        <div className="meter" aria-hidden="true">{ok.map((v, i) => <span key={i} className={v ? 'on' : ''} />)}</div>

        {adv && (
          <fieldset className="fieldset">
            <legend>{L('Professional details', 'پیشہ ورانہ تفصیلات')}</legend>
            <label>{L('Bar Council enrolment / licence number', 'بار کونسل اندراج / لائسنس نمبر')}<input value={lw.barCouncilNo} onChange={setL('barCouncilNo')} /></label>
            <label>{L('Bar Council (optional)', 'بار کونسل (اختیاری)')}<input value={lw.barCouncilName} onChange={setL('barCouncilName')} placeholder="Punjab Bar Council" /></label>
            <label>{L('City where you practise', 'جس شہر میں آپ پریکٹس کرتے ہیں')}<input value={lw.city} onChange={setL('city')} /></label>
            <div className="field-group"><span className="lbl">{L('Languages', 'زبانیں')}</span>
              <div className="chips">{LANGS.map(([v, l]) => <label key={v} className={'chip' + (lw.languages.includes(v) ? ' on' : '')}><input type="checkbox" checked={lw.languages.includes(v)} onChange={() => toggle('languages', v)} />{l}</label>)}</div></div>
            <label>{L('Fees', 'فیس')}
              <select value={lw.feeType} onChange={setL('feeType')}>
                <option value="PRO_BONO">{L('Free (pro bono)', 'مفت (پرو بونو)')}</option>
                <option value="PAID">{L('Paid', 'معاوضہ کے ساتھ')}</option>
                <option value="MIXED">{L('Free or paid, depending on the case', 'کیس کے مطابق مفت یا معاوضہ کے ساتھ')}</option>
              </select>
            </label>
            <div className="field-group"><span className="lbl">{L('Areas you help with', 'جن شعبوں میں آپ مدد کرتے ہیں')}</span>
              <div className="chips">{cats.map((c) => <label key={c.code} className={'chip' + (lw.categories.includes(c.code) ? ' on' : '')}><input type="checkbox" checked={lw.categories.includes(c.code)} onChange={() => toggle('categories', c.code)} />{lang === 'ur' && c.name_ur ? c.name_ur : c.name_en}</label>)}</div></div>
            <label>{L('Short introduction (optional)', 'مختصر تعارف (اختیاری)')}<textarea rows={3} value={lw.bio} onChange={setL('bio')} maxLength={1500} /></label>
            <p className="muted small">{L('After you verify your email and log in, you can upload your licence card or other proof. An administrator checks it before you appear in the directory.', 'ای میل کی تصدیق اور لاگ اِن کے بعد آپ اپنا لائسنس کارڈ یا دیگر ثبوت اپ لوڈ کر سکتے ہیں۔ ڈائریکٹری میں آنے سے پہلے ایڈمنسٹریٹر اس کی جانچ کرتا ہے۔')}</p>
          </fieldset>
        )}
        <button className="btn btn-navy block" disabled={busy}>{busy ? '…' : t('register.submit')}</button>
        <p className="form-foot"><Link to="/login">{t('register.have')}</Link></p>
      </form>
    </div>
  );
}
