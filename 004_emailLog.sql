-- ============================================================
-- emailLog
-- Permanent audit record of every email successfully delivered.
-- Never deleted — this is the authoritative answer to:
--   "What did recipient X receive for ticket Y?"
--   "What was the exact HTML sent on date Z?"
--   "Which attempt number finally succeeded?"
--
-- Written by the worker immediately after nodemailer confirms
-- delivery, before marking the outbox row as 'sent'.  If the
-- log insert fails, the outbox row stays in 'processing' and
-- the worker's error handling marks it failed — ensuring the
-- log and outbox are always consistent.
--
-- recipients JSON structure:
--   {
--     "to": [{ "userId": 1, "emailAddress": "...", "name": "..." }],
--     "cc": [{ "userId": 2, "emailAddress": "...", "name": "..." }]
--   }
-- ============================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.tables
    WHERE  name      = 'emailLog'
    AND    schema_id = SCHEMA_ID('dbo')
)
BEGIN

    CREATE TABLE dbo.emailLog (
        emailLogId    INT           IDENTITY(1,1) NOT NULL,
        emailOutboxId INT                         NOT NULL,
        emailTypeId   INT                         NOT NULL,
        entityType    VARCHAR(50)                 NOT NULL,
        entityId      INT                         NOT NULL,
        recipients    NVARCHAR(MAX)               NOT NULL,   -- JSON: { to: [...], cc: [...] }
        subject       NVARCHAR(500)               NOT NULL,
        htmlBody      NVARCHAR(MAX)               NOT NULL,
        attemptNumber INT                         NOT NULL,
        sentAt        DATETIME2(7)                NOT NULL  CONSTRAINT DF_emailLog_sentAt DEFAULT GETUTCDATE(),

        CONSTRAINT PK_emailLog           PRIMARY KEY CLUSTERED (emailLogId),
        CONSTRAINT FK_emailLog_outbox    FOREIGN KEY (emailOutboxId) REFERENCES dbo.emailOutbox(emailOutboxId),
        CONSTRAINT FK_emailLog_emailType FOREIGN KEY (emailTypeId)   REFERENCES dbo.emailType(emailTypeId)
    );

    -- Audit: all emails sent for a given ticket (or other entity)
    CREATE NONCLUSTERED INDEX IX_emailLog_entity
        ON  dbo.emailLog (entityType, entityId)
        INCLUDE (emailLogId, emailTypeId, sentAt, subject);

    -- Audit: all delivery attempts for a given outbox row
    CREATE NONCLUSTERED INDEX IX_emailLog_outbox
        ON  dbo.emailLog (emailOutboxId)
        INCLUDE (sentAt, attemptNumber);

    PRINT 'Created table: dbo.emailLog';
END
ELSE
BEGIN
    PRINT 'Table already exists, skipping: dbo.emailLog';
END
GO
