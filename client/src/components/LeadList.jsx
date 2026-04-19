import { useEffect, useMemo, useState } from 'react';
import { deleteAllLeads, deleteLeads, getLeads } from '../services/api';

export default function LeadList({ refreshKey, onDeleted }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setSelected(new Set());
    setError(null);
    getLeads()
      .then(({ data }) => { if (!cancelled) setLeads(data.leads || []); })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.error || 'Failed to load leads.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  const allSelected = useMemo(
    () => leads.length > 0 && selected.size === leads.length,
    [leads, selected],
  );

  const toggleOne = (id) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(leads.map((l) => l.id)));

  const flash = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(null), 3500);
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} selected lead(s)? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const { data } = await deleteLeads([...selected]);
      flash(`${data.deleted} lead(s) deleted.`);
      setSelected(new Set());
      onDeleted?.();
      // Refresh list locally to avoid full reload flicker
      setLeads((prev) => prev.filter((l) => !selected.has(l.id)));
    } catch (err) {
      setError(err.response?.data?.error || 'Delete failed.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAll = async () => {
    if (leads.length === 0) return;
    if (!window.confirm(`Delete ALL ${leads.length} leads? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const { data } = await deleteAllLeads();
      flash(`${data.deleted} lead(s) deleted.`);
      setLeads([]);
      setSelected(new Set());
      onDeleted?.();
    } catch (err) {
      setError(err.response?.data?.error || 'Delete all failed.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title"><span className="icon">👥</span>Leads</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge badge-new">{leads.length}</span>
          {selected.size > 0 && (
            <button
              className="btn btn-danger btn-sm"
              onClick={handleDeleteSelected}
              disabled={deleting}
            >
              {deleting ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Deleting…</> : `Delete ${selected.size}`}
            </button>
          )}
          {leads.length > 0 && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleDeleteAll}
              disabled={deleting}
              style={{ color: 'var(--red)', borderColor: 'rgba(248,81,73,0.3)' }}
            >
              Delete All
            </button>
          )}
        </div>
      </div>

      {success && <div className="alert alert-success">{success}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-row"><span className="spinner" /> Loading…</div>
      ) : leads.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">📭</div>
          <p>No leads yet. Upload some to get started.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                  />
                </th>
                <th>Email</th>
                <th>Company</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => toggleOne(lead.id)}
                  style={{ cursor: 'pointer', background: selected.has(lead.id) ? 'var(--surface-2)' : undefined }}
                >
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggleOne(lead.id)}
                      style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                    />
                  </td>
                  <td>{lead.email}</td>
                  <td>{lead.company}</td>
                  <td>
                    <span className={`badge badge-${lead.status || 'new'}`}>{lead.status || 'new'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
