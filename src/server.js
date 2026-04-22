require('dotenv').config();
const app = require('./app');
const { startSendEmailWorker } = require('./workers/sendEmailWorker');
const { startReplyTrackerWorker } = require('./workers/replyTrackerWorker');

const PORT = process.env.PORT;

if (!PORT) {
  throw new Error("PORT not defined in environment");
}

// ─── Start Server ──────────────────────────────────────────────────────────────
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🚀 Email Automation CRM backend running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Auth:   http://localhost:${PORT}/auth/google\n`);

  // ─── Start Background Workers ────────────────────────────────────────────────
  startSendEmailWorker();
  startReplyTrackerWorker();
});

// ─── Port-in-use Error Handler ────────────────────────────────────────────────
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ Port ${PORT} is already in use.`);
    console.error(`   Kill the existing process and try again:\n`);
    console.error(`   lsof -ti:${PORT} | xargs kill -9\n`);
  } else {
    console.error('Server error:', err);
  }
  process.exit(1);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('\n[Server] SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n[Server] SIGINT received (Ctrl+C). Shutting down...');
  process.exit(0);
});
