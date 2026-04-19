import axios from 'axios';

// Vite proxy forwards /api → http://localhost:3000/api
const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// ─── Leads ────────────────────────────────────────────────────────────────────
export const uploadLeads    = (leads)   => api.post('/leads/upload', { leads });
export const getLeads       = ()        => api.get('/leads');
export const deleteLeads    = (leadIds) => api.delete('/leads', { data: { leadIds } });
export const deleteAllLeads = ()        => api.delete('/leads/all');

// ─── Campaigns ────────────────────────────────────────────────────────────────
export const createCampaign    = (data) => api.post('/campaigns', data);
export const getCampaigns      = ()     => api.get('/campaigns');
export const startCampaign     = (id)   => api.post(`/campaigns/${id}/start`);
export const getCampaignStats  = (id)   => api.get(`/campaigns/${id}/stats`);
