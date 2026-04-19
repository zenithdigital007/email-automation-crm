const cron = require('node-cron');
const { google } = require('googleapis');
const supabase = require('../config/supabase');
const { getOAuthClient } = require('../config/gmail');

/**
 * Utility: sleep for a given number of milliseconds.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Core reply tracker logic.
 * Checks Gmail threads for external replies on all "sent" leads
 * from the last 7 days.
 */
async function runReplyTrackerWorker() {
  console.log('[replyTrackerWorker] Tick started:', new Date().toISOString());

  // Fetch sent campaign_leads from the last 7 days (optimized window)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  // Note: we do NOT select gmail_thread_id from campaign_leads here — it may
  // not exist on older schemas. Thread ID is always fetched from email_logs below.
  const { data: sentLeads, error } = await supabase
    .from('campaign_leads')
    .select(`
      id, campaign_id,
      sent_at,
      campaigns ( user_id, users ( gmail_address, access_token, refresh_token ) ),
      leads ( id, email )
    `)
    .eq('status', 'sent')
    .gte('sent_at', sevenDaysAgo.toISOString())
    .limit(50);

  if (error) {
    console.error('[replyTrackerWorker] DB fetch error:', error.message);
    return;
  }

  if (!sentLeads || sentLeads.length === 0) {
    console.log('[replyTrackerWorker] No sent leads to check. Idle.');
    return;
  }

  console.log(`[replyTrackerWorker] Checking ${sentLeads.length} threads for replies.`);

  for (const cl of sentLeads) {
    const userRecord = cl.campaigns?.users;
    const userEmail  = userRecord?.gmail_address;
    const leadEmail  = cl.leads?.email;
    const leadId     = cl.leads?.id;

    // Always look up thread ID from email_logs — source of truth for all sends
    const { data: logRow, error: logErr } = await supabase
      .from('email_logs')
      .select('gmail_thread_id')
      .eq('campaign_id', cl.campaign_id)
      .eq('lead_id', leadId)
      .maybeSingle();

    if (logErr) {
      console.error(`[replyTrackerWorker] email_logs lookup error for lead ${leadEmail}:`, logErr.message);
    }

    const threadId = logRow?.gmail_thread_id ?? null;

    // ── Diagnostic log — shows exactly what we have for each lead ──────────────
    console.log(`[replyTrackerWorker] lead: ${leadEmail} | threadId: ${threadId ?? 'MISSING'} | userEmail: ${userEmail ?? 'MISSING'} | hasToken: ${!!userRecord?.access_token}`);

    if (!threadId) {
      console.warn(`  → No threadId found in email_logs for campaign_id=${cl.campaign_id}, lead_id=${leadId}. Was this email logged correctly?`);
      continue;
    }
    if (!userRecord?.access_token) {
      console.warn(`  → No access_token for user. Users join may have failed. campaigns.user_id=${cl.campaigns?.user_id}`);
      continue;
    }

    try {
      const auth = getOAuthClient(userRecord.access_token, userRecord.refresh_token);
      const gmail = google.gmail({ version: 'v1', auth });

      const threadResponse = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'metadata',
        metadataHeaders: ['From'],
      });

      const messages = threadResponse.data.messages || [];
      console.log(`[replyTrackerWorker] thread ${threadId}: ${messages.length} message(s)`);

      // Check each message for an external reply
      const hasExternalReply = messages.some((msg) => {
        const fromHeader = msg.payload?.headers?.find((h) => h.name === 'From');
        const fromValue  = fromHeader?.value || '';

        const isOwnEmail = fromValue.includes(userEmail);
        const isNoReply  = /noreply|no-reply|mailer-daemon|donotreply/i.test(fromValue);

        if (!isOwnEmail && !isNoReply) {
          console.log(`[replyTrackerWorker] External sender detected: "${fromValue}" in thread ${threadId}`);
        }

        return !isOwnEmail && !isNoReply;
      });

      if (hasExternalReply) {
        const repliedAt = new Date().toISOString();

        await supabase
          .from('campaign_leads')
          .update({ status: 'replied', replied_at: repliedAt })
          .eq('id', cl.id);

        await supabase
          .from('email_logs')
          .update({ replied_at: repliedAt })
          .eq('gmail_thread_id', threadId);

        console.log(`[replyTrackerWorker] 📬 Reply marked for ${cl.leads?.email} (thread ${threadId})`);
      }
    } catch (err) {
      console.error(`[replyTrackerWorker] Error checking thread ${threadId}:`, err.message);
    }

    // 200ms pause between Gmail API calls to stay within rate limits
    await sleep(200);
  }

  console.log('[replyTrackerWorker] Tick complete.');
}

/**
 * Registers the replyTrackerWorker cron job.
 * Runs every 15 minutes.
 */
function startReplyTrackerWorker() {
  console.log('[replyTrackerWorker] Registered — runs every 15 minutes.');

  let isRunning = false;

  cron.schedule('*/15 * * * *', async () => {
    if (isRunning) {
      console.log('[replyTrackerWorker] Previous run still in progress. Skipping tick.');
      return;
    }
    isRunning = true;
    try {
      await runReplyTrackerWorker();
    } finally {
      isRunning = false;
    }
  });
}

module.exports = { startReplyTrackerWorker, runReplyTrackerWorker };
