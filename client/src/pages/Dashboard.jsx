import { useState } from 'react';
import LeadUpload from '../components/LeadUpload';
import LeadList from '../components/LeadList';
import CampaignForm from '../components/CampaignForm';
import CampaignList from '../components/CampaignList';

export default function Dashboard() {
  const [leadsKey, setLeadsKey] = useState(0);
  const [campaignsKey, setCampaignsKey] = useState(0);

  const refreshLeads = () => setLeadsKey((n) => n + 1);
  const refreshCampaigns = () => setCampaignsKey((n) => n + 1);

  return (
    <main className="page">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Upload leads, create a campaign, and start sending.</p>
      </div>

      {/* Row 1: Upload + Campaign Form side by side */}
      <div className="grid-2">
        <LeadUpload onUploaded={refreshLeads} />
        <CampaignForm onCreated={refreshCampaigns} refreshKey={leadsKey} />
      </div>

      {/* Row 2: Leads table — full width */}
      <div className="section-gap">
        <LeadList refreshKey={leadsKey} onDeleted={refreshLeads} />
      </div>

      {/* Row 3: Campaign list — full width */}
      <div className="section-gap">
        <CampaignList refreshKey={campaignsKey} />
      </div>
    </main>
  );
}
