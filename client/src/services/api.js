import axios from 'axios';

// In dev: VITE_API_URL is not set, so Vite's proxy handles /api → localhost:3000
// In production: VITE_API_URL = https://email-automation-crm.onrender.com
const baseURL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : '/api';

const api = axios.create({
  baseURL,
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
