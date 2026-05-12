'use strict';

var sql = require('mssql/msnodesqlv8');

// ─── getByKey ─────────────────────────────────────────────────────────────────
// Returns the emailType row for a given typeKey.
// Returns undefined if the key does not exist or isActive = 0.
// The worker uses this to resolve emailTypeId from a typeKey constant before
// building the outbox payload.
//
// @param {sql.ConnectionPool} pool
// @param {string}             typeKey   e.g. 'ticket.ticket.opened'
// @returns {Promise<object|undefined>}

async function getByKey(pool, typeKey) {
  var request = new sql.Request(pool);
  request.input('typeKey', sql.VarChar(100), typeKey);

  var result = await request.query(`
    SELECT emailTypeId,
           typeKey,
           description,
           isActive
    FROM   dbo.emailType
    WHERE  typeKey  = @typeKey
      AND  isActive = 1
  `);

  return result.recordset[0];
}

module.exports = { getByKey };
