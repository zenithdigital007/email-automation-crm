const cron = require('node-cron');
const campaignService = require('../services/campaign.service');
const emailService = require('../services/email.service');
const { renderTemplate } = require('../utils/template');

/**
 * Utility: sleep for a random duration between min and max milliseconds.
 */
function sleep(minMs, maxMs) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Core worker logic — called on every cron tick.
 * Processes one batch of pending leads per running campaign.
 */
async function runSendEmailWorker() {
  console.log('[sendEmailWorker] Tick started:', new Date().toISOString());

  let runningCampaigns;
  try {
    runningCampaigns = await campaignService.getRunningCampaigns();
  } catch (err) {
    console.error('[sendEmailWorker] Failed to fetch running campaigns:', err.message);
    return;
  }

  if (runningCampaigns.length === 0) {
    console.log('[sendEmailWorker] No running campaigns. Idle.');
    return;
  }

  for (const campaign of runningCampaigns) {
    const {
      id: campaignId,
      user_id: userId,
      subject_template: subjectTemplate,
      body_template: bodyTemplate,
      max_emails_per_run: maxEmailsPerRun,
      delay_min_seconds: delayMinSeconds,
      delay_max_seconds: delayMaxSeconds,
      users: userRecord,
    } = campaign;

    if (!userRecord || !userRecord.access_token || !userRecord.refresh_token) {
      console.warn(`[sendEmailWorker] Campaign ${campaignId}: missing Gmail tokens. Skipping.`);
      continue;
    }

    const { gmail_address: fromEmail, access_token: accessToken, refresh_token: refreshToken } = userRecord;

    // Fetch pending leads for this campaign
    let pendingLeads;
    try {
      pendingLeads = await campaignService.getPendingLeadsForCampaign(campaignId, maxEmailsPerRun);
    } catch (err) {
      console.error(`[sendEmailWorker] Campaign ${campaignId}: failed to fetch leads:`, err.message);
      continue;
    }

    if (pendingLeads.length === 0) {
      console.log(`[sendEmailWorker] Campaign ${campaignId}: no pending leads — checking completion.`);
      await campaignService.checkAndCompleteCampaign(campaignId);
      continue;
    }

    console.log(`[sendEmailWorker] Campaign ${campaignId}: processing ${pendingLeads.length} leads.`);

    for (const campaignLead of pendingLeads) {
      const lead = campaignLead.leads;

      if (!lead) {
        console.warn(`[sendEmailWorker] campaign_lead ${campaignLead.id}: lead data missing. Skipping.`);
        continue;
      }

      // Render subject and body with lead-specific variables
      const variables = { company: lead.company, email: lead.email };
      const renderedSubject = renderTemplate(subjectTemplate, variables);
      const renderedBody    = renderTemplate(bodyTemplate, variables);

      try {
        // Send email via Gmail API
        const { messageId, threadId } = await emailService.sendEmail({
          to: lead.email,
          subject: renderedSubject,
          body: renderedBody,
          fromEmail,
          accessToken,
          refreshToken,
        });

        // Log the email
        await emailService.logEmail({
          userId,
          campaignId,
          leadId: lead.id,
          gmailMessageId: messageId,
          gmailThreadId: threadId,
        });

        // Mark lead as sent
        await campaignService.markLeadAsSent(campaignLead.id, messageId, threadId);

        console.log(`[sendEmailWorker] ✅ Sent to ${lead.email} (messageId: ${messageId})`);
      } catch (err) {
        console.error(`[sendEmailWorker] ❌ Failed to send to ${lead.email}:`, err.message);

        // Increment retry count; mark permanently failed after 3 attempts
        await campaignService.markLeadAsFailed(campaignLead.id, campaignLead.retry_count);
      }

      // Delay between sends to avoid spam flags and rate limits
      const minMs = delayMinSeconds * 1000;
      const maxMs = delayMaxSeconds * 1000;
      await sleep(minMs, maxMs);
    }

    // After processing this batch, check if campaign is fully done
    await campaignService.checkAndCompleteCampaign(campaignId);
  }

  console.log('[sendEmailWorker] Tick complete.');
}

/**
 * Registers the sendEmailWorker cron job.
 * Runs every 1 minute.
 */
function startSendEmailWorker() {
  console.log('[sendEmailWorker] Registered — runs every 1 minute.');

  // Prevent overlapping runs: track if the worker is already executing
  let isRunning = false;

  cron.schedule('* * * * *', async () => {
    if (isRunning) {
      console.log('[sendEmailWorker] Previous run still in progress. Skipping tick.');
      return;
    }
    isRunning = true;
    try {
      await runSendEmailWorker();
    } finally {
      isRunning = false;
    }
  });
}

module.exports = { startSendEmailWorker };
