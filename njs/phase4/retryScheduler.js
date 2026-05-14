'use strict';

// ─── retryScheduler ───────────────────────────────────────────────────────────
// Retry backoff is calculated by sp_emailOutbox_markFailed and the poller
// picks up eligible rows automatically — no Node-side backoff computation is
// needed.
//
// This module's job is MONITORING: periodically query for rows that have hit
// permanentlyFailed so someone (a human or a future alerting integration) knows
// about them.  Without this, permanently failed rows sit silently in the DB.
//
// Future extension points:
//   - Send an alert email to a system admin distribution list
//   - POST to a Slack webhook
//   - Write to a Windows Event Log entry
//   - Integrate with whatever monitoring system your org uses

var sql = require('mssql/msnodesqlv8');

// How many permanently failed rows to surface per check.
var MAX_SURFACE = 50;

// ─── checkPermanentlyFailed ───────────────────────────────────────────────────
// Queries for rows that have permanently failed and logs them.
// Called on a schedule from jobs/scheduler.js.
//
// @param {sql.ConnectionPool} pool

async function checkPermanentlyFailed(pool) {
  var request = new sql.Request(pool);
  var result  = await request.query(`
    SELECT TOP (${MAX_SURFACE})
        o.emailOutboxId,
        t.typeKey,
        o.entityType,
        o.entityId,
        o.attemptCount,
        o.errorMessage,
        o.createdAt,
        o.lastAttemptedAt
    FROM  dbo.emailOutbox  o
    INNER JOIN dbo.emailType t ON t.emailTypeId = o.emailTypeId
    WHERE o.status = 'permanentlyFailed'
    ORDER BY o.lastAttemptedAt DESC
  `);

  var rows = result.recordset;

  if (rows.length === 0) return;

  // ── Log to console (replace or extend with your alerting mechanism) ────────
  console.warn(
    `[retryScheduler] ${rows.length} permanently failed outbox row(s) found ` +
    `at ${new Date().toISOString()}:`
  );
  rows.forEach(function(row) {
    console.warn(
      `  emailOutboxId=${row.emailOutboxId} ` +
      `type=${row.typeKey} ` +
      `entityType=${row.entityType} entityId=${row.entityId} ` +
      `attempts=${row.attemptCount} ` +
      `lastAttempted=${row.lastAttemptedAt} ` +
      `error="${(row.errorMessage || '').substring(0, 120)}"`
    );
  });

  // TODO: replace the console.warn above (or add alongside it) with your
  // preferred alerting mechanism.  Example Slack webhook stub:
  //
  // var https = require('https');
  // var body  = JSON.stringify({
  //   text: `*Email Service Alert*: ${rows.length} permanently failed outbox rows.\n` +
  //         rows.map(function(r) {
  //           return `• #${r.emailOutboxId} — ${r.typeKey} entity ${r.entityId}: ${r.errorMessage}`;
  //         }).join('\n')
  // });
  // ... POST to process.env.SLACK_WEBHOOK_URL
}

module.exports = { checkPermanentlyFailed };
