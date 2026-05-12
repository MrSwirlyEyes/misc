'use strict';

var path                  = require('path');
var transport             = require('../config/mailer');
var constants             = require('../config/constants');
var emailLogQueries       = require('../db/queries/emailLog');
var emailOutboxQueries    = require('../db/queries/emailOutbox');
var templates             = require('../templates');

var EMAIL_TYPE = constants.EMAIL_TYPE;

// Logo: /assets/logo/logo.png from the project root.
// Adjust the relative path if your folder structure differs.
var LOGO_PATH = path.resolve(__dirname, '../../../assets/logo/logo.png');
var LOGO_CID  = 'orglogo@ticket';

// ─── Template Dispatcher ──────────────────────────────────────────────────────
// Maps each active typeKey to:
//   buildHtml(templateData)     → full rendered HTML string
//   buildSubject(templateData)  → email subject line
//
// When a new email type is implemented:
//   1. Add a builder in /templates/
//   2. Export it from /templates/index.js
//   3. Add an entry to TEMPLATE_MAP below

var TEMPLATE_MAP = {};

TEMPLATE_MAP[EMAIL_TYPE.TICKET_OPENED] = {
  buildHtml: function(data) {
    return templates.buildTicketOpenedEmail(data);
  },
  buildSubject: function(data) {
    return '[Ticket #' + data.ticketNumber + '] Opened \u2013 ' + data.equipmentName;
  }
};

TEMPLATE_MAP[EMAIL_TYPE.TICKET_UPDATED] = {
  buildHtml: function(data) {
    return templates.buildTicketUpdatedEmail(data);
  },
  buildSubject: function(data) {
    return '[Ticket #' + data.ticketNumber + '] Updated \u2013 ' + data.equipmentName;
  }
};

TEMPLATE_MAP[EMAIL_TYPE.TICKET_CLOSED] = {
  buildHtml: function(data) {
    return templates.buildTicketClosedEmail(data);
  },
  buildSubject: function(data) {
    return '[Ticket #' + data.ticketNumber + '] Closed \u2013 ' + data.equipmentName;
  }
};

// ─── formatAddresses ─────────────────────────────────────────────────────────
// Converts a recipient array to a nodemailer-ready comma-separated string.
// Filters out any entries that lost their email address since enqueue time
// (e.g. user deactivated).  Defensive — the resolver already filters these.

function formatAddresses(recipients) {
  return recipients
    .filter(function(r) { return r && r.emailAddress; })
    .map(function(r) {
      // Produces: "Display Name <address@org.com>" when displayName is set,
      // otherwise just the bare address.
      return r.displayName && r.displayName !== r.emailAddress
        ? '"' + r.displayName.replace(/"/g, '') + '" <' + r.emailAddress + '>'
        : r.emailAddress;
    })
    .join(', ');
}

// ─── send ─────────────────────────────────────────────────────────────────────
// Processes one claimed outbox row end-to-end.
//
// WRITE ORDER — order is critical for consistency:
//   1. transport.sendMail()   If this fails, nothing is written to the DB.
//   2. emailLog.insert()      Audit record — write before marking sent.
//   3. emailOutbox.markSent() Terminal state — only after log is confirmed.
//
// If step 2 or 3 fails after a successful SMTP delivery, the row goes to
// 'failed' and will retry.  The retry will re-deliver the email (acceptable
// duplicate) and re-attempt the log write.  Probability of this scenario is
// very low (simple INSERT on a healthy DB), and a duplicate notification is
// far better than a missing audit record.
//
// PERMANENT FAILURES (no retry):
//   - Corrupt/unparseable payload JSON
//   - Unknown typeKey with no registered template
//   - No valid addresses in payload after deactivation filtering
//
// @param  {sql.ConnectionPool} pool
// @param  {object} outboxRow   A row returned by sp_emailOutbox_claimBatch
//   Required fields: emailOutboxId, emailTypeId, entityType, entityId,
//                    payload, attemptCount

async function send(pool, outboxRow) {

  // ── Parse payload ──────────────────────────────────────────────────────────

  var payload;
  try {
    payload = JSON.parse(outboxRow.payload);
  } catch (parseErr) {
    // Corrupt payload — will never succeed on retry, mark permanently failed.
    await _safeMarkPermanentlyFailed(
      pool,
      outboxRow.emailOutboxId,
      'Payload JSON parse error: ' + parseErr.message
    );
    throw new Error(
      '[sender] Corrupt payload for outboxId ' + outboxRow.emailOutboxId +
      ': ' + parseErr.message
    );
  }

  var typeKey      = payload.typeKey;
  var to           = Array.isArray(payload.to)  ? payload.to  : [];
  var cc           = Array.isArray(payload.cc)  ? payload.cc  : [];
  var templateData = payload.templateData || {};

  // ── Dispatch to template ───────────────────────────────────────────────────

  var template = TEMPLATE_MAP[typeKey];
  if (!template) {
    await _safeMarkPermanentlyFailed(
      pool,
      outboxRow.emailOutboxId,
      'No template registered for typeKey: ' + typeKey
    );
    throw new Error('[sender] No template registered for typeKey: ' + typeKey);
  }

  var htmlBody = template.buildHtml(templateData);
  var subject  = template.buildSubject(templateData);

  // ── Format recipient address strings ───────────────────────────────────────

  var toStr = formatAddresses(to);
  var ccStr = formatAddresses(cc);

  if (!toStr && !ccStr) {
    // All addresses became invalid since enqueue (accounts deactivated etc.)
    await _safeMarkPermanentlyFailed(
      pool,
      outboxRow.emailOutboxId,
      'No valid email addresses remain in payload — all recipients may have ' +
      'been deactivated since this row was enqueued.'
    );
    return;
  }

  // ── Build mail options ─────────────────────────────────────────────────────

  var mailOptions = {
    // SMTP_FROM format: '"Maintenance System" <maintenance@yourorg.com>'
    from:    process.env.SMTP_FROM,
    subject: subject,
    html:    htmlBody,
    attachments: [{
      filename:    'logo.png',
      path:        LOGO_PATH,
      cid:         LOGO_CID
    }],
    headers: {
      // List-Unsubscribe: surfaces a manage-preferences button in Outlook 365,
      // Gmail, and Apple Mail.  Points to the equipment preferences page —
      // SSO provides identity, no token signing required.
      'List-Unsubscribe':
        '<' + (process.env.APP_URL || '') +
        '/notification-preferences?equipment_id=' +
        (templateData.equipmentId || '') + '>',
      // RFC 8058: allows one-click unsubscribe from mail clients that support it.
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    }
  };

  if (toStr) mailOptions.to = toStr;
  if (ccStr) mailOptions.cc = ccStr;

  // ── 1. Send ────────────────────────────────────────────────────────────────

  try {
    await transport.sendMail(mailOptions);
  } catch (smtpErr) {
    // SMTP failure — markFailed will schedule a retry or promote to
    // permanentlyFailed when attemptCount >= maxAttempts.
    await emailOutboxQueries.markFailed(
      pool,
      outboxRow.emailOutboxId,
      smtpErr.message
    );
    throw smtpErr;  // let the worker log this and move to the next row
  }

  // ── 2. Write audit log ─────────────────────────────────────────────────────

  try {
    await emailLogQueries.insert(pool, {
      emailOutboxId: outboxRow.emailOutboxId,
      emailTypeId:   outboxRow.emailTypeId,
      entityType:    outboxRow.entityType,
      entityId:      outboxRow.entityId,
      recipients:    JSON.stringify({ to: to, cc: cc }),
      subject:       subject,
      htmlBody:      htmlBody,
      attemptNumber: outboxRow.attemptCount
    });
  } catch (logErr) {
    // Email delivered but log write failed.  Mark failed so the worker
    // retries — the retry will re-send (acceptable) and re-attempt the log.
    await emailOutboxQueries.markFailed(
      pool,
      outboxRow.emailOutboxId,
      'Email delivered but audit log insert failed: ' + logErr.message
    );
    throw logErr;
  }

  // ── 3. Mark sent ───────────────────────────────────────────────────────────

  try {
    await emailOutboxQueries.markSent(pool, outboxRow.emailOutboxId);
  } catch (markErr) {
    // Both delivery and logging succeeded.  The row is stuck in 'processing'
    // and will be re-claimed on next worker startup, causing a duplicate send.
    // Log prominently but do not rethrow — the email job succeeded, the DB
    // housekeeping did not.  A DBA can manually mark it sent if needed.
    console.error(
      '[sender] ATTENTION: markSent failed for emailOutboxId ' +
      outboxRow.emailOutboxId + ' — email was delivered and logged successfully. ' +
      'The outbox row is stuck in "processing". ' +
      'Error: ' + markErr.message
    );
  }
}

// ─── _safeMarkPermanentlyFailed ────────────────────────────────────────────
// Internal helper — wraps markPermanentlyFailed so errors inside the error
// path do not obscure the original failure.

async function _safeMarkPermanentlyFailed(pool, emailOutboxId, reason) {
  try {
    await emailOutboxQueries.markPermanentlyFailed(pool, emailOutboxId, reason);
  } catch (markErr) {
    console.error(
      '[sender] markPermanentlyFailed itself failed for outboxId ' +
      emailOutboxId + ': ' + markErr.message
    );
  }
}

module.exports = { send };
