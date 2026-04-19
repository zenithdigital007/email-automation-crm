const supabase = require('../config/supabase');

/**
 * Uploads an array of leads for a given user.
 * Skips duplicates using the DB's UNIQUE(user_id, email) constraint.
 *
 * @param {string} userId
 * @param {Array<{email: string, company: string}>} leads
 * @returns {Promise<{ imported: number, duplicates: number }>}
 */
async function uploadLeads(userId, leads) {
  if (!leads || leads.length === 0) {
    return { imported: 0, duplicates: 0 };
  }

  // Attach userId and normalize
  const rows = leads.map((lead) => ({
    user_id: userId,
    email: lead.email.trim().toLowerCase(),
    company: lead.company.trim(),
    status: 'new',
  }));

  // Insert with ON CONFLICT DO NOTHING — skips UNIQUE(user_id,email) violations
  // Returns only the newly inserted rows (not skipped duplicates)
  const { data, error } = await supabase
    .from('leads')
    .insert(rows)
    .select();

  if (error) {
    // Code 23505 = unique_violation — means all/some were duplicates
    if (error.code === '23505') {
      // Fallback: insert one-by-one to count real imports vs duplicates
      let imported = 0;
      let duplicates = 0;
      for (const row of rows) {
        const { error: singleErr } = await supabase.from('leads').insert(row);
        if (singleErr && singleErr.code === '23505') {
          duplicates++;
        } else if (!singleErr) {
          imported++;
        }
      }
      return { imported, duplicates };
    }
    // Surface real errors with full detail
    throw new Error(`uploadLeads DB error [${error.code}]: ${error.message} | hint: ${error.hint || 'none'} | details: ${error.details || 'none'}`);
  }

  const imported = data ? data.length : 0;
  const duplicates = rows.length - imported;
  return { imported, duplicates };
}

/**
 * Returns all leads for a given user.
 *
 * @param {string} userId
 * @returns {Promise<Array>}
 */
async function getLeadsByUser(userId) {
  const { data, error } = await supabase
    .from('leads')
    .select('id, email, company, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`getLeadsByUser DB error: ${error.message}`);
  return data;
}

/**
 * Fetches a single lead by its ID (must belong to userId).
 *
 * @param {string} leadId
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
async function getLeadById(leadId, userId) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    throw new Error(`getLeadById DB error: ${error.message}`);
  }
  return data || null;
}

/**
 * Deletes specific leads by ID (must belong to userId).
 * Also removes their campaign_leads rows first to avoid FK violations.
 *
 * @param {string} userId
 * @param {string[]} leadIds
 * @returns {Promise<{ deleted: number }>}
 */
async function deleteLeads(userId, leadIds) {
  if (!leadIds || leadIds.length === 0) return { deleted: 0 };

  // Verify ownership — only delete leads that belong to this user
  const { data: owned, error: fetchErr } = await supabase
    .from('leads')
    .select('id')
    .eq('user_id', userId)
    .in('id', leadIds);

  if (fetchErr) throw new Error(`deleteLeads fetch error: ${fetchErr.message}`);

  const ownedIds = (owned || []).map((r) => r.id);
  if (ownedIds.length === 0) return { deleted: 0 };

  // Remove campaign_leads rows first (FK safety)
  await supabase.from('campaign_leads').delete().in('lead_id', ownedIds);

  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('user_id', userId)
    .in('id', ownedIds);

  if (error) throw new Error(`deleteLeads DB error: ${error.message}`);
  return { deleted: ownedIds.length };
}

/**
 * Deletes ALL leads for a user (and their campaign_leads rows).
 *
 * @param {string} userId
 * @returns {Promise<{ deleted: number }>}
 */
async function deleteAllLeads(userId) {
  // Get all lead IDs for this user
  const { data: owned, error: fetchErr } = await supabase
    .from('leads')
    .select('id')
    .eq('user_id', userId);

  if (fetchErr) throw new Error(`deleteAllLeads fetch error: ${fetchErr.message}`);

  const ownedIds = (owned || []).map((r) => r.id);
  if (ownedIds.length === 0) return { deleted: 0 };

  // Remove campaign_leads rows first
  await supabase.from('campaign_leads').delete().in('lead_id', ownedIds);

  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('user_id', userId);

  if (error) throw new Error(`deleteAllLeads DB error: ${error.message}`);
  return { deleted: ownedIds.length };
}

module.exports = { uploadLeads, getLeadsByUser, getLeadById, deleteLeads, deleteAllLeads };
