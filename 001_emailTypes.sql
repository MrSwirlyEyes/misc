-- ============================================================
-- 001_emailTypes.sql  —  Seed data for dbo.emailType
--
-- Run once by DBA after the table DDL has been applied.
-- Safe to re-run — each INSERT is guarded by an existence check
-- on typeKey, so already-seeded rows are silently skipped.
--
-- isActive = 0 for types not yet implemented in the worker.
-- When a type goes live, update the row:
--   UPDATE dbo.emailType SET isActive = 1
--   WHERE typeKey = 'ticket.ticket.reminder';
-- ============================================================

-- ── Active types (worker implementation complete) ──────────

IF NOT EXISTS (SELECT 1 FROM dbo.emailType WHERE typeKey = 'ticket.ticket.opened')
    INSERT INTO dbo.emailType (typeKey, description, isActive)
    VALUES (
        'ticket.ticket.opened',
        'Sent when a new maintenance ticket is opened against a piece of equipment.',
        1
    );

IF NOT EXISTS (SELECT 1 FROM dbo.emailType WHERE typeKey = 'ticket.ticket.updated')
    INSERT INTO dbo.emailType (typeKey, description, isActive)
    VALUES (
        'ticket.ticket.updated',
        'Sent when a log entry or update is added to an open maintenance ticket.',
        1
    );

IF NOT EXISTS (SELECT 1 FROM dbo.emailType WHERE typeKey = 'ticket.ticket.closed')
    INSERT INTO dbo.emailType (typeKey, description, isActive)
    VALUES (
        'ticket.ticket.closed',
        'Sent when a maintenance ticket is closed and the equipment is returned to service.',
        1
    );

-- ── Inactive stubs (not yet implemented — isActive = 0) ────

IF NOT EXISTS (SELECT 1 FROM dbo.emailType WHERE typeKey = 'ticket.ticket.reminder')
    INSERT INTO dbo.emailType (typeKey, description, isActive)
    VALUES (
        'ticket.ticket.reminder',
        'Weekly reminder sent for tickets that remain open past their expected close date.',
        0
    );

IF NOT EXISTS (SELECT 1 FROM dbo.emailType WHERE typeKey = 'reporting.ticket.mtbf_summary')
    INSERT INTO dbo.emailType (typeKey, description, isActive)
    VALUES (
        'reporting.ticket.mtbf_summary',
        'Periodic report aggregating Mean Time Between Failures across equipment and categories.',
        0
    );

IF NOT EXISTS (SELECT 1 FROM dbo.emailType WHERE typeKey = 'reporting.ticket.weekly_digest')
    INSERT INTO dbo.emailType (typeKey, description, isActive)
    VALUES (
        'reporting.ticket.weekly_digest',
        'Weekly digest summarising ticket activity, open counts, resolution rates, and trends.',
        0
    );

GO

-- ── Verification query (review output after running) ───────
SELECT
    emailTypeId,
    typeKey,
    isActive,
    createdAt,
    description
FROM dbo.emailType
ORDER BY emailTypeId;
GO
