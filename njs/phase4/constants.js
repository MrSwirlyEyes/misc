'use strict';

// ─── Email Type Keys ──────────────────────────────────────────────────────────
// Must match the typeKey values in dbo.emailType and the CHECK constraint
// in 001_emailType.sql.  When adding a new type, update both here and the
// schema migration template.

var EMAIL_TYPE = {
  TICKET_OPENED:    'ticket.ticket.opened',
  TICKET_UPDATED:   'ticket.ticket.updated',
  TICKET_CLOSED:    'ticket.ticket.closed',
  TICKET_REMINDER:  'ticket.ticket.reminder',    // not yet active
  REPORTING_MTBF:   'reporting.ticket.mtbf_summary',  // not yet active
  REPORTING_WEEKLY: 'reporting.ticket.weekly_digest'  // not yet active
};

// ─── Scope Entity Names ───────────────────────────────────────────────────────
// Must match the valid values in CHK_emailSubscription_scope.

var SCOPE_ENTITY = {
  EQUIPMENT:   'equipment',
  ROOM:        'room',
  BUILDING:    'building',
  LOCATION:    'location',
  PROGRAM:     'program',
  EQUIP_TYPE:  'manufacturingEquipmentType'
};

// ─── Scope Specificity ────────────────────────────────────────────────────────
// Used by recipientResolver to resolve conflicts between a subscription at one
// scope and an opt-out at another.  Higher score = more specific = wins.
//
// equipment                              (10) — always beats everything
// room → building → location hierarchy  (4 → 3 → 2)
// program, manufacturingEquipmentType   (2)  — peers with location

var SCOPE_SPECIFICITY = {
  equipment:                  10,
  room:                        4,
  building:                    3,
  location:                    2,
  program:                     2,
  manufacturingEquipmentType:  2
};

// ─── Outbox Status Values ─────────────────────────────────────────────────────
// Must match the CHECK constraint values in 003_emailOutbox.sql.

var OUTBOX_STATUS = {
  PENDING:            'pending',
  PROCESSING:         'processing',
  SENT:               'sent',
  FAILED:             'failed',
  PERMANENTLY_FAILED: 'permanentlyFailed',
  CANCELLED:          'cancelled'
};

// ─── Entity Types ─────────────────────────────────────────────────────────────
// Extend this list (and the CHECK constraint) as new entity types are added.

var ENTITY_TYPE = {
  TICKET: 'ticket'
};

// ─── Mailer ───────────────────────────────────────────────────────────────────
// LOGO_CID is used in two places:
//   shell.js   → img src="cid:orglogo@ticket" in the HTML
//   sender.js  → nodemailer attachment cid field
// Keeping it here ensures they never drift out of sync.

var MAILER = {
  LOGO_CID:    'orglogo@ticket'
};

// ─── Worker Tuning ────────────────────────────────────────────────────────────
// POLL_INTERVAL_MS  How frequently the outbox is polled for pending rows.
//                   10 seconds gives near-immediate delivery at low volume.
// BATCH_SIZE        Max rows claimed per poll cycle.  10 is conservative —
//                   at 50-100 ticket events/day the queue will rarely hold
//                   more than a handful of pending rows at once.
// MAX_ATTEMPTS      Default retry ceiling.  Matched by DF_emailOutbox_maxAttempts.
// BACKOFF_SECONDS   Delay before each retry attempt (indexed by attemptCount
//                   at the time of failure, 1-based).  Mirrors the CASE
//                   expression in sp_emailOutbox_markFailed.

var WORKER = {
  POLL_INTERVAL_MS: 10 * 1000,   // 10 seconds
  BATCH_SIZE:       10,
  MAX_ATTEMPTS:     3,
  BACKOFF_SECONDS:  [0, 30, 300]  // attempt 1→30s, attempt 2→5min
};

module.exports = {
  EMAIL_TYPE,
  SCOPE_ENTITY,
  SCOPE_SPECIFICITY,
  OUTBOX_STATUS,
  ENTITY_TYPE,
  MAILER,
  WORKER
};
