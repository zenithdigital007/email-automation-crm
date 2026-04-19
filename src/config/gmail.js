const { google } = require('googleapis');
require('dotenv').config();

/**
 * Creates and returns a configured OAuth2 client.
 * Can be seeded with tokens if provided.
 *
 * @param {string} [accessToken]
 * @param {string} [refreshToken]
 * @returns {import('googleapis').Auth.OAuth2Client}
 */
function getOAuthClient(accessToken = null, refreshToken = null) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.REDIRECT_URI
  );

  if (accessToken || refreshToken) {
    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }

  // Auto-refresh: fires whenever googleapis refreshes the access token
  client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      // In production: persist this new refresh_token to DB
      console.log('[OAuth] New refresh_token received — update DB!');
    }
    console.log('[OAuth] Access token refreshed automatically.');
  });

  return client;
}

/**
 * Returns the Google OAuth2 authorization URL for the login flow.
 */
function getAuthUrl() {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',   // Required to get a refresh_token
    prompt: 'consent',        // Force consent screen to always get refresh_token
    scope: [
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
  });
}

/**
 * Exchanges an authorization code for access + refresh tokens.
 *
 * @param {string} code - The code from Google OAuth callback
 * @returns {Promise<import('googleapis').Auth.Credentials>}
 */
async function exchangeCodeForTokens(code) {
  const client = getOAuthClient();
  const { tokens } = await client.getToken(code);
  return tokens;
}

module.exports = { getOAuthClient, getAuthUrl, exchangeCodeForTokens };
