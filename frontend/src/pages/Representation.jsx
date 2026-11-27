import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useLang } from '../i18n.jsx';
import { Alert, StatusPill, useLoad } from '../components/ui.jsx';

// The victim's list of requests for this case
export default function Representation() {
  const { caseId } = useParams();
  const { L, fmtDate } = useLang();
  const { data, error } = useLoad(() => api(`/cases/${caseId}/requests`), [caseId]);
  const label = { PENDING: ['Waiting for the lawyer', 'وکیل کے جواب کا انتظار'], ACCEPTED: ['Accepted', 'قبول'], DECLINED: ['Declined', 'مسترد'], WITHDRAWN: ['Withdrawn', 'واپس لی گئی'] };
  return (
    <div className="card">
      <h2>{L('My lawyer', 'میرا وکیل')}</h2>
      <Alert>{error}</Alert>
      {data && data.requests.length === 0 && (
        <div className="empty"><p>{L('You have not asked any lawyer yet.', 'آپ نے ابھی کسی وکیل سے درخواست نہیں کی۔')}</p><Link className="btn btn-gold" to={`/cases/${caseId}/lawyers`}>{L('Find a lawyer', 'وکیل تلاش کریں')}</Link></div>
      )}
      <div className="grid2">
        {data && data.requests.map((r) => (
          <article className="card case-card" key={r.request_id}>
            <div className="case-top"><h3>{r.lawyer_name}</h3><StatusPill status={r.status} label={L(...(label[r.status] || [r.status]))} /></div>
            <p className="muted small">{r.lawyer_city} · {fmtDate(r.created_at)}</p>
            {r.status === 'ACCEPTED' && <p className="small">{L('Evidence shared', 'شیئر کیا گیا ثبوت')}: <strong>{r.shared_count}</strong>{r.vakalatnama_status ? ' · ' + L('Vakalatnama', 'وکالت نامہ') + ': ' + r.vakalatnama_status.replace(/_/g, ' ').toLowerCase() : ''}</p>}
            <Link className="btn btn-navy" to={'/requests/' + r.request_id}>{L('Open', 'کھولیں')}</Link>
          </article>
        ))}
      </div>
    </div>
  );
}
