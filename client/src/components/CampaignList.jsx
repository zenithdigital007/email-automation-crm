import { useEffect, useState } from 'react';
import { getCampaigns, getCampaignStats, startCampaign } from '../services/api';

async function loadWithStats() {
  const { data } = await getCampaigns();
  const list = data.campaigns || [];
  const stats = await Promise.all(
    list.map((c) =>
      getCampaignStats(c.id)
        .then((r) => r.data.stats)
        .catch(() => ({ sent: 0, replied: 0, total: 0 })),
    ),
  );
  return list.map((c, i) => ({
    ...c,
    sent: stats[i].sent ?? 0,
    replied: stats[i].replied ?? 0,
    total: stats[i].total ?? 0,
  }));
}

export default function CampaignList({ refreshKey }) {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [startingId, setStartingId] = useState(null);
  const [bump, setBump] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadWithStats()
      .then((list) => { if (!cancelled) setCampaigns(list); })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || 'Failed to load campaigns.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey, bump]);

  const handleStart = async (id) => {
    setStartingId(id);
    try {
      await startCampaign(id);
      setBump((n) => n + 1);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start campaign.');
    } finally {
      setStartingId(null);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title"><span className="icon">🚀</span>Campaigns</div>
        <span className="badge badge-new">{campaigns.length}</span>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div className="loading-row"><span className="spinner" /> Loading…</div>
      ) : campaigns.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">📨</div>
          <p>No campaigns yet. Create one to start sending.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Replies</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const canStart = c.status === 'pending';
                return (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                    <td>{c.sent} / {c.total}</td>
                    <td>{c.replied}</td>
                    <td style={{ textAlign: 'right' }}>
                      {canStart ? (
                        <button
                          className="btn btn-success btn-sm"
                          onClick={() => handleStart(c.id)}
                          disabled={startingId === c.id}
                        >
                          {startingId === c.id ? 'Starting…' : '▶ Start'}
                        </button>
                      ) : (
                        <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
