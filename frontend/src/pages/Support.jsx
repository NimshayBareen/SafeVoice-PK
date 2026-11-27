import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';
import { Alert } from '../components/ui.jsx';

// UC-14 Browse Support Directory
const TYPE = { HELPLINE: ['Helpline', 'ہیلپ لائن'], SHELTER: ['Shelter', 'شیلٹر'], NGO: ['Organisation', 'تنظیم'], GOV_OFFICE: ['Government office', 'سرکاری دفتر'] };

export default function Support() {
  const { L, lang } = useLang();
  const [cats, setCats] = useState([]);
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { fetch('/api/public/categories').then((r) => r.json()).then((d) => setCats(d.categories || [])).catch(() => {}); }, []);
  async function search(e) {
    if (e) e.preventDefault();
    setError(''); setData(null);
    const qs = new URLSearchParams(Object.entries({ city, category }).filter(([, v]) => v)).toString();
    try { setData(await api('/support' + (qs ? '?' + qs : ''))); } catch (err) { setError(err.message); }
  }
  useEffect(() => { search(); }, []); // eslint-disable-line

  return (
    <div className="container page">
      <div className="page-head"><div><p className="eyebrow">{L('You are not alone', 'آپ اکیلی/اکیلے نہیں ہیں')}</p><h1>{L('Support directory', 'سپورٹ ڈائریکٹری')}</h1></div></div>
      <div className="alert alert-error big">🚨 {L('In immediate danger? Call Police Helpline 15.', 'فوری خطرے میں ہیں؟ پولیس ہیلپ لائن 15 پر کال کریں۔')}</div>
      <form className="filters card" onSubmit={search}>
        <label>{L('City or province', 'شہر یا صوبہ')}<input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Lahore, Punjab…" /></label>
        <label>{L('What do you need help with?', 'آپ کو کس چیز میں مدد چاہیے؟')}
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{L('Anything', 'کچھ بھی')}</option>
            {cats.map((c) => <option key={c.code} value={c.code}>{lang === 'ur' && c.name_ur ? c.name_ur : c.name_en}</option>)}
          </select>
        </label>
        <button className="btn btn-navy">{L('Show', 'دکھائیں')}</button>
      </form>
      <Alert>{error}</Alert>
      {data && data.fallback && <Alert type="info">{L('Nothing matched your choices, so the national helplines are shown.', 'آپ کے انتخاب سے کچھ نہیں ملا، اس لیے قومی ہیلپ لائنز دکھائی جا رہی ہیں۔')}</Alert>}
      {!data && !error && <p>{L('Loading…', 'لوڈ ہو رہا ہے…')}</p>}
      <div className="grid2">
        {data && data.entries.map((s) => (
          <article className="card support-card" key={s.entry_id}>
            <p className="muted small">{(TYPE[s.entry_type] || [s.entry_type])[lang === 'ur' ? 1 : 0]} · {s.is_national ? L('All Pakistan', 'پورا پاکستان') : s.city}</p>
            <h3>{lang === 'ur' && s.name_ur ? s.name_ur : s.name}</h3>
            {s.phone && <p><a className="phone" href={'tel:' + s.phone.replace(/[^0-9+]/g, '')} dir="ltr">📞 {s.phone}</a></p>}
            {s.description && <p className="small">{s.description}</p>}
            {s.address && <p className="small muted">{s.address}</p>}
            {s.website && <p className="small"><a href={s.website} target="_blank" rel="noopener noreferrer">{s.website}</a></p>}
          </article>
        ))}
      </div>
      <p className="muted small">{L('Numbers were checked in November 2026. Please confirm a number before relying on it; an administrator keeps this list up to date.', 'نمبرز نومبر 2026 میں جانچے گئے تھے۔ بھروسہ کرنے سے پہلے نمبر کی تصدیق کر لیں؛ ایڈمنسٹریٹر یہ فہرست اپ ڈیٹ رکھتا ہے۔')}</p>
    </div>
  );
}
