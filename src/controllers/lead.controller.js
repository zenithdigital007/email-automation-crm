const leadService = require('../services/lead.service');



/**
 * POST /api/leads/upload
 * Accepts: { leads: [{ email, company }] }
 */
async function uploadLeads(req, res) {
  try {
    const userId = req.userId; // Set by auth middleware
    const { leads } = req.body;

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({ error: 'leads must be a non-empty array.' });
    }

    // Validate each lead has email + company
    for (const lead of leads) {
      if (!lead.email || !lead.company) {
        return res.status(400).json({
          error: 'Each lead must have an email and company field.',
        });
      }
      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(lead.email)) {
        return res.status(400).json({
          error: `Invalid email format: ${lead.email}`,
        });
      }
    }

    const result = await leadService.uploadLeads(userId, leads);

    return res.status(201).json({
      message: 'Leads uploaded successfully.',
      imported: result.imported,
      duplicates: result.duplicates,
    });
  } catch (err) {
    console.error('[LeadController] uploadLeads error:', err.message);
    return res.status(500).json({ error: 'Failed to upload leads.', detail: err.message });
  }
}

/**
 * GET /api/leads
 * Returns all leads for the authenticated user.
 */
async function getLeads(req, res) {
  try {
    const userId = req.userId;
    const leads = await leadService.getLeadsByUser(userId);
    return res.status(200).json({ leads });
  } catch (err) {
    console.error('[LeadController] getLeads error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch leads.' });
  }
}

/**
 * DELETE /api/leads
 * Body: { leadIds: ["id1", "id2"] }
 */
async function deleteLeads(req, res) {
  try {
    const userId = req.userId;
    const { leadIds } = req.body;

    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return res.status(400).json({ error: 'leadIds must be a non-empty array.' });
    }

    const result = await leadService.deleteLeads(userId, leadIds);
    return res.status(200).json({ message: `${result.deleted} lead(s) deleted.`, deleted: result.deleted });
  } catch (err) {
    console.error('[LeadController] deleteLeads error:', err.message);
    return res.status(500).json({ error: 'Failed to delete leads.', detail: err.message });
  }
}

/**
 * DELETE /api/leads/all
 */
async function deleteAllLeads(req, res) {
  try {
    const userId = req.userId;
    const result = await leadService.deleteAllLeads(userId);
    return res.status(200).json({ message: `All ${result.deleted} lead(s) deleted.`, deleted: result.deleted });
  } catch (err) {
    console.error('[LeadController] deleteAllLeads error:', err.message);
    return res.status(500).json({ error: 'Failed to delete all leads.', detail: err.message });
  }
}

module.exports = { uploadLeads, getLeads, deleteLeads, deleteAllLeads };
