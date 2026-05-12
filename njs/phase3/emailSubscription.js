'use strict';

var sql = require('mssql/msnodesqlv8');

// ─── getForUsers ──────────────────────────────────────────────────────────────
// Returns ALL subscription rows (both isSubscribed=1 and isSubscribed=0) for a
// list of users at all scopes applicable to a given piece of equipment.
//
// Used by recipientResolver to check whether any Tier 1 implicit recipient has
// explicitly opted out.  The resolver applies specificity logic in Node after
// receiving these raw rows.
//
// Uses STRING_SPLIT — requires SQL Server 2016+ (compatibility level 130+).
// Your server is SQL Server 2019 — this is fine.
//
// @param {sql.ConnectionPool} pool
// @param {object} params
//   @param {number[]} params.userIds          Tier 1 candidate user IDs
//   @param {number}   params.emailTypeId
//   @param {object}   params.scopes           Equipment scope IDs
//     @param {number}   scopes.equipmentId
//     @param {number}   scopes.roomId
//     @param {number}   scopes.buildingId
//     @param {number}   scopes.locationId
//     @param {number}   scopes.programId
//     @param {number}   scopes.equipmentTypeId   manufacturingEquipmentTypeId
// @returns {Promise<Array<{ userId, scopeEntity, scopeEntityId, isSubscribed }>>}

async function getForUsers(pool, params) {
  if (!params.userIds || params.userIds.length === 0) return [];

  var userIdsCsv = params.userIds.join(',');
  var scopes     = params.scopes;

  var request = new sql.Request(pool);
  request.input('emailTypeId',   sql.Int,          params.emailTypeId);
  request.input('userIds',       sql.VarChar(4000), userIdsCsv);
  request.input('equipmentId',   sql.Int,           scopes.equipmentId);
  request.input('roomId',        sql.Int,           scopes.roomId);
  request.input('buildingId',    sql.Int,           scopes.buildingId);
  request.input('locationId',    sql.Int,           scopes.locationId);
  request.input('programId',     sql.Int,           scopes.programId);
  request.input('equipmentTypeId', sql.Int,         scopes.equipmentTypeId);

  var result = await request.query(`
    SELECT
        es.userId,
        es.scopeEntity,
        es.scopeEntityId,
        es.isSubscribed
    FROM  dbo.emailSubscription es
    WHERE es.emailTypeId = @emailTypeId
      AND es.userId IN (
            SELECT CAST(value AS INT)
            FROM   STRING_SPLIT(@userIds, ',')
          )
      AND (
               (es.scopeEntity = 'equipment'                  AND es.scopeEntityId = @equipmentId)
            OR (es.scopeEntity = 'room'                       AND es.scopeEntityId = @roomId)
            OR (es.scopeEntity = 'building'                   AND es.scopeEntityId = @buildingId)
            OR (es.scopeEntity = 'location'                   AND es.scopeEntityId = @locationId)
            OR (es.scopeEntity = 'program'                    AND es.scopeEntityId = @programId)
            OR (es.scopeEntity = 'manufacturingEquipmentType' AND es.scopeEntityId = @equipmentTypeId)
          )
  `);

  return result.recordset;
}

// ─── getOptIns ────────────────────────────────────────────────────────────────
// Returns all isSubscribed=1 rows for a given emailTypeId at any scope
// applicable to a given piece of equipment.  These are the Tier 2 explicit
// subscribers — users who opted in but are not implicit recipients.
//
// The resolver deduplicates against Tier 1 and applies opt-out overrides.
//
// @param {sql.ConnectionPool} pool
// @param {object} params
//   @param {number} params.emailTypeId
//   @param {object} params.scopes          Same shape as getForUsers scopes
// @returns {Promise<Array<{ userId, emailAddress, displayName, scopeEntity, scopeEntityId }>>}

async function getOptIns(pool, params) {
  var scopes = params.scopes;

  var request = new sql.Request(pool);
  request.input('emailTypeId',     sql.Int, params.emailTypeId);
  request.input('equipmentId',     sql.Int, scopes.equipmentId);
  request.input('roomId',          sql.Int, scopes.roomId);
  request.input('buildingId',      sql.Int, scopes.buildingId);
  request.input('locationId',      sql.Int, scopes.locationId);
  request.input('programId',       sql.Int, scopes.programId);
  request.input('equipmentTypeId', sql.Int, scopes.equipmentTypeId);

  var result = await request.query(`
    SELECT DISTINCT
        es.userId,
        u.emailAddress,
        -- TODO: replace with your actual name column(s), e.g.:
        --   u.firstName + ' ' + u.lastName AS displayName
        -- Using emailAddress as fallback until confirmed.
        u.emailAddress  AS displayName,
        es.scopeEntity,
        es.scopeEntityId
    FROM  dbo.emailSubscription es
    INNER JOIN dbo.webUser u ON u.userId = es.userId
    WHERE es.emailTypeId   = @emailTypeId
      AND es.isSubscribed  = 1
      AND u.emailAddress   IS NOT NULL
      AND u.dateInactive   IS NULL
      AND (
               (es.scopeEntity = 'equipment'                  AND es.scopeEntityId = @equipmentId)
            OR (es.scopeEntity = 'room'                       AND es.scopeEntityId = @roomId)
            OR (es.scopeEntity = 'building'                   AND es.scopeEntityId = @buildingId)
            OR (es.scopeEntity = 'location'                   AND es.scopeEntityId = @locationId)
            OR (es.scopeEntity = 'program'                    AND es.scopeEntityId = @programId)
            OR (es.scopeEntity = 'manufacturingEquipmentType' AND es.scopeEntityId = @equipmentTypeId)
          )
  `);

  return result.recordset;
}

// ─── upsert ───────────────────────────────────────────────────────────────────
// Calls sp_emailSubscription_upsert.
// isSubscribed=1 → opt-in, isSubscribed=0 → explicit opt-out.
//
// @param {sql.ConnectionPool} pool
// @param {object} params
//   @param {number}  params.userId
//   @param {number}  params.emailTypeId
//   @param {string}  params.scopeEntity
//   @param {number}  params.scopeEntityId
//   @param {boolean} params.isSubscribed
// @returns {Promise<{ emailSubscriptionId: number, wasInserted: boolean }>}

async function upsert(pool, params) {
  var request = new sql.Request(pool);
  request.input('userId',        sql.Int,        params.userId);
  request.input('emailTypeId',   sql.Int,        params.emailTypeId);
  request.input('scopeEntity',   sql.VarChar(50), params.scopeEntity);
  request.input('scopeEntityId', sql.Int,        params.scopeEntityId);
  request.input('isSubscribed',  sql.Bit,        params.isSubscribed ? 1 : 0);

  var result = await request.execute('dbo.sp_emailSubscription_upsert');
  return result.recordset[0];  // { emailSubscriptionId, wasInserted }
}

// ─── remove ───────────────────────────────────────────────────────────────────
// Calls sp_emailSubscription_delete.
// NULL parameters act as wildcards — see SP documentation for bulk-delete
// patterns (e.g. unsubscribe from everything: pass only userId).
//
// @param {sql.ConnectionPool} pool
// @param {object} params
//   @param {number}        params.userId          Required
//   @param {number|null}   params.emailTypeId     null = all types
//   @param {string|null}   params.scopeEntity     null = all scopes
//   @param {number|null}   params.scopeEntityId   null = all entities
// @returns {Promise<{ rowsDeleted: number }>}

async function remove(pool, params) {
  var request = new sql.Request(pool);
  request.input('userId',        sql.Int,         params.userId);
  request.input('emailTypeId',   sql.Int,         params.emailTypeId   != null ? params.emailTypeId   : null);
  request.input('scopeEntity',   sql.VarChar(50), params.scopeEntity   != null ? params.scopeEntity   : null);
  request.input('scopeEntityId', sql.Int,         params.scopeEntityId != null ? params.scopeEntityId : null);

  var result = await request.execute('dbo.sp_emailSubscription_delete');
  return result.recordset[0];  // { rowsDeleted }
}

module.exports = { getForUsers, getOptIns, upsert, remove };
