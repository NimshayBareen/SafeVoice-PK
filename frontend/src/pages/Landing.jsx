import { Link } from 'react-router-dom';
import { useLang } from '../i18n.jsx';
import { useAuth } from '../auth.jsx';
import { homeFor } from '../roles.js';

const PROTECT = [['p1', '👩'], ['p2', '🧒'], ['p3', '💻']];

function Watermark() {
  return (
    <svg className="hero-mark" viewBox="0 0 64 64" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M32 8v42" /><path d="M14 17h36" /><path d="M14 17l-8 18h16z" /><path d="M50 17l-8 18h16z" /><path d="M20 54h24" />
      </g>
    </svg>
  );
}

export default function Landing() {
  const { t, L } = useLang();
  const { user } = useAuth();
  const features = [
    ['🗄️', t('f1.t'), t('f1.d')],
    ['🔍', t('f2.t'), t('f2.d')],
    ['🧭', L('Guided questions', 'رہنمائی کرنے والے سوالات'), L('Simple questions about what happened. No legal knowledge needed.', 'جو ہوا اس کے بارے میں سادہ سوالات۔ قانونی علم کی ضرورت نہیں۔')],
    ['⚖️', t('f4.t'), t('f4.d')],
    ['📄', t('f6.t'), t('f6.d')],
    ['👩‍⚖️', t('f5.t'), t('f5.d')],
    ['✍️', L('Vakalatnama and case tracking', 'وکالت نامہ اور کیس کی پیش رفت'), L('Prepare the authority form, message your lawyer securely and follow every stage and hearing date.', 'اختیار نامہ تیار کریں، وکیل کو محفوظ پیغام بھیجیں اور ہر مرحلہ اور سماعت کی تاریخ دیکھیں۔')],
    ['🤖', L('Ask the Assistant', 'اسسٹنٹ سے پوچھیں'), L('Ask questions about the law and get answers from our legal knowledge base.', 'قانون کے بارے میں سوال پوچھیں اور ہمارے قانونی علمی ذخیرے سے جواب پائیں۔')],
    ['📞', L('Helplines and support', 'ہیلپ لائنز اور مدد'), L('Verified helplines, shelters and organisations, by city and by type of problem.', 'تصدیق شدہ ہیلپ لائنز، شیلٹرز اور تنظیمیں، شہر اور مسئلے کی قسم کے مطابق۔')],
  ];
  return (
    <>
      <section className="hero">
        <Watermark />
        <div className="container hero-inner">
          <span className="badge-gold">{t('hero.badge')}</span>
          <h1>{t('hero.title')}</h1>
          <p className="hero-sub">{t('hero.sub')}</p>
          <div className="hero-actions">
            {user ? (
              <Link className="btn btn-gold" to={homeFor(user.role)}>{L('Go to my dashboard', 'میرے ڈیش بورڈ پر جائیں')}</Link>
            ) : (
              <>
                <Link className="btn btn-gold" to="/register?as=victim">{L('I need help', 'مجھے مدد چاہیے')}</Link>
                <Link className="btn btn-outline-light" to="/register?as=advocate">{L('I am an Advocate', 'میں وکیل ہوں')}</Link>
                <Link className="btn btn-ghost light" to="/login">{t('nav.login')}</Link>
              </>
            )}
          </div>
          <p className="hero-note">{t('hero.note')}</p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2 className="section-title">{t('sec.how')}</h2>
          <div className="gold-rule" />
          <div className="grid3">
            {features.map(([icon, title, desc]) => (
              <article className="card feature" key={title}>
                <div className="feature-icon">{icon}</div>
                <h3>{title}</h3>
                <p>{desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section section-navy">
        <div className="container">
          <h2 className="section-title light">{t('protect.title')}</h2>
          <div className="gold-rule" />
          <div className="grid3">
            {PROTECT.map(([k, icon]) => (
              <article className="card card-dark" key={k}>
                <div className="feature-icon">{icon}</div>
                <h3>{t(k + '.t')}</h3>
                <p>{t(k + '.d')}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
