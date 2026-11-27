import { NavLink, Routes, Route, useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';
import { useLoad } from '../components/ui.jsx';
import Vault from './Vault.jsx';
import Intake from './Intake.jsx';
import Legal from './Legal.jsx';
import Draft from './Draft.jsx';
import Lawyers from './Lawyers.jsx';
import Representation from './Representation.jsx';

export default function CaseShell() {
  const { caseId } = useParams();
  const { L, lang } = useLang();
  const { data } = useLoad(() => api('/cases/' + caseId), [caseId]);
  const c = data && data.case;
  const base = '/cases/' + caseId;
  const tabs = [
    ['', L('Evidence vault', 'ثبوت والٹ'), true],
    ['/intake', L('1. Questions', '1. سوالات')],
    ['/legal', L('2. Legal guidance', '2. قانونی رہنمائی')],
    ['/draft', L('3. Complaint draft', '3. شکایت کا مسودہ')],
    ['/lawyers', L('4. Find a lawyer', '4. وکیل تلاش کریں')],
    ['/representation', L('5. My lawyer', '5. میرا وکیل')],
  ];
  return (
    <div className="container page">
      <Link to="/cases" className="back">← {L('All cases', 'تمام کیسز')}</Link>
      <div className="case-head">
        <div>
          <p className="eyebrow">{L('Case', 'کیس')} {c ? c.reference_code : '…'}</p>
          <h1>{c && c.category_name_en ? (lang === 'ur' && c.category_name_ur ? c.category_name_ur : c.category_name_en) : L('New case', 'نیا کیس')}</h1>
        </div>
      </div>
      <nav className="subnav">
        {tabs.map(([p, label, end]) => <NavLink key={p} to={base + p} end={!!end || p === ''}>{label}</NavLink>)}
      </nav>
      <Routes>
        <Route index element={<Vault />} />
        <Route path="intake" element={<Intake />} />
        <Route path="legal" element={<Legal />} />
        <Route path="draft" element={<Draft />} />
        <Route path="lawyers" element={<Lawyers />} />
        <Route path="representation" element={<Representation />} />
      </Routes>
    </div>
  );
}
