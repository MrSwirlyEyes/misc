'use strict';

// ─── Database Connection Config ───────────────────────────────────────────────
// Driver: msnodesqlv8 — native Windows SQL Server connectivity.
// Auth:   Windows Authentication (Trusted Connection) — no stored credentials.
//
// Required environment variables:
//   DB_SERVER   SQL Server instance name or host, e.g. "MYSERVER\SQLEXPRESS"
//               or "myserver.domain.local"
//   DB_NAME     Database name, e.g. "MaintenanceDB"
//
// Optional:
//   DB_POOL_MAX          Max pool connections (default: 10)
//   DB_POOL_MIN          Min pool connections (default: 2)
//   DB_POOL_IDLE_MS      Idle timeout in ms    (default: 30000)
//   DB_REQUEST_TIMEOUT   Query timeout in ms   (default: 30000)

module.exports = {
  server:         process.env.DB_SERVER,
  database:       process.env.DB_NAME,
  driver:         'msnodesqlv8',
  requestTimeout: parseInt(process.env.DB_REQUEST_TIMEOUT || '30000', 10),
  options: {
    trustedConnection:      true,   // Windows Auth — do not add user/password
    enableArithAbort:       true,   // required by mssql v7 for SQL Server 2017+
    trustServerCertificate: true    // avoids cert validation errors on internal servers
  },
  pool: {
    max:             parseInt(process.env.DB_POOL_MAX      || '10',    10),
    min:             parseInt(process.env.DB_POOL_MIN      || '2',     10),
    idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_MS || '30000', 10)
  }
};
