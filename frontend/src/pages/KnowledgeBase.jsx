import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Alert, Modal, Tabs } from '../components/ui.jsx';

// UC-19 Manage Legal Knowledge Base and Support Directory. The forms are generated from the field list sent by the server.
const TABS = [['categories', 'Case categories'], ['questions', 'Questions'], ['statutes', 'Statutes'], ['offences', 'Offences'], ['forums', 'Forums'], ['rules', 'Legal rules'], ['support', 'Support directory']];
const SHOW = { categories: ['code', 'name_en', 'is_active'], questions: ['q_key', 'text_en', 'answer_type', 'display_order', 'is_active'], statutes: ['short_code', 'name', 'year', 'version', 'last_reviewed_on'],
  offences: ['code', 'title_en', 'section_ref', 'is_active'], forums: ['code', 'name_en', 'forum_type'], rules: ['title', 'version', 'review_date', 'is_active'], support: ['name', 'phone', 'city', 'is_national', 'is_active'] };

export default function KnowledgeBase() {
  const [schema, setSchema] = useState(null);
  const [lookups, setLookups] = useState(null);
  const [tab, setTab] = useState('categories');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [edit, setEdit] = useState(null); // { row|null }

  const loadLookups = () => api('/admin/kb/lookups').then(setLookups).catch(() => {});
  useEffect(() => { api('/admin/kb/schema').then((d) => setSchema(d.entities)).catch((e) => setError(e.message)); loadLookups(); }, []);
  const loadRows = () => { setRows(null); api('/admin/kb/' + tab).then((d) => setRows(d.rows)).catch((e) => setError(e.message)); };
  useEffect(() => { setError(''); loadRows(); }, [tab]); // eslint-disable-line

  if (!schema) return <p>{error ? <Alert>{error}</Alert> : 'Loading…'}</p>;
  const ent = schema[tab];
  const label = (r, col) => (typeof r[col] === 'boolean' ? (r[col] ? 'yes' : 'no') : r[col] === null || r[col] === undefined ? '—' : String(r[col]).slice(0, 80));

  async function toggleActive(r) {
    try { await api(`/admin/kb/${tab}/${r[ent.pk]}`, { method: 'PUT', body: { is_active: !r.is_active } }); loadRows(); } catch (e) { setError(e.message); }
  }
  async function remove(r) {
    if (!window.confirm('Delete this entry? This cannot be undone. Deactivating is usually better.')) return;
    try { await api(`/admin/kb/${tab}/${r[ent.pk]}`, { method: 'DELETE' }); loadRows(); loadLookups(); } catch (e) { setError(e.message); }
  }

  return (
    <>
      <p className="muted">Everything the legal guidance, the questionnaire, the complaint draft, the support directory and the AI assistant use comes from here. Changes to rules and statutes raise their version and review date automatically.</p>
      <Tabs tabs={TABS} active={tab} onChange={setTab} />
      <div className="page-head tight"><h3>{TABS.find((t) => t[0] === tab)[1]}</h3><button className="btn btn-gold" onClick={() => setEdit({ row: null })}>＋ Add</button></div>
      <Alert>{error}</Alert>
      <div className="card table-card"><div className="table-wrap"><table>
        <thead><tr>{SHOW[tab].map((c) => <th key={c}>{c.replace(/_/g, ' ')}</th>)}<th /></tr></thead>
        <tbody>
          {rows && rows.map((r) => (
            <tr key={r[ent.pk]} className={r.is_active === false ? 'dim' : ''}>
              {SHOW[tab].map((c) => <td key={c}>{label(r, c)}</td>)}
              <td className="actions">
                <button className="btn btn-sm btn-outline" onClick={() => setEdit({ row: r })}>Edit</button>
                {'is_active' in r && <button className="btn btn-sm btn-ghost" onClick={() => toggleActive(r)}>{r.is_active ? 'Deactivate' : 'Activate'}</button>}
                <button className="btn btn-sm btn-ghost" onClick={() => remove(r)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>{rows && rows.length === 0 && <p className="muted">Nothing here yet.</p>}</div></div>
      {edit && <EntryForm tab={tab} ent={ent} lookups={lookups} row={edit.row} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); loadRows(); loadLookups(); }} />}
    </>
  );
}

function EntryForm({ tab, ent, lookups, row, onClose, onSaved }) {
  const init = {};
  ent.fields.forEach((f) => {
    let v = row ? row[f.name] : f.default;
    if (f.type === 'json') v = v === null || v === undefined ? (f.name === 'condition_json' ? '{}' : '') : JSON.stringify(v, null, 2);
    if (f.type === 'tags') v = Array.isArray(v) ? v.join(', ') : '';
    if (f.type === 'bool') v = v === null || v === undefined ? false : !!v;
    init[f.name] = v === null || v === undefined ? '' : v;
  });
  const [vals, setVals] = useState(init);
  const [cats, setCats] = useState(row && row.categories ? row.categories : []);
  const [errs, setErrs] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setVals({ ...vals, [k]: v });

  async function save() {
    setBusy(true); setErrs([]);
    try {
      const body = { ...vals };
      if (ent.extraCategories) body.categories = cats;
      if (row && ent.versioned) body.expected_version = row.version;
      if (row) await api(`/admin/kb/${tab}/${row[ent.pk]}`, { method: 'PUT', body });
      else await api('/admin/kb/' + tab, { method: 'POST', body });
      onSaved();
    } catch (e) { setErrs(e.data && e.data.messages ? e.data.messages : [e.message]); } finally { setBusy(false); }
  }
  const options = (f) => (lookups ? lookups[f.lookup] || [] : []);

  return (
    <Modal title={(row ? 'Edit ' : 'Add ') + tab} onClose={onClose} wide>
      <Alert>{errs.length > 0 && errs.map((m, i) => <div key={i}>{m}</div>)}</Alert>
      {ent.fields.map((f) => (
        <label key={f.name}>{f.name.replace(/_/g, ' ')}{f.required ? ' *' : ''}
          {f.type === 'textarea' && <textarea rows={4} value={vals[f.name]} onChange={(e) => set(f.name, e.target.value)} />}
          {f.type === 'json' && <textarea rows={6} className="mono" value={vals[f.name]} onChange={(e) => set(f.name, e.target.value)} />}
          {(f.type === 'text' || f.type === 'tags') && <input value={vals[f.name]} onChange={(e) => set(f.name, e.target.value)} />}
          {f.type === 'number' && <input type="number" value={vals[f.name]} onChange={(e) => set(f.name, e.target.value)} />}
          {f.type === 'bool' && <input type="checkbox" checked={!!vals[f.name]} onChange={(e) => set(f.name, e.target.checked)} />}
          {f.type === 'enum' && <select value={vals[f.name]} onChange={(e) => set(f.name, e.target.value)}><option value="">Choose…</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>}
          {f.type === 'select' && <select value={vals[f.name]} onChange={(e) => set(f.name, e.target.value)}><option value="">{f.required ? 'Choose…' : '(none)'}</option>{options(f).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>}
          {f.hint && <small>{f.hint}</small>}
        </label>
      ))}
      {ent.extraCategories && lookups && (
        <div className="field-group"><span className="lbl">Relevant to these case categories</span>
          <div className="chips">{lookups.categories.map((c) => <label key={c.code} className={'chip' + (cats.includes(c.code) ? ' on' : '')}><input type="checkbox" checked={cats.includes(c.code)} onChange={() => setCats(cats.includes(c.code) ? cats.filter((x) => x !== c.code) : [...cats, c.code])} />{c.label}</label>)}</div></div>
      )}
      {row && ent.versioned && <p className="muted small">Current version {row.version}. Saving raises it by one and sets today as the review date.</p>}
      <div className="btn-row"><button className="btn btn-gold" onClick={save} disabled={busy}>{busy ? '…' : 'Save'}</button><button className="btn btn-outline" onClick={onClose}>Cancel</button></div>
    </Modal>
  );
}
