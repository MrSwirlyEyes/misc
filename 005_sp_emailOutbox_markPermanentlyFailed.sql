-- ============================================================
-- sp_emailOutbox_markPermanentlyFailed
-- Manual DBA/admin override to permanently cancel an outbox row.
--
-- NOT called by the worker under normal operation — use
-- sp_emailOutbox_markFailed for standard failure handling.
-- This procedure exists for cases where a DBA needs to suppress
-- a stuck or unwanted send (e.g. bad recipient data discovered
-- after enqueue, or a test row that should never be sent).
--
-- SAFETY GUARD
-- ------------
-- Rows with status = 'sent' are never overridden — a delivered
-- email cannot be undelivered and its record should not change.
--
-- PARAMETERS
-- ----------
-- @emailOutboxId   PK of the outbox row to cancel
-- @errorMessage    Optional admin note appended to any existing
--                  errorMessage on the row
--
-- RETURNS
-- -------
-- rowsAffected   1 if updated, 0 if not found or already 'sent'
-- ============================================================

CREATE OR ALTER PROCEDURE dbo.sp_emailOutbox_markPermanentlyFailed
    @emailOutboxId INT,
    @errorMessage  NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    UPDATE dbo.emailOutbox
    SET
        status       = 'permanentlyFailed',
        errorMessage = CASE
            WHEN @errorMessage IS NULL THEN errorMessage
            WHEN errorMessage  IS NULL THEN @errorMessage
            ELSE errorMessage + ' | Admin: ' + @errorMessage
        END
    WHERE emailOutboxId = @emailOutboxId
      AND status       != 'sent';   -- never alter a successfully delivered row

    SELECT @@ROWCOUNT AS rowsAffected;
END
GO
