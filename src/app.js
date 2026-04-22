require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { getAuthUrl, exchangeCodeForTokens } = require('./config/gmail');
const supabase = require('./config/supabase');
const leadRoutes = require('./routes/lead.routes');
const campaignRoutes = require('./routes/campaign.routes');

const app = express();

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── Auth Middleware ───────────────────────────────────────────────────────────
/**
 * MVP: Uses a hardcoded userId from the .env file.
 * In production: replace with JWT verification (e.g. Supabase Auth / jsonwebtoken).
 *
 * Attach userId to req so all controllers can use req.userId.
 */
app.get('/', (req, res) => {
  res.send('🚀 Client Pilot API is running');
});

app.use((req, res, next) => {
  // Skip auth on auth routes
  if (req.path.startsWith('/auth')) return next();

  const userId = process.env.MVP_USER_ID;
  if (!userId) {
    return res.status(500).json({ error: 'MVP_USER_ID not set in .env' });
  }
  req.userId = userId;
  next();
});

// ─── Auth Routes ───────────────────────────────────────────────────────────────

// Step 1: Redirect user to Google OAuth consent screen
app.get('/auth/google', (req, res) => {
  const authUrl = getAuthUrl();
  res.redirect(authUrl);
});

// Step 2: Handle Google's OAuth callback — exchange code for tokens
app.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).json({ error: 'Missing authorization code.' });

  try {
    const tokens = await exchangeCodeForTokens(code);

    // Get the user's Gmail address from Google
    const { google } = require('googleapis');
    const { getOAuthClient } = require('./config/gmail');
    const auth = getOAuthClient(tokens.access_token, tokens.refresh_token);
    const gmail = google.gmail({ version: 'v1', auth });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const gmailAddress = profile.data.emailAddress;

    // Upsert user in Supabase
    const { data: user, error } = await supabase
      .from('users')
      .upsert(
        {
          email: gmailAddress,
          gmail_address: gmailAddress,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expiry: tokens.expiry_date
            ? new Date(tokens.expiry_date).toISOString()
            : null,
        },
        { onConflict: 'email' }
      )
      .select()
      .single();

    if (error) throw error;

    // MVP: Return userId in response so you can put it in MVP_USER_ID env var
    return res.status(200).json({
      message: 'Authentication successful!',
      userId: user.id,
      gmailAddress: user.gmail_address,
      note: 'Copy the userId above and set it as MVP_USER_ID in your .env file.',
    });
  } catch (err) {
    console.error('[Auth] Callback error:', err.message);
    console.log("OAuth error:", err);
    return res.status(500).json({ error: 'OAuth callback failed.' });
  }
});

// Step 3: Get current user info
app.get('/auth/me', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, gmail_address, created_at')
      .eq('id', req.userId)
      .single();

    if (error || !data) return res.status(404).json({ error: 'User not found.' });
    return res.status(200).json({ user: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/leads', leadRoutes);
app.use('/api/campaigns', campaignRoutes);

// ─── Debug Routes (remove in production) ──────────────────────────────────────

// POST /debug/reply-check — triggers one reply tracker cycle immediately
app.post('/debug/reply-check', async (_req, res) => {
  const { runReplyTrackerWorker } = require('./workers/replyTrackerWorker');
  try {
    await runReplyTrackerWorker();
    res.json({ ok: true, message: 'Reply tracker ran — check server logs for details.' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/', (req, res) => {
  res.send(`
    <h2>🚀 Client Pilot API is Live</h2>
    <p>Status: Running</p>
  `);
});

// GET /debug/sent-leads — shows raw DB state for all sent leads
app.get('/debug/sent-leads', async (_req, res) => {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: leads, error } = await supabase
    .from('campaign_leads')
    .select(`id, campaign_id, status, sent_at, leads ( id, email )`)
    .eq('status', 'sent')
    .gte('sent_at', sevenDaysAgo.toISOString());

  if (error) return res.status(500).json({ error: error.message });

  // For each, check if email_logs has a threadId
  const enriched = await Promise.all(
    (leads || []).map(async (cl) => {
      const { data: log } = await supabase
        .from('email_logs')
        .select('gmail_thread_id, gmail_message_id')
        .eq('campaign_id', cl.campaign_id)
        .eq('lead_id', cl.leads?.id)
        .maybeSingle();
      return {
        campaign_lead_id: cl.id,
        lead_email: cl.leads?.email,
        sent_at: cl.sent_at,
        gmail_thread_id: log?.gmail_thread_id ?? 'MISSING',
        gmail_message_id: log?.gmail_message_id ?? 'MISSING',
      };
    }),
  );

  res.json({ count: enriched.length, leads: enriched });
});

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` }));

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[App] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error.' });
});

module.exports = app;
