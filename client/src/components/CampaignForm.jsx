import { useEffect, useMemo, useState } from 'react';
import { createCampaign, getLeads } from '../services/api';

const DEFAULT_SUBJECT = 'Quick question about {{company}}';
const DEFAULT_BODY    = `Hi there,

I came across {{company}} and wanted to reach out.

Cheers,
[Your Name]`;

export default function CampaignForm({ onCreated, refreshKey }) {
  const [name, setName] = useState('');
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [body, setBody] = useState(DEFAULT_BODY);
  const [leads, setLeads] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    getLeads()
      .then(({ data }) => setLeads(data.leads || []))
      .catch(() => setLeads([]));
  }, [refreshKey]);

  const allSelected = useMemo(
    () => leads.length > 0 && selected.size === leads.length,
    [leads, selected],
  );

  const toggleOne = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(leads.map((l) => l.id)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAlert(null);

    if (!name.trim() || !subject.trim() || !body.trim()) {
      setAlert({ type: 'error', msg: 'Name, subject, and body are required.' });
      return;
    }
    if (selected.size === 0) {
      setAlert({ type: 'error', msg: 'Select at least one lead.' });
      return;
    }

    setLoading(true);
    try {
      const { data } = await createCampaign({
        name: name.trim(),
        subjectTemplate: subject,
        bodyTemplate: body,
        leadIds: [...selected],
      });
      setAlert({ type: 'success', msg: `Campaign created with ${data.totalLeads} leads.` });
      setName('');
      setSubject(DEFAULT_SUBJECT);
      setBody(DEFAULT_BODY);
      setSelected(new Set());
      onCreated?.();
    } catch (err) {
      setAlert({ type: 'error', msg: err.response?.data?.error || 'Failed to create campaign.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title"><span className="icon">✉️</span>New Campaign</div>
      </div>

      {alert && <div className={`alert alert-${alert.type}`}>{alert.msg}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Campaign Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Q2 Outbound"
          />
        </div>

        <div className="form-group">
          <label>Subject Template</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Quick question about {{company}}"
          />
          <div className="form-hint">Use {'{{company}}'} to personalize.</div>
        </div>

        <div className="form-group">
          <label>Body Template</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={7}
          />
        </div>

        <div className="form-group">
          <label>Select Leads ({selected.size}/{leads.length})</label>
          {leads.length === 0 ? (
            <div className="form-hint">Upload leads first.</div>
          ) : (
            <div className="multi-select-list">
              <div className="select-all-bar">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                  {allSelected ? 'Unselect all' : 'Select all'}
                </label>
                <span>{selected.size} selected</span>
              </div>
              {leads.map((lead) => (
                <label key={lead.id} className="multi-select-item">
                  <input
                    type="checkbox"
                    checked={selected.has(lead.id)}
                    onChange={() => toggleOne(lead.id)}
                  />
                  <span className="lead-email">{lead.email}</span>
                  <span className="lead-company">{lead.company}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
          {loading ? <><span className="spinner" /> Creating…</> : 'Create Campaign'}
        </button>
      </form>
    </div>
  );
}
