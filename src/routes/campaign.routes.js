const express = require('express');
const router = express.Router();
const campaignController = require('../controllers/campaign.controller');

// GET  /api/campaigns        — list all campaigns
router.get('/', campaignController.getCampaigns);

// POST /api/campaigns        — create a campaign
router.post('/', campaignController.createCampaign);

// POST /api/campaigns/:id/start  — start a campaign
router.post('/:id/start', campaignController.startCampaign);

// GET  /api/campaigns/:id/stats  — get stats for a campaign
router.get('/:id/stats', campaignController.getCampaignStats);

module.exports = router;
