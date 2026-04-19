const campaignService = require('../services/campaign.service');

/**
 * POST /api/campaigns
 * Creates a campaign and links selected leads.
 */
async function createCampaign(req, res) {
  try {
    const userId = req.userId;
    const {
      name,
      subjectTemplate,
      bodyTemplate,
      leadIds,
      maxEmailsPerRun,
      delayMinSeconds,
      delayMaxSeconds,
    } = req.body;

    // Validate required fields
    if (!name || !subjectTemplate || !bodyTemplate) {
      return res.status(400).json({
        error: 'name, subjectTemplate, and bodyTemplate are required.',
      });
    }
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: 'leadIds must be a non-empty array.' });
    }

    const campaign = await campaignService.createCampaign(userId, {
      name,
      subjectTemplate,
      bodyTemplate,
      leadIds,
      maxEmailsPerRun,
      delayMinSeconds,
      delayMaxSeconds,
    });

    return res.status(201).json({
      message: 'Campaign created successfully.',
      campaignId: campaign.id,
      status: campaign.status,
      totalLeads: leadIds.length,
    });
  } catch (err) {
    console.error('[CampaignController] createCampaign error:', err.message);
    return res.status(500).json({ error: 'Failed to create campaign.' });
  }
}

/**
 * POST /api/campaigns/:id/start
 * Sets campaign status to "running" — triggers the sendEmailWorker.
 */
async function startCampaign(req, res) {
  try {
    const userId = req.userId;
    const campaignId = req.params.id;

    const campaign = await campaignService.startCampaign(campaignId, userId);

    return res.status(200).json({
      message: 'Campaign started. Emails will begin sending shortly.',
      campaignId: campaign.id,
      status: campaign.status,
    });
  } catch (err) {
    console.error('[CampaignController] startCampaign error:', err.message);
    const isClientError =
      err.message.includes('not found') ||
      err.message.includes('already') ||
      err.message.includes('denied');
    return res.status(isClientError ? 400 : 500).json({ error: err.message });
  }
}

/**
 * GET /api/campaigns
 * Lists all campaigns for the authenticated user.
 */
async function getCampaigns(req, res) {
  try {
    const userId = req.userId;
    const campaigns = await campaignService.getCampaignsByUser(userId);
    return res.status(200).json({ campaigns });
  } catch (err) {
    console.error('[CampaignController] getCampaigns error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch campaigns.' });
  }
}

/**
 * GET /api/campaigns/:id/stats
 * Returns detailed stats + per-lead status for a campaign.
 */
async function getCampaignStats(req, res) {
  try {
    const userId = req.userId;
    const campaignId = req.params.id;

    const stats = await campaignService.getCampaignStats(campaignId, userId);
    return res.status(200).json(stats);
  } catch (err) {
    console.error('[CampaignController] getCampaignStats error:', err.message);
    const isClientError = err.message.includes('not found') || err.message.includes('denied');
    return res.status(isClientError ? 404 : 500).json({ error: err.message });
  }
}

module.exports = { createCampaign, startCampaign, getCampaigns, getCampaignStats };
