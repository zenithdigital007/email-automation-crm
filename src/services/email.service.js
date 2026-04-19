const { google } = require('googleapis');
const supabase = require('../config/supabase');
const { getOAuthClient } = require('../config/gmail');

/**
 * Sends an email via the Gmail API using the user's OAuth tokens.
 *
 * @param {Object} params
 * @param {string} params.to         - Recipient email address
 * @param {string} params.subject    - Rendered email subject
 * @param {string} params.body       - Rendered email body (plain text)
 * @param {string} params.fromEmail  - Sender's Gmail address
 * @param {string} params.accessToken
 * @param {string} params.refreshToken
 * @returns {Promise<{ messageId: string, threadId: string }>}
 */
async function sendEmail({ to, subject, body, fromEmail, accessToken, refreshToken }) {
  const auth = getOAuthClient(accessToken, refreshToken);
  const gmail = google.gmail({ version: 'v1', auth });

  // RFC 2047 — encode subject so UTF-8 chars (em-dash, accents, etc.) survive header transit
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;

  // Encode body as base64 so non-ASCII body text is also transport-safe
  const encodedBody = Buffer.from(body, 'utf8').toString('base64');

  // Build RFC 2822 formatted email
  const rawEmail = [
    `From: ${fromEmail}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    encodedBody,
  ].join('\r\n');

  // Base64url encode full message (Gmail API requirement)
  const encodedMessage = Buffer.from(rawEmail)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });

  return {
    messageId: response.data.id,
    threadId: response.data.threadId,
  };
}

/**
 * Inserts a row into email_logs after a successful send.
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.campaignId
 * @param {string} params.leadId
 * @param {string} params.gmailMessageId
 * @param {string} params.gmailThreadId
 */
async function logEmail({ userId, campaignId, leadId, gmailMessageId, gmailThreadId }) {
  const { error } = await supabase.from('email_logs').insert({
    user_id: userId,
    campaign_id: campaignId,
    lead_id: leadId,
    gmail_message_id: gmailMessageId,
    gmail_thread_id: gmailThreadId,
    sent_at: new Date().toISOString(),
  });

  if (error) {
    // Log but don't throw — email was sent successfully, logging is secondary
    console.error(`[EmailService] Failed to log email: ${error.message}`);
  }
}

module.exports = { sendEmail, logEmail };
