'use strict';

var emailOutboxQueries = require('../db/queries/emailOutbox');
var sender             = require('../services/sender');
var constants          = require('../config/constants');

var WORKER = constants.WORKER;

// ─── State ────────────────────────────────────────────────────────────────────
// _isRunning prevents overlapping poll cycles.  If the previous cycle is still
// processing (e.g. a slow SMTP server) when the next interval fires, the new
// tick is a no-op.  This keeps things simple without needing a queue library.

var _pollTimer  = null;
var _isRunning  = false;

// ─── poll ─────────────────────────────────────────────────────────────────────
// One poll cycle.  Claims a batch, processes each row sequentially, isolates
// per-row errors so one bad send does not abort the rest of the batch.

async function poll(pool) {
  if (_isRunning) {
    // Previous cycle hasn't finished — skip this tick.
    return;
  }

  _isRunning = true;

  try {
    var rows = await emailOutboxQueries.claimBatch(pool, WORKER.BATCH_SIZE);

    if (rows.length === 0) {
      return;  // Nothing to do this cycle
    }

    console.log(`[outboxPoller] Claimed ${rows.length} row(s) at ${new Date().toISOString()}`);

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      try {
        await sender.send(pool, row);
        console.log(`[outboxPoller] Sent   emailOutboxId=${row.emailOutboxId}`);
      } catch (sendErr) {
        // sender.send() already called markFailed / markPermanentlyFailed.
        // Log here for visibility and continue with the next row.
        console.error(
          `[outboxPoller] Failed emailOutboxId=${row.emailOutboxId} ` +
          `attempt=${row.attemptCount}/${row.maxAttempts}: ${sendErr.message}`
        );
      }
    }

  } catch (pollErr) {
    // Failure at the claim level (e.g. DB connection dropped).
    // Log and let the next scheduled tick retry.
    console.error(`[outboxPoller] Poll cycle error: ${pollErr.message}`);
  } finally {
    _isRunning = false;
  }
}

// ─── start ────────────────────────────────────────────────────────────────────
// Starts the polling loop and runs one immediate cycle so the worker is active
// the moment the process starts rather than waiting for the first interval.
//
// @param {sql.ConnectionPool} pool

function start(pool) {
  if (_pollTimer) {
    console.warn('[outboxPoller] Already running — ignoring duplicate start()');
    return;
  }

  var intervalSec = WORKER.POLL_INTERVAL_MS / 1000;
  console.log(`[outboxPoller] Starting — polling every ${intervalSec}s, batch size ${WORKER.BATCH_SIZE}`);

  // Run immediately, then on the interval.
  poll(pool).catch(function(err) {
    console.error('[outboxPoller] Startup poll error:', err.message);
  });

  _pollTimer = setInterval(function() {
    poll(pool).catch(function(err) {
      console.error('[outboxPoller] Interval poll error:', err.message);
    });
  }, WORKER.POLL_INTERVAL_MS);
}

// ─── stop ─────────────────────────────────────────────────────────────────────
// Stops the polling loop.  In-flight cycles are not interrupted — they will
// complete naturally.  Called during graceful shutdown in index.js.

function stop() {
  if (_pollTimer) {
    clearInterval(_pollTimer);
    _pollTimer = null;
    console.log('[outboxPoller] Stopped');
  }
}

module.exports = { start, stop };
