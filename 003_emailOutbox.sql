-- ============================================================
-- emailOutbox
-- Job queue for all outbound emails.  Rows are inserted by the
-- main API process (transactionally with the ticket write) and
-- consumed by the email worker process.
--
-- WORKER FLOW
-- -----------
--   sp_emailOutbox_enqueue     → INSERT by API (status = 'pending')
--   sp_emailOutbox_claimBatch  → atomic UPDATE to 'processing', returns rows
--   sp_emailOutbox_markSent    → UPDATE to 'sent' after confirmed delivery
--   sp_emailOutbox_markFailed  → UPDATE to 'failed' (or 'permanentlyFailed'
--                                when attemptCount >= maxAttempts)
--
-- DUPLICATE PREVENTION
-- --------------------
-- SQL Server treats two NULL values as distinct in a standard
-- unique index — so a conventional UNIQUE constraint on
-- (emailTypeId, entityType, entityId, eventSourceId) would allow
-- multiple rows with eventSourceId = NULL (i.e. multiple 'opened'
-- emails for the same ticket).
--
-- The fix is two filtered unique indexes:
--   UQ_emailOutbox_withSource  — for update/close events
--                                (eventSourceId IS NOT NULL)
--   UQ_emailOutbox_noSource    — for opened events
--                                (eventSourceId IS NULL)
--
-- PAYLOAD
-- -------
-- JSON snapshot captured at enqueue time:
--   {
--     "to":  [{ "userId": 1, "emailAddress": "...", "name": "..." }, ...],
--     "cc":  [{ "userId": 2, "emailAddress": "...", "name": "..." }, ...],
--     "templateData": { ... }   // full ticket + equipment data
--   }
-- Snapshots ensure retries send to the same recipients with the
-- same data even if the underlying records change between enqueue
-- and delivery.
-- ============================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.tables
    WHERE  name      = 'emailOutbox'
    AND    schema_id = SCHEMA_ID('dbo')
)
BEGIN

    CREATE TABLE dbo.emailOutbox (
        emailOutboxId   INT           IDENTITY(1,1) NOT NULL,
        emailTypeId     INT                         NOT NULL,
        entityType      VARCHAR(50)                 NOT NULL,
        entityId        INT                         NOT NULL,
        eventSourceId   INT                             NULL,   -- ticketLogId for updated/closed; NULL for opened
        status          VARCHAR(25)                 NOT NULL  CONSTRAINT DF_emailOutbox_status        DEFAULT 'pending',
        payload         NVARCHAR(MAX)                   NULL,
        attemptCount    INT                         NOT NULL  CONSTRAINT DF_emailOutbox_attemptCount  DEFAULT 0,
        maxAttempts     INT                         NOT NULL  CONSTRAINT DF_emailOutbox_maxAttempts   DEFAULT 3,
        lastAttemptedAt DATETIME2(7)                    NULL,
        nextAttemptAt   DATETIME2(7)                NOT NULL  CONSTRAINT DF_emailOutbox_nextAttemptAt DEFAULT GETUTCDATE(),
        errorMessage    NVARCHAR(MAX)                   NULL,
        createdAt       DATETIME2(7)                NOT NULL  CONSTRAINT DF_emailOutbox_createdAt     DEFAULT GETUTCDATE(),
        sentAt          DATETIME2(7)                    NULL,

        CONSTRAINT PK_emailOutbox            PRIMARY KEY CLUSTERED (emailOutboxId),
        CONSTRAINT FK_emailOutbox_emailType  FOREIGN KEY (emailTypeId) REFERENCES dbo.emailType(emailTypeId),

        CONSTRAINT CHK_emailOutbox_status CHECK (status IN (
            'pending',
            'processing',
            'sent',
            'failed',
            'permanentlyFailed',
            'cancelled'
        )),

        -- Extend this list as new entity types are added (e.g. 'maintenanceRequest')
        CONSTRAINT CHK_emailOutbox_entityType CHECK (entityType IN (
            'ticket'
        ))
    );

    -- Duplicate prevention: update/close events (real ticketLogId as source)
    CREATE UNIQUE NONCLUSTERED INDEX UQ_emailOutbox_withSource
        ON  dbo.emailOutbox (emailTypeId, entityType, entityId, eventSourceId)
        WHERE eventSourceId IS NOT NULL;

    -- Duplicate prevention: opened events (no ticketLog exists yet)
    -- One pending/sent row allowed per ticket per emailType.
    CREATE UNIQUE NONCLUSTERED INDEX UQ_emailOutbox_noSource
        ON  dbo.emailOutbox (emailTypeId, entityType, entityId)
        WHERE eventSourceId IS NULL;

    -- Worker polling index: pending rows and retryable failed rows
    -- ordered by nextAttemptAt.  Filtered to avoid scanning sent/cancelled rows.
    CREATE NONCLUSTERED INDEX IX_emailOutbox_worker
        ON  dbo.emailOutbox (status, nextAttemptAt)
        INCLUDE (
            emailOutboxId,
            emailTypeId,
            entityType,
            entityId,
            eventSourceId,
            payload,
            attemptCount,
            maxAttempts
        )
        WHERE status IN ('pending', 'failed');

    PRINT 'Created table: dbo.emailOutbox';
END
ELSE
BEGIN
    PRINT 'Table already exists, skipping: dbo.emailOutbox';
END
GO
