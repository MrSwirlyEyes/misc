'use strict';

var sql = require('mssql/msnodesqlv8');

// ─── enqueue ──────────────────────────────────────────────────────────────────
// Calls sp_emailOutbox_enqueue to insert a new pending outbox row.
//
// IMPORTANT: pass a sql.Transaction as `conn` when calling from the API
// alongside a ticket write — this makes the outbox insert atomic with the
// business event.  Pass the pool for standalone enqueues (e.g. reminder job).
//
// @param {sql.Transaction|sql.ConnectionPool} conn
// @param {object} params
//   @param {number}      params.emailTypeId
//   @param {string}      params.entityType     e.g. 'ticket'
//   @param {number}      params.entityId        e.g. ticketId
//   @param {number|null} params.eventSourceId   ticketLogId or null for opened
//   @param {string|null} params.payload         JSON string (recipients + template data)
// @returns {Promise<{ emailOutboxId: number|null, wasInserted: boolean }>}

async function enqueue(conn, params) {
  var request = new sql.Request(conn);
  request.input('emailTypeId',   sql.Int,               params.emailTypeId);
  request.input('entityType',    sql.VarChar(50),        params.entityType);
  request.input('entityId',      sql.Int,               params.entityId);
  request.input('eventSourceId', sql.Int,               params.eventSourceId != null ? params.eventSourceId : null);
  request.input('payload',       sql.NVarChar(sql.MAX), params.payload        != null ? params.payload        : null);

  var result = await request.execute('dbo.sp_emailOutbox_enqueue');
  return result.recordset[0];  // { emailOutboxId, wasInserted }
}

// ─── claimBatch ───────────────────────────────────────────────────────────────
// Atomically claims up to batchSize pending/retryable rows for processing.
// Returns an array of claimed rows — empty array if nothing is ready.
// Uses UPDATE...OUTPUT in the SP so no two workers can claim the same row.
//
// @param {sql.ConnectionPool} pool
// @param {number}             batchSize
// @returns {Promise<Array>}

async function claimBatch(pool, batchSize) {
  var request = new sql.Request(pool);
  request.input('batchSize', sql.Int, batchSize);

  var result = await request.execute('dbo.sp_emailOutbox_claimBatch');
  return result.recordset;  // may be empty
}

// ─── markSent ─────────────────────────────────────────────────────────────────
// Marks an outbox row as successfully delivered.
// Call AFTER sp_emailLog_insert succeeds — log first, then mark sent.
//
// @param {sql.ConnectionPool} pool
// @param {number}             emailOutboxId
// @returns {Promise<{ rowsAffected: number }>}

async function markSent(pool, emailOutboxId) {
  var request = new sql.Request(pool);
  request.input('emailOutboxId', sql.Int, emailOutboxId);

  var result = await request.execute('dbo.sp_emailOutbox_markSent');
  return result.recordset[0];  // { rowsAffected }
}

// ─── markFailed ───────────────────────────────────────────────────────────────
// Records a failed send attempt, schedules retry backoff, and automatically
// promotes to permanentlyFailed when attemptCount >= maxAttempts.
//
// @param {sql.ConnectionPool} pool
// @param {number}             emailOutboxId
// @param {string}             errorMessage    SMTP error or exception message
// @returns {Promise<{ newStatus: string }>}   'failed' or 'permanentlyFailed'

async function markFailed(pool, emailOutboxId, errorMessage) {
  var request = new sql.Request(pool);
  request.input('emailOutboxId', sql.Int,               emailOutboxId);
  request.input('errorMessage',  sql.NVarChar(sql.MAX), errorMessage);

  var result = await request.execute('dbo.sp_emailOutbox_markFailed');
  return result.recordset[0];  // { newStatus }
}

// ─── markPermanentlyFailed ────────────────────────────────────────────────────
// Manual DBA/admin override — use only to cancel a stuck or unwanted row.
// The worker uses markFailed for standard failure handling; this is for
// out-of-band intervention only.
//
// @param {sql.ConnectionPool} pool
// @param {number}             emailOutboxId
// @param {string|null}        errorMessage   Optional admin note
// @returns {Promise<{ rowsAffected: number }>}

async function markPermanentlyFailed(pool, emailOutboxId, errorMessage) {
  var request = new sql.Request(pool);
  request.input('emailOutboxId', sql.Int,               emailOutboxId);
  request.input('errorMessage',  sql.NVarChar(sql.MAX), errorMessage != null ? errorMessage : null);

  var result = await request.execute('dbo.sp_emailOutbox_markPermanentlyFailed');
  return result.recordset[0];  // { rowsAffected }
}

module.exports = {
  enqueue,
  claimBatch,
  markSent,
  markFailed,
  markPermanentlyFailed
};
