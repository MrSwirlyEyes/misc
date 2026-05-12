'use strict';

var sql    = require('mssql/msnodesqlv8');
var config = require('../config/db');

// ─── Connection Pool ──────────────────────────────────────────────────────────
// One pool per process.  All query functions receive either this pool (for
// standalone queries) or a Transaction derived from it (for transactional work).
//
// poolConnect is a Promise that resolves when the pool is ready.  Await it in
// index.js before starting the worker and scheduler — this ensures the process
// never attempts a query before the pool has established its minimum connections.

var pool        = new sql.ConnectionPool(config);
var poolConnect = pool.connect();

pool.on('error', function(err) {
  // Pool-level errors (e.g. dropped connections) are logged here.
  // Individual query errors surface as rejected promises on the request.
  console.error('[db/pool] Pool error:', err.message);
});

module.exports = { pool, poolConnect, sql };
