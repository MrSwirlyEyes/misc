'use strict';

var sql = require('mssql/msnodesqlv8');

// ─── insert ───────────────────────────────────────────────────────────────────
// Writes a permanent audit record via sp_emailLog_insert.
// Call this BEFORE markSent — if this fails the outbox row stays in
// 'processing' and markFailed is called instead, keeping log and outbox
// consistent.
//
// @param {sql.ConnectionPool} pool
// @param {object} params
//   @param {number} params.emailOutboxId
//   @param {number} params.emailTypeId
//   @param {string} params.entityType      e.g. 'ticket'
//   @param {number} params.entityId         e.g. ticketId
//   @param {string} params.recipients       JSON: { to: [...], cc: [...] }
//   @param {string} params.subject
//   @param {string} params.htmlBody         Full rendered HTML sent to nodemailer
//   @param {number} params.attemptNumber    emailOutbox.attemptCount at send time
// @returns {Promise<{ emailLogId: number }>}

async function insert(pool, params) {
  var request = new sql.Request(pool);
  request.input('emailOutboxId', sql.Int,               params.emailOutboxId);
  request.input('emailTypeId',   sql.Int,               params.emailTypeId);
  request.input('entityType',    sql.VarChar(50),        params.entityType);
  request.input('entityId',      sql.Int,               params.entityId);
  request.input('recipients',    sql.NVarChar(sql.MAX), params.recipients);
  request.input('subject',       sql.NVarChar(500),     params.subject);
  request.input('htmlBody',      sql.NVarChar(sql.MAX), params.htmlBody);
  request.input('attemptNumber', sql.Int,               params.attemptNumber);

  var result = await request.execute('dbo.sp_emailLog_insert');
  return result.recordset[0];  // { emailLogId }
}

module.exports = { insert };
