'use strict';

// ─── reminderJob ──────────────────────────────────────────────────────────────
// Stub — not yet active (emailType isActive=0 in the seed data).
//
// When implemented this job will:
//   1. Query dbo.ticket for open tickets past their expectedCloseDate
//   2. For each, call enqueue() with eventType = EMAIL_TYPE.TICKET_REMINDER
//      (no eventSourceId — this is a time-triggered, not event-triggered, send)
//   3. The worker picks up the outbox rows and sends the reminder emails
//
// Scheduled: every Monday at 08:00 local time (see jobs/scheduler.js)
//
// DUPLICATE PREVENTION NOTE
// ─────────────────────────
// The UQ_emailOutbox_noSource index prevents enqueueing more than one pending/
// sent reminder per ticket per emailTypeId at a time.  Once the previous week's
// reminder row reaches 'sent', a new one can be inserted the following Monday.
// The unique constraint naturally produces one-per-week behaviour without any
// application-level date arithmetic.

async function run(pool) {
  console.log('[reminderJob] Run at', new Date().toISOString(), '— not yet implemented');

  // Implementation outline (uncomment and complete when ready):
  //
  // var sql      = require('mssql/msnodesqlv8');
  // var enqueueService = require('../services/enqueue');
  // var EMAIL_TYPE     = require('../config/constants').EMAIL_TYPE;
  //
  // var request = new sql.Request(pool);
  // var result  = await request.query(`
  //   SELECT
  //       t.ticketId,
  //       t.equipmentId,
  //       -- include all fields needed by buildTicketReminderEmail template
  //       ...
  //   FROM  dbo.ticket t
  //   WHERE t.statusId != <closed_status_id>    -- adjust to your schema
  //     AND t.expectedCloseDate < GETUTCDATE()
  // `);
  //
  // for (var row of result.recordset) {
  //   try {
  //     await enqueueService.enqueue(pool, pool, {  // pool twice = no TX needed
  //       eventType:     EMAIL_TYPE.TICKET_REMINDER,
  //       ticketId:      row.ticketId,
  //       eventSourceId: null,
  //       equipmentId:   row.equipmentId,
  //       templateData:  row
  //     });
  //   } catch (err) {
  //     console.error('[reminderJob] Failed to enqueue ticketId=' + row.ticketId, err.message);
  //   }
  // }
  //
  // console.log('[reminderJob] Enqueued reminders for', result.recordset.length, 'ticket(s)');
}

module.exports = { run };
