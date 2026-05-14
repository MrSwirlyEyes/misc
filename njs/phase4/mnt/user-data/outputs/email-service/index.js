'use strict';

// Load .env file when present (development convenience).
// In production, environment variables are set at the OS/service level.
// If dotenv is not installed this try/catch is a silent no-op.
try { require('dotenv').config(); } catch (_) {}

var poolModule  = require('./db/pool');
var poller      = require('./workers/outboxPoller');
var scheduler   = require('./jobs/scheduler');

// ─── Required environment variables ──────────────────────────────────────────
// Fail fast at startup if anything critical is missing.  Far better than a
// cryptic DB error or a silent send failure 10 minutes into the process.

var REQUIRED_ENV = [
  'DB_SERVER',    // SQL Server instance/host
  'DB_NAME',      // Database name
  'SMTP_HOST',    // SMTP relay host
  'SMTP_FROM',    // From address: '"Maintenance System" <maintenance@org.com>'
  'APP_URL'       // Base URL for notification-preferences unsubscribe link
];

function checkEnv() {
  var missing = REQUIRED_ENV.filter(function(key) {
    return !process.env[key];
  });
  if (missing.length > 0) {
    console.error('[index] Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

async function boot() {
  console.log('[index] Email service starting at', new Date().toISOString());

  checkEnv();

  // Wait for the connection pool to establish its minimum connections before
  // starting the worker or scheduler — prevents "pool not connected" errors
  // on the first poll cycle.
  console.log('[index] Connecting to database...');
  try {
    await poolModule.poolConnect;
    console.log('[index] Database pool connected');
  } catch (err) {
    console.error('[index] Database connection failed:', err.message);
    process.exit(1);
  }

  var pool = poolModule.pool;

  // Start scheduled jobs (reminder, stats stubs, permanently-failed monitor)
  scheduler.start(pool);

  // Start the outbox polling loop (near-immediate email delivery)
  poller.start(pool);

  console.log('[index] Email service ready');
}

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
// On SIGTERM or SIGINT:
//   1. Stop the scheduler so no new jobs fire
//   2. Stop the poller interval so no new batches are claimed
//   3. In-flight send cycles complete naturally (not interrupted)
//   4. Close the DB pool so SQL Server releases the connections
//   5. Exit cleanly
//
// The deliberate absence of a hard process.exit() timeout here is intentional —
// at this volume, in-flight cycles are a handful of SMTP calls that finish in
// seconds.  If you add a high-throughput path in future, add a hard exit after
// a 30s timeout.

function shutdown(signal) {
  console.log(`[index] ${signal} received — shutting down gracefully`);

  scheduler.stop();
  poller.stop();

  poolModule.pool.close(function() {
    console.log('[index] Database pool closed — exiting');
    process.exit(0);
  });
}

process.on('SIGTERM', function() { shutdown('SIGTERM'); });
process.on('SIGINT',  function() { shutdown('SIGINT');  });

process.on('uncaughtException', function(err) {
  console.error('[index] Uncaught exception:', err);
  // Do not exit — log and continue.  The poller's per-row try/catch means
  // most errors are already isolated.  An uncaught exception here is
  // unexpected and warrants investigation, but not a process restart.
});

process.on('unhandledRejection', function(reason) {
  console.error('[index] Unhandled promise rejection:', reason);
});

// ─── Run ──────────────────────────────────────────────────────────────────────

boot().catch(function(err) {
  console.error('[index] Boot failed:', err.message);
  process.exit(1);
});
