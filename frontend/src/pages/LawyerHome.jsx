import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useLang } from '../i18n.jsx';
import { Alert, StatusPill, useLoad } from '../components/ui.jsx';

const STATUS_TEXT = {
  PENDING_VERIFICATION: 'Your profile is waiting for an administrator to verify it. You appear in the directory only after approval. Make sure you have uploaded your licence card on the Profile page.',
  MORE_INFO_REQUIRED: 'The administrator needs more information. Please read the note on your Profile page, add the documents and your profile goes back for checking.',
  REJECTED: 'Your profile was not approved. See the note on your Profile page.',
  VERIFIED: 'Your profile is verified and visible to victims looking for a lawyer.',
};

// UC-16 Review Case Request and Shared Evidence: the advocate's inbox
export default function LawyerHome() {
  const { user } = useAuth();
  const { fmtDate } = useLang();
  const verified = user && user.lawyerStatus === 'VERIFIED';
  const { data, error } = useLoad(() => (verified ? api('/lawyer/requests') : Promise.resolve({ requests: [] })), [verified]);
  return (
    <div className="container page">
      <div className="page-head"><div><p className="eyebrow">Advocate</p><h1>{user && user.fullName ? 'Welcome, ' + user.fullName : 'Dashboard'}</h1></div></div>
      <div className={'alert ' + (verified ? 'alert-ok' : 'alert-info')}>
        <strong>Profile status: <StatusPill status={user && user.lawyerStatus} /></strong>
        <div>{STATUS_TEXT[user && user.lawyerStatus]}</div>
        {!verified && <Link className="btn btn-navy btn-sm" to="/lawyer/profile">Open my profile</Link>}
      </div>
      <Alert>{error}</Alert>
      {verified && (
        <>
          <h2>Requests from clients</h2>
          {data && data.requests.length === 0 && <div className="card empty"><p>No requests yet. Clients can find you in the directory.</p></div>}
          <div className="grid2">
            {data && data.requests.map((r) => (
              <article className="card case-card" key={r.request_id}>
                <div className="case-top"><span className="case-ref">Case {r.reference_code}</span><StatusPill status={r.status} /></div>
                <p className="muted small">{fmtDate(r.created_at)}{r.status === 'ACCEPTED' ? ` · ${r.shared_count} item(s) shared` : ''}{r.vakalatnama_status ? ' · vakalatnama: ' + r.vakalatnama_status.replace(/_/g, ' ').toLowerCase() : ''}</p>
                <pre className="summary-box short">{r.anonymised_summary.split('\n').slice(0, 4).join('\n')}</pre>
                <Link className="btn btn-navy" to={'/lawyer/requests/' + r.request_id}>{r.status === 'PENDING' ? 'Review request' : 'Open'}</Link>
              </article>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
