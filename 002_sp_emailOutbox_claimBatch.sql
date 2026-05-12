-- ============================================================
-- sp_emailOutbox_claimBatch
-- Atomically claims a batch of outbox rows for processing by
-- the email worker.
--
-- ATOMIC CLAIM PATTERN
-- --------------------
-- A single UPDATE...OUTPUT statement both transitions the rows
-- to status = 'processing' and returns them to the caller.
-- Because this is one statement rather than SELECT then UPDATE,
-- no row can be claimed by two workers simultaneously — even if
-- multiple email-service processes run concurrently.
--
-- UPDLOCK  prevents other transactions reading these rows with
--          the intent to update them (upgrade deadlock prevention).
-- ROWLOCK  confines locking to the row level, minimising blocking
--          on the rest of the table during the claim.
--
-- The procedure also increments attemptCount and sets
-- lastAttemptedAt here rather than in markFailed, so the count
-- is accurate the moment the worker starts processing.
--
-- RETRY ELIGIBILITY
-- -----------------
-- Rows with status = 'failed' are retried by the same polling
-- loop once their nextAttemptAt is in the past.  The backoff
-- schedule is set by sp_emailOutbox_markFailed.
--
-- PARAMETERS
-- ----------
-- @batchSize   Max rows to claim per poll cycle (default 10).
--              Tune based on SMTP throughput and poll interval.
--
-- RETURNS
-- -------
-- Resultset of claimed rows (0 rows if nothing is ready).
-- Columns: emailOutboxId, emailTypeId, entityType, entityId,
--          eventSourceId, payload, attemptCount, maxAttempts
-- ============================================================

CREATE OR ALTER PROCEDURE dbo.sp_emailOutbox_claimBatch
    @batchSize INT = 10
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE TOP (@batchSize) dbo.emailOutbox WITH (UPDLOCK, ROWLOCK)
    SET
        status          = 'processing',
        lastAttemptedAt = GETUTCDATE(),
        attemptCount    = attemptCount + 1
    OUTPUT
        INSERTED.emailOutboxId,
        INSERTED.emailTypeId,
        INSERTED.entityType,
        INSERTED.entityId,
        INSERTED.eventSourceId,
        INSERTED.payload,
        INSERTED.attemptCount,
        INSERTED.maxAttempts
    WHERE status       IN ('pending', 'failed')
      AND nextAttemptAt <= GETUTCDATE();

END
GO
