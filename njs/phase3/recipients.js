'use strict';

var sql = require('mssql/msnodesqlv8');

// ─── getEquipmentScopes ───────────────────────────────────────────────────────
// Returns all scope IDs for a piece of equipment, walking the room→building→
// location hierarchy.  Used by recipientResolver and emailSubscription queries
// to know which scope IDs to check for subscriptions/opt-outs.
//
// @param {sql.ConnectionPool} pool
// @param {number}             equipmentId
// @returns {Promise<{
//   equipmentId:      number,
//   roomId:           number,
//   buildingId:       number,
//   locationId:       number,
//   programId:        number,
//   equipmentTypeId:  number   (manufacturingEquipmentTypeId)
// }|undefined>}

async function getEquipmentScopes(pool, equipmentId) {
  var request = new sql.Request(pool);
  request.input('equipmentId', sql.Int, equipmentId);

  var result = await request.query(`
    SELECT
        e.equipmentId,
        e.roomId,
        e.programId,
        e.manufacturingEquipmentTypeId  AS equipmentTypeId,
        r.buildingId,
        b.locationId
    FROM  dbo.manufacturingEquipment  e
    INNER JOIN dbo.room               r ON r.roomId     = e.roomId
    INNER JOIN dbo.building           b ON b.buildingId = r.buildingId
    WHERE e.equipmentId = @equipmentId
  `);

  return result.recordset[0];
}

// ─── resolveImplicit ─────────────────────────────────────────────────────────
// Returns all Tier 1 implicit recipients for a ticket:
//   - The 5 equipment POC fields  (isPOC = 1 → To:)
//   - Ticket creator              (isPOC = 0 → CC: unless also a POC)
//   - All ticketLog contributors  (isPOC = 0 → CC: unless also a POC)
//     Option A: all unique contributors to the ticket, not just the most
//     recent log.  A user who contributed a log on day 1 continues to
//     receive emails for the lifetime of the ticket.
//
// Filtered: NULL emailAddress and inactive users (dateInactive IS NOT NULL)
// are excluded.
//
// The isPOC flag uses MAX() across the UNION ALL so a user who appears as
// both a POC and a log contributor is correctly flagged as a POC.
//
// Opt-out checking is NOT done here — that is the recipientResolver's job
// after calling getForUsers() on this result set.
//
// TODO: Replace `u.emailAddress AS displayName` with your actual name
//       columns once confirmed, e.g. `u.firstName + ' ' + u.lastName`.
//
// @param {sql.ConnectionPool} pool
// @param {number}             ticketId
// @returns {Promise<Array<{
//   userId:       number,
//   emailAddress: string,
//   displayName:  string,
//   isPOC:        boolean
// }>>}

async function resolveImplicit(pool, ticketId) {
  var request = new sql.Request(pool);
  request.input('ticketId', sql.Int, ticketId);

  var result = await request.query(`
    SELECT
        u.userId,
        u.emailAddress,
        -- TODO: update to your webUser name column(s), e.g.:
        --   u.firstName + ' ' + u.lastName AS displayName
        u.emailAddress                       AS displayName,
        MAX(c.isPOC)                         AS isPOC
    FROM (

        -- ── Equipment POC fields ──────────────────────────────────────────
        -- NULLs are excluded by the WHERE clause below so no ISNULL needed.

        SELECT e.pocPrimaryId    AS userId, 1 AS isPOC
        FROM   dbo.ticket t
        INNER JOIN dbo.manufacturingEquipment e ON e.equipmentId = t.equipmentId
        WHERE  t.ticketId           = @ticketId
          AND  e.pocPrimaryId       IS NOT NULL

        UNION ALL

        SELECT e.pocSecondaryId, 1
        FROM   dbo.ticket t
        INNER JOIN dbo.manufacturingEquipment e ON e.equipmentId = t.equipmentId
        WHERE  t.ticketId           = @ticketId
          AND  e.pocSecondaryId     IS NOT NULL

        UNION ALL

        SELECT e.supeDayId, 1
        FROM   dbo.ticket t
        INNER JOIN dbo.manufacturingEquipment e ON e.equipmentId = t.equipmentId
        WHERE  t.ticketId = @ticketId
          AND  e.supeDayId IS NOT NULL

        UNION ALL

        SELECT e.supeNightId, 1
        FROM   dbo.ticket t
        INNER JOIN dbo.manufacturingEquipment e ON e.equipmentId = t.equipmentId
        WHERE  t.ticketId    = @ticketId
          AND  e.supeNightId IS NOT NULL

        UNION ALL

        SELECT e.resEngrId, 1
        FROM   dbo.ticket t
        INNER JOIN dbo.manufacturingEquipment e ON e.equipmentId = t.equipmentId
        WHERE  t.ticketId  = @ticketId
          AND  e.resEngrId IS NOT NULL

        -- ── Ticket creator ───────────────────────────────────────────────

        UNION ALL

        SELECT t.userCreatedId, 0
        FROM   dbo.ticket t
        WHERE  t.ticketId         = @ticketId
          AND  t.userCreatedId    IS NOT NULL

        -- ── All unique ticketLog contributors (Option A) ─────────────────
        -- Every user who has ever added a log to this ticket is included,
        -- not just the user who added the most recent log.

        UNION ALL

        SELECT tl.userCreatedId, 0
        FROM   dbo.ticketLog tl
        WHERE  tl.ticketId        = @ticketId
          AND  tl.userCreatedId   IS NOT NULL

    ) c
    INNER JOIN dbo.webUser u ON u.userId = c.userId
    WHERE u.emailAddress IS NOT NULL
      AND u.dateInactive  IS NULL
    GROUP BY
        u.userId,
        u.emailAddress
  `);

  // Convert the BIT isPOC column to a JS boolean for the service layer.
  return result.recordset.map(function(row) {
    return {
      userId:       row.userId,
      emailAddress: row.emailAddress,
      displayName:  row.displayName,
      isPOC:        row.isPOC === true || row.isPOC === 1
    };
  });
}

module.exports = { getEquipmentScopes, resolveImplicit };
