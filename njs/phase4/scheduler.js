'use strict';

var schedule       = require('node-schedule');
var retryScheduler = require('../workers/retryScheduler');
var reminderJob    = require('./reminderJob');
var statisticsJob  = require('./statisticsJob');

// ─── Registered jobs ──────────────────────────────────────────────────────────
// All node-schedule job objects are collected here so they can be cancelled
// during graceful shutdown.

var _jobs = [];

// ─── start ────────────────────────────────────────────────────────────────────
// Registers every scheduled task.  Called from index.js after the pool is ready.
// To add a new scheduled task:
//   1. Import the job module above
//   2. Call _register() with the cron expression and job function
//   3. No other files need to change
//
// Cron syntax (node-schedule):
//   ┌─ second (optional)
//   │ ┌─ minute
//   │ │ ┌─ hour
//   │ │ │ ┌─ day of month
//   │ │ │ │ ┌─ month
//   │ │ │ │ │ ┌─ day of week (0=Sunday)
//   │ │ │ │ │ │
//  '0 0 7 * * 1'  → every Monday at 07:00
//
// All times are local server time unless you use UTC-aware cron strings.

function start(pool) {

  // ── Permanently-failed row monitor ────────────────────────────────────────
  // Every hour — surfaces any rows that exhausted all retries so they can be
  // investigated.  Tune the schedule or add alerting in retryScheduler.js.
  _register('0 * * * *', 'permanentlyFailed monitor', function() {
    retryScheduler.checkPermanentlyFailed(pool).catch(function(err) {
      console.error('[scheduler] retryScheduler error:', err.message);
    });
  });

  // ── Weekly open-ticket reminder ────────────────────────────────────────────
  // Every Monday at 07:00.
  // Activate by setting isActive=1 for 'ticket.ticket.reminder' in dbo.emailType.
  _register('0 7 * * 1', 'weekly ticket reminder', function() {
    reminderJob.run(pool).catch(function(err) {
      console.error('[scheduler] reminderJob error:', err.message);
    });
  });

  // ── MTBF summary report ────────────────────────────────────────────────────
  // First Monday of each month at 07:30.
  // Activate by setting isActive=1 for 'reporting.ticket.mtbf_summary'.
  _register('30 7 1-7 * 1', 'MTBF summary report', function() {
    statisticsJob.mtbfSummary(pool).catch(function(err) {
      console.error('[scheduler] mtbfSummary error:', err.message);
    });
  });

  // ── Weekly digest report ───────────────────────────────────────────────────
  // Every Monday at 07:45 (after the reminder, before start of business).
  // Activate by setting isActive=1 for 'reporting.ticket.weekly_digest'.
  _register('45 7 * * 1', 'weekly digest report', function() {
    statisticsJob.weeklyDigest(pool).catch(function(err) {
      console.error('[scheduler] weeklyDigest error:', err.message);
    });
  });

  console.log(`[scheduler] Registered ${_jobs.length} scheduled task(s)`);
}

// ─── stop ─────────────────────────────────────────────────────────────────────
// Cancels all node-schedule jobs.  Called from index.js during graceful shutdown.

function stop() {
  _jobs.forEach(function(j) { j.job.cancel(); });
  _jobs = [];
  console.log('[scheduler] All scheduled tasks cancelled');
}

// ─── _register ────────────────────────────────────────────────────────────────

function _register(cronExpr, label, fn) {
  var job = schedule.scheduleJob(cronExpr, fn);
  _jobs.push({ label: label, job: job });
  console.log(`[scheduler] Registered: "${label}" (${cronExpr})`);
}

module.exports = { start, stop };
