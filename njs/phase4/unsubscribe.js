'use strict';

// ─── Shared Service ───────────────────────────────────────────────────────────
// Importable from both the email-service process and the main API process.
// Only depends on mssql and the db/queries layer — no nodemailer, no scheduler.
//
// These functions back two surfaces in the API:
//
//   1. Quick opt-out  GET /unsubscribe?equipment_id=42&email_type=ticket
//      SSO gives userId, query params give scope.  Call optOutOfEquipment().
//      Show a confirmation page.  One round trip, done.
//
//   2. Preferences page  GET /notification-preferences?equipment_id=42
//      Render getPreferences() results as a UI.
//      On save: call optIn() / optOut() / removeAll() as needed.

var emailSubscriptionQueries = require('../db/queries/emailSubscription');
var constants                = require('../config/constants');

var SCOPE_ENTITY = constants.SCOPE_ENTITY;

// ─── optOut ───────────────────────────────────────────────────────────────────
// Records an explicit opt-out (isSubscribed=0) at the given scope.
// For Tier 1 users (POCs, ticket creators): this suppresses the implicit send.
// For Tier 2 users: this overrides any broader opt-in at a less-specific scope.
//
// @param {sql.ConnectionPool} pool
// @param {object} params
//   @param {number} params.userId
//   @param {number} params.emailTypeId
//   @param {string} params.scopeEntity     SCOPE_ENTITY constant
//   @param {number} params.scopeEntityId   PK of the scoped entity
// @returns {Promise<{ emailSubscriptionId: number, wasInserted: boolean }>}

async function optOut(pool, params) {
  return emailSubscriptionQueries.upsert(pool, {
    userId:        params.userId,
    emailTypeId:   params.emailTypeId,
    scopeEntity:   params.scopeEntity,
    scopeEntityId: params.scopeEntityId,
    isSubscribed:  false
  });
}

// ─── optIn ────────────────────────────────────────────────────────────────────
// Records an explicit opt-in (isSubscribed=1) at the given scope.
// Used for:
//   • Tier 2 users subscribing to a scope they weren't already on
//   • Tier 1 users re-subscribing after a previous optOut at this scope
//
// @param {sql.ConnectionPool} pool
// @param {object} params  (same shape as optOut)
// @returns {Promise<{ emailSubscriptionId: number, wasInserted: boolean }>}

async function optIn(pool, params) {
  return emailSubscriptionQueries.upsert(pool, {
    userId:        params.userId,
    emailTypeId:   params.emailTypeId,
    scopeEntity:   params.scopeEntity,
    scopeEntityId: params.scopeEntityId,
    isSubscribed:  true
  });
}

// ─── optOutOfEquipment ────────────────────────────────────────────────────────
// Convenience wrapper for the most common unsubscribe action — the "Manage
// notifications" link in the email footer points to a page that eventually
// calls this for a one-click equipment-level opt-out.
//
// An equipment-level opt-out has the highest specificity score (10) so it
// overrides any broader subscription the user may have (program, location, etc).
//
// @param {sql.ConnectionPool} pool
// @param {number} userId
// @param {number} equipmentId
// @param {number} emailTypeId

async function optOutOfEquipment(pool, userId, equipmentId, emailTypeId) {
  return optOut(pool, {
    userId:        userId,
    emailTypeId:   emailTypeId,
    scopeEntity:   SCOPE_ENTITY.EQUIPMENT,
    scopeEntityId: equipmentId
  });
}

// ─── removeAll ────────────────────────────────────────────────────────────────
// Deletes ALL subscription rows for a user (both opt-ins and opt-outs).
// This is the "unsubscribe from everything" / select-all delete action.
// After this call the user has no preference records — they return to the
// default for their tier:
//   Tier 1 (POC / ticket creator / log contributor): included again
//   Tier 2 (explicit subscriber): excluded
//
// Optionally scoped to a single emailTypeId.
//
// @param {sql.ConnectionPool} pool
// @param {number}       userId
// @param {number|null}  emailTypeId   null = remove all types

async function removeAll(pool, userId, emailTypeId) {
  return emailSubscriptionQueries.remove(pool, {
    userId:        userId,
    emailTypeId:   emailTypeId != null ? emailTypeId : null,
    scopeEntity:   null,
    scopeEntityId: null
  });
}

// ─── getPreferences ───────────────────────────────────────────────────────────
// Returns all subscription rows for a user across all email types and scopes.
// Used to populate the notification preferences page.
//
// Rows with isSubscribed=0 are explicit opt-outs (shown as "off" in the UI).
// Rows with isSubscribed=1 are explicit opt-ins (shown as "on" in the UI).
// Missing rows mean "default" — the UI should indicate this separately.
//
// @param {sql.ConnectionPool} pool
// @param {number}       userId
// @param {number|null}  emailTypeId   null = return all types
// @returns {Promise<Array<{
//   emailSubscriptionId, userId, emailTypeId, typeKey,
//   scopeEntity, scopeEntityId, isSubscribed, updatedAt
// }>>}

async function getPreferences(pool, userId, emailTypeId) {
  var sql     = require('mssql/msnodesqlv8');
  var request = new sql.Request(pool);

  request.input('userId', sql.Int, userId);

  var typeFilter = emailTypeId != null
    ? 'AND es.emailTypeId = @emailTypeId'
    : '';

  if (emailTypeId != null) {
    request.input('emailTypeId', sql.Int, emailTypeId);
  }

  var result = await request.query(`
    SELECT
        es.emailSubscriptionId,
        es.userId,
        es.emailTypeId,
        et.typeKey,
        es.scopeEntity,
        es.scopeEntityId,
        es.isSubscribed,
        es.updatedAt
    FROM  dbo.emailSubscription  es
    INNER JOIN dbo.emailType     et ON et.emailTypeId = es.emailTypeId
    WHERE es.userId = @userId
    ${typeFilter}
    ORDER BY et.typeKey, es.scopeEntity, es.scopeEntityId
  `);

  return result.recordset;
}

// ─── updatePreference ─────────────────────────────────────────────────────────
// Upserts a single subscription preference row.  Thin wrapper around the query
// function that exists so API route handlers have one named function to call
// regardless of whether the operation is an opt-in or opt-out.
//
// @param {sql.ConnectionPool} pool
// @param {object} params
//   @param {number}  params.userId
//   @param {number}  params.emailTypeId
//   @param {string}  params.scopeEntity
//   @param {number}  params.scopeEntityId
//   @param {boolean} params.isSubscribed    true = opt-in, false = opt-out
// @returns {Promise<{ emailSubscriptionId: number, wasInserted: boolean }>}

async function updatePreference(pool, params) {
  return emailSubscriptionQueries.upsert(pool, params);
}

module.exports = {
  optOut,
  optIn,
  optOutOfEquipment,
  removeAll,
  getPreferences,
  updatePreference
};
