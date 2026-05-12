'use strict';

var SCOPE_SPECIFICITY       = require('../config/constants').SCOPE_SPECIFICITY;
var recipientQueries        = require('../db/queries/recipients');
var emailSubscriptionQueries = require('../db/queries/emailSubscription');

// ─── applySpecificity ─────────────────────────────────────────────────────────
// Internal helper.  Given a flat list of emailSubscription rows for one or more
// users, determines the final isSubscribed verdict for each userId by selecting
// the row at the highest-specificity applicable scope.
//
// SPECIFICITY ORDER (higher number = more specific = wins):
//   equipment (10) > room (4) > building (3) > location/program/type (2)
//
// TIE RULE: when two applicable rows have the same score (e.g. a user
// subscribed to program X but opted out of location Y, both score 2), the
// opt-out wins.  Respecting an explicit "don't email me" is always the safer
// call when intent is ambiguous across dimensions.
//
// @param  {Array}  subscriptionRows   Rows from emailSubscription.getForUsers()
// @returns {object}                   { [userId: number]: boolean }

function applySpecificity(subscriptionRows) {
  var byUser = {};

  subscriptionRows.forEach(function(row) {
    var userId = row.userId;
    var score  = SCOPE_SPECIFICITY[row.scopeEntity] || 0;
    var sub    = row.isSubscribed === true || row.isSubscribed === 1;
    var current = byUser[userId];

    if (!current) {
      // First row seen for this user
      byUser[userId] = { isSubscribed: sub, score: score };
    } else if (score > current.score) {
      // This row is at a more specific scope — it wins outright
      byUser[userId] = { isSubscribed: sub, score: score };
    } else if (score === current.score && !sub) {
      // Tied specificity: opt-out wins
      byUser[userId].isSubscribed = false;
    }
    // score < current.score: current is more specific, discard this row
  });

  // Convert to a clean { userId -> boolean } map
  var result = {};
  Object.keys(byUser).forEach(function(uid) {
    result[parseInt(uid, 10)] = byUser[uid].isSubscribed;
  });
  return result;
}

// ─── resolve ──────────────────────────────────────────────────────────────────
// Builds the final To and CC recipient lists for a ticket email event.
//
// TWO-TIER MODEL
// ──────────────
// Tier 1 — Implicit recipients (included by default, opt-OUT model):
//   • The 5 equipment POC fields  → To:
//   • Ticket creator              → CC:
//   • All ticketLog contributors  → CC:
//   A Tier 1 user is excluded only when they have an explicit opt-out
//   (isSubscribed=0) at the highest-specificity applicable scope for this
//   equipment, and no more-specific opt-in overrides it.
//
// Tier 2 — Explicit subscribers (excluded by default, opt-IN model):
//   • Anyone with isSubscribed=1 at any applicable scope (equipment, room,
//     building, location, program, manufacturingEquipmentType).
//   A Tier 2 user is excluded if a more-specific opt-out overrides their
//   subscription.
//   Users already in Tier 1 are not duplicated in Tier 2.
//
// DEDUPLICATION
//   By userId across all lists.  A user appearing as both a POC and a log
//   contributor appears once in To: (POC status takes precedence).
//
// @param  {sql.ConnectionPool} pool
// @param  {object} params
//   @param {number} params.ticketId
//   @param {number} params.emailTypeId
//   @param {object} params.scopes           From getEquipmentScopes():
//     { equipmentId, roomId, buildingId, locationId, programId, equipmentTypeId }
// @returns {Promise<{
//   to: Array<{ userId, emailAddress, displayName }>,
//   cc: Array<{ userId, emailAddress, displayName }>
// }>}

async function resolve(pool, params) {
  var ticketId    = params.ticketId;
  var emailTypeId = params.emailTypeId;
  var scopes      = params.scopes;

  // ╔══════════════════════════════════════════════════════════════════════════
  // ║  TIER 1 — IMPLICIT RECIPIENTS
  // ╚══════════════════════════════════════════════════════════════════════════

  var implicitUsers = await recipientQueries.resolveImplicit(pool, ticketId);
  var finalTier1    = implicitUsers;  // start with all, filter below if needed

  if (implicitUsers.length > 0) {
    var tier1UserIds = implicitUsers.map(function(u) { return u.userId; });

    // Get every subscription row (opt-in AND opt-out) for these users across
    // all scopes applicable to this equipment.
    var tier1Subs = await emailSubscriptionQueries.getForUsers(pool, {
      userIds:     tier1UserIds,
      emailTypeId: emailTypeId,
      scopes:      scopes
    });

    // Only filter if there are any subscription records — if nobody has ever
    // touched their preferences, everyone stays in (Tier 1 default = include).
    if (tier1Subs.length > 0) {
      var tier1Map = applySpecificity(tier1Subs);

      finalTier1 = implicitUsers.filter(function(user) {
        var verdict = tier1Map[user.userId];
        // undefined = no preference record = default = include
        return verdict === undefined ? true : verdict;
      });
    }
  }

  // Build a lookup for quick Tier 1 deduplication in Tier 2
  var tier1IdSet = {};
  finalTier1.forEach(function(u) { tier1IdSet[u.userId] = true; });

  // ╔══════════════════════════════════════════════════════════════════════════
  // ║  TIER 2 — EXPLICIT SUBSCRIBERS
  // ╚══════════════════════════════════════════════════════════════════════════

  // getOptIns returns users with isSubscribed=1 at any applicable scope.
  // These may include users already in Tier 1 — we strip those out.
  var optIns = await emailSubscriptionQueries.getOptIns(pool, {
    emailTypeId: emailTypeId,
    scopes:      scopes
  });

  var tier2Candidates = optIns.filter(function(u) {
    return !tier1IdSet[u.userId];
  });

  var finalTier2 = tier2Candidates;

  if (tier2Candidates.length > 0) {
    var tier2UserIds = tier2Candidates.map(function(u) { return u.userId; });

    // Check for more-specific opt-outs that might override a broad subscription.
    // Example: subscribed to program X (score 2) but equipment-level opt-out
    // (score 10) → equipment opt-out wins → excluded.
    var tier2Subs = await emailSubscriptionQueries.getForUsers(pool, {
      userIds:     tier2UserIds,
      emailTypeId: emailTypeId,
      scopes:      scopes
    });

    if (tier2Subs.length > 0) {
      var tier2Map = applySpecificity(tier2Subs);

      finalTier2 = tier2Candidates.filter(function(user) {
        var verdict = tier2Map[user.userId];
        // These users came from getOptIns so they have at least one isSubscribed=1
        // row.  Include unless a more-specific opt-out explicitly overrides it.
        return verdict === undefined ? true : verdict;
      });
    }

    // Deduplicate Tier 2 by userId (a user may have opted into multiple scopes
    // that all cover this equipment — getOptIns uses DISTINCT but worth guarding)
    var seenTier2 = {};
    finalTier2 = finalTier2.filter(function(u) {
      if (seenTier2[u.userId]) return false;
      seenTier2[u.userId] = true;
      return true;
    });
  }

  // ╔══════════════════════════════════════════════════════════════════════════
  // ║  SPLIT INTO TO / CC
  // ╚══════════════════════════════════════════════════════════════════════════

  var toRecipients = [];
  var ccRecipients = [];

  finalTier1.forEach(function(user) {
    var recipient = {
      userId:       user.userId,
      emailAddress: user.emailAddress,
      displayName:  user.displayName
    };
    // POCs → To:   they are accountable for the equipment
    // Non-POCs → CC:  ticket/log creators are interested parties, not owners
    if (user.isPOC) {
      toRecipients.push(recipient);
    } else {
      ccRecipients.push(recipient);
    }
  });

  // Tier 2 always CC — they opted in for awareness, not accountability
  finalTier2.forEach(function(user) {
    ccRecipients.push({
      userId:       user.userId,
      emailAddress: user.emailAddress,
      displayName:  user.displayName
    });
  });

  return { to: toRecipients, cc: ccRecipients };
}

module.exports = { resolve };
