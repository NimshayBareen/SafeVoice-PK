import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, downloadEvidence } from '../api.js';
import { useLang } from '../i18n.jsx';

const fmtSize = (n) => (n == null ? '' : n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB');

export default function Vault() {
  const { caseId } = useParams();
  const { t, fmtDate } = useLang();
  const [kase, setKase] = useState(null);
  const [items, setItems] = useState(null);
  const [custody, setCustody] = useState(null);
  const [results, setResults] = useState({});
  const [msg, setMsg] = useState(null); // { type: 'ok'|'error', text }
  const [busy, setBusy] = useState('');
  const [desc, setDesc] = useState('');
  const [url, setUrl] = useState('');
  const [urlDesc, setUrlDesc] = useState('');
  const fileRef = useRef(null);

  const loadAll = useCallback(async () => {
    try {
      const [c, e, h] = await Promise.all([
        api(`/cases/${caseId}`), api(`/cases/${caseId}/evidence`), api(`/cases/${caseId}/custody`),
      ]);
      setKase(c.case); setItems(e.evidence); setCustody(h);
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
  }, [caseId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function upload(e) {
    e.preventDefault();
    const file = fileRef.current && fileRef.current.files[0];
    if (!file) { setMsg({ type: 'error', text: t('vault.choose') }); return; }
    const form = new FormData();
    form.append('file', file);
    form.append('description', desc);
    setBusy('upload'); setMsg(null);
    try {
      const d = await api(`/cases/${caseId}/evidence`, { method: 'POST', form });
      setMsg({ type: 'ok', text: `✔ ${d.evidence.original_filename}: SHA-256 ${d.evidence.sha256_hash.slice(0, 16)}…` });
      setDesc(''); fileRef.current.value = '';
      await loadAll();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(''); }
  }

  async function saveUrl(e) {
    e.preventDefault();
    setBusy('url'); setMsg(null);
    try {
      await api(`/cases/${caseId}/evidence/url`, { method: 'POST', body: { url, description: urlDesc } });
      setUrl(''); setUrlDesc('');
      setMsg({ type: 'ok', text: '✔ ' + t('vault.saveUrl') });
      await loadAll();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(''); }
  }

  async function verify(id) {
    setBusy('v' + id); setMsg(null);
    try {
      const r = await api(`/evidence/${id}/verify`, { method: 'POST' });
      setResults((s) => ({ ...s, [id]: { status: r.status, at: r.checkedAt } }));
      await loadAll();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(''); }
  }

  async function verifyAll() {
    setBusy('all'); setMsg(null);
    try {
      const r = await api(`/cases/${caseId}/evidence/verify-all`, { method: 'POST' });
      const next = {};
      r.results.forEach((x) => { next[x.evidenceId] = { status: x.status, at: x.checkedAt }; });
      setResults(next);
      await loadAll();
    } catch (err) { setMsg({ type: 'error', text: err.message }); }
    finally { setBusy(''); }
  }

  async function download(it) {
    try { await downloadEvidence(it.evidence_id, it.original_filename); await loadAll(); }
    catch (err) { setMsg({ type: 'error', text: err.message }); }
  }

  const statusOf = (it) => (results[it.evidence_id] && results[it.evidence_id].status) || it.last_verify_result || 'NONE';
  const whenOf = (it) => (results[it.evidence_id] && results[it.evidence_id].at) || it.last_verified_at;

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{t('vault.title')}</h2>
        </div>
        <button className="btn btn-gold" onClick={verifyAll} disabled={busy === 'all' || !items || items.length === 0}>
          {busy === 'all' ? '…' : '🔍 ' + t('vault.verifyAll')}
        </button>
      </div>

      {msg && <div className={'alert ' + (msg.type === 'ok' ? 'alert-ok' : 'alert-error')}>{msg.text}</div>}
      <div className="notice-bar">🔒 {t('vault.encrypted')}</div>

      <div className="grid2">
        <form className="card" onSubmit={upload}>
          <h3>{t('vault.upload')}</h3>
          <label>{t('vault.choose')}
            <input type="file" ref={fileRef} accept=".png,.jpg,.jpeg,.webp,.mp3,.wav,.m4a,.ogg,.aac,.mp4,.mov,.webm,.pdf,.txt,.doc,.docx" />
            <small>{t('vault.supported')}</small>
          </label>
          <label>{t('vault.description')}
            <input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={500} />
          </label>
          <button className="btn btn-navy" disabled={busy === 'upload'}>{busy === 'upload' ? '…' : '⬆ ' + t('vault.uploadBtn')}</button>
        </form>
        <form className="card" onSubmit={saveUrl}>
          <h3>{t('vault.urlTitle')}</h3>
          <label>{t('vault.urlLabel')}
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          </label>
          <label>{t('vault.description')}
            <input value={urlDesc} onChange={(e) => setUrlDesc(e.target.value)} maxLength={500} />
          </label>
          <button className="btn btn-outline" disabled={busy === 'url' || !url}>{busy === 'url' ? '…' : '🔗 ' + t('vault.saveUrl')}</button>
        </form>
      </div>

      <div className="card table-card">
        {items === null ? <p>{t('common.loading')}</p> : items.length === 0 ? <p className="muted">{t('vault.empty')}</p> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>{t('col.item')}</th><th>{t('col.type')}</th><th>{t('col.added')}</th>
                  <th>{t('col.hash')}</th><th>{t('col.integrity')}</th><th>{t('col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const st = statusOf(it);
                  return (
                    <tr key={it.evidence_id}>
                      <td>{i + 1}</td>
                      <td>
                        <strong>{it.original_filename || it.url_value}</strong>
                        {it.description && <div className="muted small">{it.description}</div>}
                        {it.size_bytes != null && <div className="muted small">{fmtSize(it.size_bytes)}</div>}
                      </td>
                      <td>{t('type.' + it.evidence_type)}</td>
                      <td className="nowrap">{fmtDate(it.uploaded_at)}</td>
                      <td><code title={it.sha256_hash}>{it.sha256_hash.slice(0, 14)}…</code></td>
                      <td>
                        <span className={'pill pill-' + st}>{st === 'MATCH' ? '✓ ' : st === 'MISMATCH' ? '⚠ ' : ''}{t('res.' + st)}</span>
                        {whenOf(it) && <div className="muted small">{fmtDate(whenOf(it))}</div>}
                      </td>
                      <td className="actions">
                        <button className="btn btn-sm btn-outline" onClick={() => verify(it.evidence_id)} disabled={busy === 'v' + it.evidence_id}>
                          {busy === 'v' + it.evidence_id ? '…' : t('vault.verify')}
                        </button>
                        {it.evidence_type !== 'URL' && <button className="btn btn-sm btn-ghost" onClick={() => download(it)}>{t('vault.download')}</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="custody-head">
          <div>
            <h3>⛓ {t('custody.title')}</h3>
            <p className="muted small">{t('custody.sub')}</p>
          </div>
          {custody && <span className={'pill ' + (custody.chainValid ? 'pill-MATCH' : 'pill-MISMATCH')}>{custody.chainValid ? '✓ ' + t('custody.ok') : '⚠ ' + t('custody.broken')}</span>}
        </div>
        {custody && custody.entries.length === 0 && <p className="muted">—</p>}
        {custody && custody.entries.length > 0 && (
          <ol className="timeline">
            {[...custody.entries].reverse().map((e) => (
              <li key={e.id}>
                <span className="tl-dot" />
                <div>
                  <strong>{t('act.' + e.action)}</strong>
                  {e.result && e.action === 'VERIFY' && <span className={'pill pill-' + e.result + ' pill-sm'}>{t('res.' + e.result)}</span>}
                  <span className="muted"> · {e.item || ''}</span>
                  <div className="muted small">{fmtDate(e.at)} · <code>{e.hash.slice(0, 10)}…</code></div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
