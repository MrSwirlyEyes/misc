'use strict';

// ─── Shared Service ───────────────────────────────────────────────────────────
// This file is used by TWO processes:
//
//   1. The EMAIL-SERVICE process (reminder job, any future standalone enqueues)
//   2. The MAIN API process (called from the ticket service, inside a transaction)
//
// Both processes require mssql v7 and msnodesqlv8 v3.
//   npm install mssql@7 msnodesqlv8@3 --save
//
// The simplest way to share this module with the API is to reference it by
// relative path, e.g. from the API's ticket service:
//   var { enqueue } = require('../../email-service/services/enqueue');
//
// Alternatively, extract /services and /db/queries into a shared internal
// package once the codebase grows to warrant it.

var emailTypeQueries    = require('../db/queries/emailType');
var emailOutboxQueries  = require('../db/queries/emailOutbox');
var recipientQueries    = require('../db/queries/recipients');
var recipientResolver   = require('./recipientResolver');
var constants           = require('../config/constants');

var EMAIL_TYPE  = constants.EMAIL_TYPE;
var ENTITY_TYPE = constants.ENTITY_TYPE;

// ─── enqueue ──────────────────────────────────────────────────────────────────
// Resolves recipients, snapshots all relevant data into the payload, and inserts
// a row into dbo.emailOutbox via sp_emailOutbox_enqueue.
//
// ATOMICITY
// ---------
// The INSERT must share the caller's transaction so it rolls back if the ticket
// write fails.  Read queries (steps 1-3) use the pool — they do not need to
// participate in the transaction and running them outside it avoids unnecessary
// lock escalation.
//
// PAYLOAD SNAPSHOT
// ----------------
// Recipients and templateData are captured NOW (enqueue time).  This means:
//   - Retries send to the same people even if POCs change before delivery.
//   - Retries use the same template data even if the ticket is updated.
//   - The emailLog reflects exactly what was sent, not what the DB looks like
//     at query time.
//
// TEMPLATE DATA CONTRACT
// ----------------------
// params.templateData is passed verbatim to the template builders in sender.js.
// It must include all fields the relevant template expects.  See JSDoc on each
// buildTicket*Email() function in /templates/ for the full field list.  Common
// required fields across all three types:
//
//   Equipment:   equipmentId*, equipmentName, assetNumber, serialNumber,
//                manufacturer, model, isCritical, equipmentType,
//                location, poc, equipmentUrl*
//   Ticket:      ticketNumber, ticketUrl*
//   Capabilities: disabledCapabilities[] or restoredCapabilities[]
//   Logs:        logs[] — [{ description, dateCreated, userCreated }]
//
//   (* equipmentId is also used for the List-Unsubscribe header in sender.js)
//
// DUPLICATE HANDLING
// ------------------
// sp_emailOutbox_enqueue catches unique constraint violations and returns
// wasInserted=false silently — no throw, no retry needed.  This covers the
// race condition where two concurrent ticket saves both try to enqueue the
// same event.
//
// @param  {sql.ConnectionPool}             pool
//   Read queries run against the pool (no transaction needed for SELECTs).
//
// @param  {sql.Transaction|sql.ConnectionPool} transaction
//   The INSERT runs through this.  Pass the active transaction from the ticket
//   service for full atomicity.  Pass the pool for standalone enqueues
//   (e.g. the reminder job where there is no enclosing business transaction).
//
// @param  {object} params
//   @param {string}      params.eventType      One of the EMAIL_TYPE constants
//   @param {number}      params.ticketId
//   @param {number|null} params.eventSourceId  ticketLogId for 'updated'/'closed';
//                                               null for 'opened' (no log yet)
//   @param {number}      params.equipmentId
//   @param {object}      params.templateData   Full data snapshot — see contract above
//
// @returns {Promise<{
//   skipped:       boolean,
//   reason?:       string,    // set when skipped=true
//   emailOutboxId?: number,   // set when skipped=false
//   wasInserted?:  boolean    // false = duplicate, already enqueued
// }>}

async function enqueue(pool, transaction, params) {

  // ── 1. Resolve emailTypeId ─────────────────────────────────────────────────
  // getByKey filters isActive=0 — if a type is disabled, enqueue is a no-op.

  var emailType = await emailTypeQueries.getByKey(pool, params.eventType);

  if (!emailType) {
    throw new Error(
      '[enqueue] Unknown or inactive email type: "' + params.eventType + '". ' +
      'Verify the typeKey exists in dbo.emailType with isActive=1.'
    );
  }

  // ── 2. Get equipment scope IDs ─────────────────────────────────────────────
  // Scopes drive both recipient resolution and subscription opt-out checking.

  var scopes = await recipientQueries.getEquipmentScopes(pool, params.equipmentId);

  if (!scopes) {
    throw new Error(
      '[enqueue] Equipment not found or missing room→building→location chain. ' +
      'equipmentId: ' + params.equipmentId
    );
  }

  // ── 3. Resolve recipients ──────────────────────────────────────────────────
  // Returns { to: [...], cc: [...] } after applying two-tier logic and
  // specificity-based opt-out filtering.

  var recipients = await recipientResolver.resolve(pool, {
    ticketId:    params.ticketId,
    emailTypeId: emailType.emailTypeId,
    scopes:      scopes
  });

  // Skip silently when all recipients have opted out.  This is a valid state,
  // not an error — a ticket can exist with no one wanting emails about it.
  if (recipients.to.length === 0 && recipients.cc.length === 0) {
    return {
      skipped: true,
      reason:  'No recipients after opt-out filtering. All implicit recipients ' +
               'have unsubscribed and no active opt-in subscribers exist for ' +
               'this equipment or its scopes.'
    };
  }

  // ── 4. Build payload snapshot ──────────────────────────────────────────────
  // typeKey is stored here so sender.js can dispatch to the correct template
  // builder without an extra DB lookup.

  var payload = JSON.stringify({
    typeKey:      params.eventType,
    to:           recipients.to,
    cc:           recipients.cc,
    templateData: params.templateData
  });

  // ── 5. INSERT into emailOutbox (via the caller's transaction) ──────────────
  // sp_emailOutbox_enqueue handles duplicate constraint violations gracefully —
  // returns wasInserted=false without throwing.

  var result = await emailOutboxQueries.enqueue(transaction, {
    emailTypeId:   emailType.emailTypeId,
    entityType:    ENTITY_TYPE.TICKET,
    entityId:      params.ticketId,
    eventSourceId: params.eventSourceId != null ? params.eventSourceId : null,
    payload:       payload
  });

  return {
    skipped:      false,
    emailOutboxId: result.emailOutboxId,
    wasInserted:   result.wasInserted === true || result.wasInserted === 1
  };
}

module.exports = { enqueue, EMAIL_TYPE };
