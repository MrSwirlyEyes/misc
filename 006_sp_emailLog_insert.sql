-- ============================================================
-- sp_emailLog_insert
-- Writes a permanent audit record for a successfully delivered
-- email.  Called by the worker immediately after nodemailer
-- confirms delivery, before sp_emailOutbox_markSent.
--
-- The htmlBody column stores the exact rendered HTML that was
-- sent, enabling "what did they receive?" audit queries without
-- any template re-rendering.
--
-- PARAMETERS
-- ----------
-- @emailOutboxId   FK to the outbox row that was processed
-- @emailTypeId     FK to emailType (denormalised for query convenience
--                  — avoids joining through emailOutbox on every audit)
-- @entityType      'ticket' (matches emailOutbox.entityType)
-- @entityId        ticketId (matches emailOutbox.entityId)
-- @recipients      JSON: { "to": [...], "cc": [...] }
--                  Each element: { userId, emailAddress, name }
-- @subject         Exact subject line sent
-- @htmlBody        Exact HTML body sent (full rendered email)
-- @attemptNumber   The value of emailOutbox.attemptCount at send
--                  time — tells you which attempt finally succeeded
--
-- RETURNS
-- -------
-- emailLogId   IDENTITY of the inserted audit row
-- ============================================================

CREATE OR ALTER PROCEDURE dbo.sp_emailLog_insert
    @emailOutboxId INT,
    @emailTypeId   INT,
    @entityType    VARCHAR(50),
    @entityId      INT,
    @recipients    NVARCHAR(MAX),
    @subject       NVARCHAR(500),
    @htmlBody      NVARCHAR(MAX),
    @attemptNumber INT
AS
BEGIN
    SET NOCOUNT ON;

    INSERT INTO dbo.emailLog (
        emailOutboxId,
        emailTypeId,
        entityType,
        entityId,
        recipients,
        subject,
        htmlBody,
        attemptNumber
    )
    VALUES (
        @emailOutboxId,
        @emailTypeId,
        @entityType,
        @entityId,
        @recipients,
        @subject,
        @htmlBody,
        @attemptNumber
    );

    SELECT SCOPE_IDENTITY() AS emailLogId;
END
GO
