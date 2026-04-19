const express = require('express');
const router = express.Router();
const leadController = require('../controllers/lead.controller');

// POST /api/leads/upload — upload array of leads
router.post('/upload', leadController.uploadLeads);

// GET /api/leads — get all leads for current user
router.get('/', leadController.getLeads);

// DELETE /api/leads/all — delete all leads for current user (must be before /)
router.delete('/all', leadController.deleteAllLeads);

// DELETE /api/leads — delete selected leads { leadIds: [...] }
router.delete('/', leadController.deleteLeads);

module.exports = router;
