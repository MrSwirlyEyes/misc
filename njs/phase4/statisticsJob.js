'use strict';

// ─── statisticsJob ────────────────────────────────────────────────────────────
// Stub — not yet active (emailType isActive=0 in the seed data).
//
// When implemented this module will export multiple job functions, one per
// report type, each scheduled independently from scheduler.js:
//
//   mtbfSummary()    → reporting.ticket.mtbf_summary
//   weeklyDigest()   → reporting.ticket.weekly_digest
//
// Unlike transactional ticket emails, statistical reports:
//   • Have no single ticket entity (entityId may be NULL or a synthetic ID)
//   • Are scoped to subscriptions at the program / location / category level
//   • Use a separate template builder (not yet written)
//   • May need a different recipient model (report_subscriptions) — see planning
//     notes in the design discussion

async function mtbfSummary(pool) {
  console.log('[statisticsJob] mtbfSummary — not yet implemented');
}

async function weeklyDigest(pool) {
  console.log('[statisticsJob] weeklyDigest — not yet implemented');
}

module.exports = { mtbfSummary, weeklyDigest };
