import { useRef, useState } from 'react';
import { uploadLeads } from '../services/api';

const PLACEHOLDER = `email,company
john@acme.com,Acme Inc
mary@globex.com,Globex`;

function parseCsv(text) {
  const leads = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    // Skip header if present
    if (/^email\s*,\s*company$/i.test(line)) continue;
    const [email, ...rest] = line.split(',');
    const company = rest.join(',').trim();
    if (email && company) {
      leads.push({ email: email.trim(), company });
    }
  }
  return leads;
}

export default function LeadUpload({ onUploaded }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(null);
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setText(ev.target.result || '');
    reader.readAsText(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setAlert(null);

    const leads = parseCsv(text);
    if (leads.length === 0) {
      setAlert({ type: 'error', msg: 'No valid rows. Format: email,company (one per line).' });
      return;
    }

    setLoading(true);
    try {
      const { data } = await uploadLeads(leads);
      setAlert({
        type: 'success',
        msg: `${data.imported} uploaded${data.duplicates ? ` · ${data.duplicates} duplicates skipped` : ''}.`,
      });
      setText('');
      if (fileRef.current) fileRef.current.value = '';
      onUploaded?.();
    } catch (err) {
      setAlert({ type: 'error', msg: err.response?.data?.error || 'Upload failed.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title"><span className="icon">📥</span>Upload Leads</div>
      </div>

      {alert && <div className={`alert alert-${alert.type}`}>{alert.msg}</div>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>CSV File</label>
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" onChange={handleFile} />
          <div className="form-hint">Or paste rows below.</div>
        </div>

        <div className="form-group">
          <label>Leads (email,company)</label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={6}
          />
        </div>

        <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
          {loading ? <><span className="spinner" /> Uploading…</> : 'Upload Leads'}
        </button>
      </form>
    </div>
  );
}
