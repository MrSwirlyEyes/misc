-- ============================================================
-- sp_emailOutbox_markSent
-- Marks an outbox row as successfully delivered.
--
-- Called by the worker after BOTH of the following succeed:
--   1. dbo.sp_emailLog_insert   (audit record written)
--   2. nodemailer send confirmed (no SMTP error returned)
--
-- Write order matters: log first, then mark sent.  If the log
-- insert fails the row stays in 'processing', the worker's
-- error handler calls sp_emailOutbox_markFailed, and the next
-- retry attempt will re-send and re-log.  This guarantees that
-- every sent email has a log entry, at the cost of a possible
-- duplicate send on retry (which is acceptable given the low
-- failure rate of the log insert).
--
-- PARAMETERS
-- ----------
-- @emailOutboxId   PK of the outbox row to mark sent
--
-- RETURNS
-- -------
-- rowsAffected   Should always be 1; 0 indicates the row was
--                not found or was already in a terminal state
-- ============================================================

CREATE OR ALTER PROCEDURE dbo.sp_emailOutbox_markSent
    @emailOutboxId INT
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.emailOutbox
    SET
        status = 'sent',
        sentAt = GETUTCDATE()
    WHERE emailOutboxId = @emailOutboxId;

    SELECT @@ROWCOUNT AS rowsAffected;
END
GO
