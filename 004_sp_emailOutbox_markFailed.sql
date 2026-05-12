-- ============================================================
-- sp_emailOutbox_markFailed
-- Marks an outbox row as failed after an unsuccessful send
-- attempt and schedules the next retry using exponential backoff.
--
-- Automatically promotes to 'permanentlyFailed' when
-- attemptCount >= maxAttempts so the worker stops retrying
-- without any additional application logic.
--
-- BACKOFF SCHEDULE
-- ----------------
-- attemptCount at time of failure → nextAttemptAt delay
--   1  →  30 seconds
--   2  →  5 minutes
--   3+ →  permanently failed (maxAttempts default is 3)
--
-- The backoff is intentionally modest — these are operational
-- notifications for internal staff, not transactional emails
-- for end customers.  Adjust the CASE values in constants if
-- your environment warrants longer delays.
--
-- NOTE: attemptCount is incremented by sp_emailOutbox_claimBatch
-- at claim time, so by the time this procedure is called the
-- count already reflects the attempt that just failed.
--
-- PARAMETERS
-- ----------
-- @emailOutboxId   PK of the outbox row that failed
-- @errorMessage    SMTP error text or exception message
--
-- RETURNS
-- -------
-- newStatus   The status actually written: 'failed' or
--             'permanentlyFailed'.  The worker uses this to
--             decide whether to raise an alert.
-- ============================================================

CREATE OR ALTER PROCEDURE dbo.sp_emailOutbox_markFailed
    @emailOutboxId INT,
    @errorMessage  NVARCHAR(MAX)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @attemptCount  INT;
    DECLARE @maxAttempts   INT;
    DECLARE @newStatus     VARCHAR(25);
    DECLARE @nextAttemptAt DATETIME2(7);

    SELECT
        @attemptCount = attemptCount,
        @maxAttempts  = maxAttempts
    FROM dbo.emailOutbox
    WHERE emailOutboxId = @emailOutboxId;

    IF @attemptCount IS NULL
    BEGIN
        -- Row not found — nothing to update, return null status.
        SELECT NULL AS newStatus;
        RETURN;
    END

    IF @attemptCount >= @maxAttempts
    BEGIN
        SET @newStatus     = 'permanentlyFailed';
        SET @nextAttemptAt = NULL;  -- no further retries; leave existing value unchanged
    END
    ELSE
    BEGIN
        SET @newStatus = 'failed';
        SET @nextAttemptAt = CASE @attemptCount
            WHEN 1 THEN DATEADD(SECOND, 30,  GETUTCDATE())   -- first failure  → 30 second wait
            WHEN 2 THEN DATEADD(MINUTE, 5,   GETUTCDATE())   -- second failure → 5 minute wait
            ELSE        DATEADD(MINUTE, 30,  GETUTCDATE())   -- further (should not reach here
        END;                                                  -- given default maxAttempts = 3)
    END

    UPDATE dbo.emailOutbox
    SET
        status        = @newStatus,
        errorMessage  = @errorMessage,
        -- Only overwrite nextAttemptAt when there is a new retry scheduled.
        -- ISNULL preserves the existing value for permanentlyFailed rows.
        nextAttemptAt = ISNULL(@nextAttemptAt, nextAttemptAt)
    WHERE emailOutboxId = @emailOutboxId;

    SELECT @newStatus AS newStatus;
END
GO
