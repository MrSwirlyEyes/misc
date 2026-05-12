'use strict';

var sql = require('mssql/msnodesqlv8');

// ─── withTransaction ──────────────────────────────────────────────────────────
// Wraps an async function in a SQL Server transaction.
// Commits on success, rolls back on any thrown error, then re-throws.
//
// Usage:
//   var result = await withTransaction(pool, async function(tx) {
//     await ticketQueries.update(tx, params);
//     await emailOutboxQueries.enqueue(tx, outboxParams);
//     return result;
//   });
//
// The callback receives a sql.Transaction object.  Pass it directly to any
// query function that accepts a `conn` parameter — mssql v7 accepts both a
// pool and a transaction as the argument to new sql.Request().
//
// @param {sql.ConnectionPool} pool
// @param {Function}           fn    async (tx: sql.Transaction) => any
// @returns {Promise<any>}           resolves with fn's return value

async function withTransaction(pool, fn) {
  var transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    var result = await fn(transaction);
    await transaction.commit();
    return result;
  } catch (err) {
    try {
      await transaction.rollback();
    } catch (rollbackErr) {
      // Rollback failure is logged but the original error is what the
      // caller needs to see — do not replace it.
      console.error('[db/transaction] Rollback failed:', rollbackErr.message);
    }
    throw err;
  }
}

module.exports = { withTransaction };
