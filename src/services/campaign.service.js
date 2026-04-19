const supabase = require('../config/supabase');

/**
 * Creates a new campaign + links provided leadIds to it.
 *
 * @param {string} userId
 * @param {Object} params
 * @returns {Promise<Object>} Created campaign row
 */
async function createCampaign(userId, params) {
  const {
    name,
    subjectTemplate,
    bodyTemplate,
    leadIds,
    maxEmailsPerRun = 10,
    delayMinSeconds = 2,
    delayMaxSeconds = 5,
  } = params;

  // 1. Insert campaign
  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .insert({
      user_id: userId,
      name,
      subject_template: subjectTemplate,
      body_template: bodyTemplate,
      status: 'pending',
      max_emails_per_run: maxEmailsPerRun,
      delay_min_seconds: delayMinSeconds,
      delay_max_seconds: delayMaxSeconds,
    })
    .select()
    .single();

  if (campaignError) throw new Error(`createCampaign DB error: ${campaignError.message}`);

  // 2. Insert campaign_leads rows (one per lead)
  if (leadIds && leadIds.length > 0) {
    const campaignLeads = leadIds.map((leadId) => ({
      campaign_id: campaign.id,
      lead_id: leadId,
      status: 'pending',
      retry_count: 0,
    }));

    const { error: clError } = await supabase
      .from('campaign_leads')
      .insert(campaignLeads);

    if (clError) throw new Error(`createCampaign campaign_leads error: ${clError.message}`);
  }

  return campaign;
}

/**
 * Starts a campaign by updating its status to "running".
 *
 * @param {string} campaignId
 * @param {string} userId
 * @returns {Promise<Object>} Updated campaign row
 */
async function startCampaign(campaignId, userId) {
  // Security: ensure campaign belongs to this user
  const { data: campaign, error: fetchError } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('user_id', userId)
    .single();

  if (fetchError || !campaign) {
    throw new Error('Campaign not found or access denied.');
  }

  if (campaign.status === 'running') {
    throw new Error('Campaign is already running.');
  }

  if (campaign.status === 'completed') {
    throw new Error('Campaign has already completed.');
  }

  const { data: updated, error: updateError } = await supabase
    .from('campaigns')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', campaignId)
    .select()
    .single();

  if (updateError) throw new Error(`startCampaign update error: ${updateError.message}`);
  return updated;
}

/**
 * Returns all campaigns for a user with aggregated stats.
 *
 * @param {string} userId
 * @returns {Promise<Array>}
 */
async function getCampaignsByUser(userId) {
  const { data, error } = await supabase
    .from('campaigns')
    .select(`
      id, name, status, created_at, started_at, completed_at,
      max_emails_per_run, delay_min_seconds, delay_max_seconds
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`getCampaignsByUser DB error: ${error.message}`);
  return data;
}

/**
 * Returns detailed stats for a single campaign including per-lead status.
 *
 * @param {string} campaignId
 * @param {string} userId
 * @returns {Promise<Object>}
 */
async function getCampaignStats(campaignId, userId) {
  // Fetch campaign
  const { data: campaign, error: cErr } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', campaignId)
    .eq('user_id', userId)
    .single();

  if (cErr || !campaign) throw new Error('Campaign not found or access denied.');

  // Fetch campaign_leads with lead details
  const { data: campaignLeads, error: clErr } = await supabase
    .from('campaign_leads')
    .select(`
      id, status, retry_count, sent_at, replied_at,
      leads ( email, company )
    `)
    .eq('campaign_id', campaignId);

  if (clErr) throw new Error(`getCampaignStats leads error: ${clErr.message}`);

  const total    = campaignLeads.length;
  const sent     = campaignLeads.filter((cl) => cl.status === 'sent').length;
  const replied  = campaignLeads.filter((cl) => cl.status === 'replied').length;
  const failed   = campaignLeads.filter((cl) => cl.status === 'failed').length;
  const pending  = campaignLeads.filter((cl) => cl.status === 'pending').length;
  const responseRate = sent > 0 ? ((replied / sent) * 100).toFixed(1) + '%' : '0%';

  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      createdAt: campaign.created_at,
      startedAt: campaign.started_at,
      completedAt: campaign.completed_at,
    },
    stats: { total, sent, replied, failed, pending, responseRate },
    leads: campaignLeads.map((cl) => ({
      email: cl.leads?.email,
      company: cl.leads?.company,
      status: cl.status,
      retryCount: cl.retry_count,
      sentAt: cl.sent_at,
      repliedAt: cl.replied_at,
    })),
  };
}

/**
 * Fetches all RUNNING campaigns (used by sendEmailWorker).
 * Includes user tokens for Gmail API access.
 *
 * @returns {Promise<Array>}
 */
async function getRunningCampaigns() {
  const { data, error } = await supabase
    .from('campaigns')
    .select(`
      id, user_id, subject_template, body_template,
      max_emails_per_run, delay_min_seconds, delay_max_seconds,
      users ( gmail_address, access_token, refresh_token )
    `)
    .eq('status', 'running');

  if (error) throw new Error(`getRunningCampaigns DB error: ${error.message}`);
  return data;
}

/**
 * Fetches pending campaign_leads for a campaign (used by sendEmailWorker).
 *
 * @param {string} campaignId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function getPendingLeadsForCampaign(campaignId, limit = 10) {
  const { data, error } = await supabase
    .from('campaign_leads')
    .select(`
      id, retry_count,
      leads ( id, email, company )
    `)
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .lt('retry_count', 3)           // Max 3 retries
    .limit(limit);

  if (error) throw new Error(`getPendingLeadsForCampaign DB error: ${error.message}`);
  return data;
}

/**
 * Marks a campaign_lead as "sent" and records metadata.
 *
 * @param {string} campaignLeadId
 * @param {string} gmailMessageId
 * @param {string} gmailThreadId
 */
async function markLeadAsSent(campaignLeadId, gmailMessageId, gmailThreadId) {
  const { error } = await supabase
    .from('campaign_leads')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      gmail_message_id: gmailMessageId,
      gmail_thread_id: gmailThreadId,
    })
    .eq('id', campaignLeadId);

  if (error) throw new Error(`markLeadAsSent error: ${error.message}`);
}

/**
 * Increments retry_count on failure. Marks as "failed" if max retries reached.
 *
 * @param {string} campaignLeadId
 * @param {number} currentRetryCount
 */
async function markLeadAsFailed(campaignLeadId, currentRetryCount) {
  const newRetryCount = currentRetryCount + 1;
  const newStatus = newRetryCount >= 3 ? 'failed' : 'pending';

  const { error } = await supabase
    .from('campaign_leads')
    .update({ status: newStatus, retry_count: newRetryCount })
    .eq('id', campaignLeadId);

  if (error) throw new Error(`markLeadAsFailed error: ${error.message}`);
}

/**
 * Checks if all leads in a campaign are done (sent/replied/failed).
 * If so, marks the campaign as "completed".
 *
 * @param {string} campaignId
 */
async function checkAndCompleteCampaign(campaignId) {
  const { count, error } = await supabase
    .from('campaign_leads')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', 'pending');

  if (error) throw new Error(`checkAndCompleteCampaign error: ${error.message}`);

  if (count === 0) {
    await supabase
      .from('campaigns')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', campaignId);

    console.log(`[Campaign] Campaign ${campaignId} marked as completed.`);
  }
}

module.exports = {
  createCampaign,
  startCampaign,
  getCampaignsByUser,
  getCampaignStats,
  getRunningCampaigns,
  getPendingLeadsForCampaign,
  markLeadAsSent,
  markLeadAsFailed,
  checkAndCompleteCampaign,
};
