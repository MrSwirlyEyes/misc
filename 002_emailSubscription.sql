-- ============================================================
-- emailSubscription
-- Tracks explicit opt-ins (isSubscribed = 1) and opt-outs
-- (isSubscribed = 0) per user, per email type, per scope.
--
-- TWO-TIER RECIPIENT MODEL
-- ------------------------
-- Tier 1 — Implicit recipients (always receive unless opted out):
--   equipment POCs (pocPrimaryId, pocSecondaryId, supeDayId,
--   supeNightId, resEngrId), ticket.userCreatedId, and all
--   unique ticketLog.userCreatedId contributors.
--   These users do NOT need a row here to receive emails.
--   A row with isSubscribed = 0 means they explicitly opted out.
--
-- Tier 2 — Explicit subscribers (opt-in required):
--   Any user with isSubscribed = 1 at any valid scope receives
--   emails for all equipment covered by that scope.
--
-- SCOPE SPECIFICITY (most → least specific)
-- ------------------------------------------
--   equipment  >  room  >  building  >  location
--   equipment  >  program
--   equipment  >  manufacturingEquipmentType
--
-- Most specific wins for conflicts.  A user with an
-- equipment-level subscription overrides a category-level
-- opt-out.  A user with an equipment-level opt-out is excluded
-- even if they have a broader location-level subscription.
--
-- VALID scopeEntity VALUES
-- ------------------------
--   'equipment'                  → manufacturingEquipment.equipmentId
--   'room'                       → room.roomId
--   'building'                   → building.buildingId
--   'location'                   → location.locationId
--   'program'                    → program.programId
--   'manufacturingEquipmentType' → manufacturingEquipmentType.typeId
-- ============================================================

IF NOT EXISTS (
    SELECT 1 FROM sys.tables
    WHERE  name      = 'emailSubscription'
    AND    schema_id = SCHEMA_ID('dbo')
)
BEGIN

    CREATE TABLE dbo.emailSubscription (
        emailSubscriptionId  INT          IDENTITY(1,1) NOT NULL,
        userId               INT                        NOT NULL,
        emailTypeId          INT                        NOT NULL,
        scopeEntity          VARCHAR(50)                NOT NULL,
        scopeEntityId        INT                        NOT NULL,
        isSubscribed         BIT                        NOT NULL  CONSTRAINT DF_emailSubscription_isSubscribed DEFAULT 1,
        createdAt            DATETIME2(7)               NOT NULL  CONSTRAINT DF_emailSubscription_createdAt   DEFAULT GETUTCDATE(),
        updatedAt            DATETIME2(7)               NOT NULL  CONSTRAINT DF_emailSubscription_updatedAt   DEFAULT GETUTCDATE(),

        CONSTRAINT PK_emailSubscription        PRIMARY KEY CLUSTERED   (emailSubscriptionId),
        CONSTRAINT FK_emailSubscription_user   FOREIGN KEY (userId)      REFERENCES dbo.webUser(userId),
        CONSTRAINT FK_emailSubscription_type   FOREIGN KEY (emailTypeId) REFERENCES dbo.emailType(emailTypeId),
        CONSTRAINT UQ_emailSubscription        UNIQUE      NONCLUSTERED (userId, emailTypeId, scopeEntity, scopeEntityId),

        CONSTRAINT CHK_emailSubscription_scope CHECK (scopeEntity IN (
            'equipment',
            'room',
            'building',
            'location',
            'program',
            'manufacturingEquipmentType'
        ))
    );

    -- Outbound resolution: "who is subscribed or opted-out at this scope?"
    -- Used by recipientResolver when a ticket event fires.
    CREATE NONCLUSTERED INDEX IX_emailSubscription_scope
        ON  dbo.emailSubscription (emailTypeId, scopeEntity, scopeEntityId)
        INCLUDE (userId, isSubscribed);

    -- User preference lookup: "what is this user subscribed to or opted out of?"
    -- Used by the preferences/unsubscribe UI endpoint.
    CREATE NONCLUSTERED INDEX IX_emailSubscription_user
        ON  dbo.emailSubscription (userId, emailTypeId)
        INCLUDE (scopeEntity, scopeEntityId, isSubscribed);

    PRINT 'Created table: dbo.emailSubscription';
END
ELSE
BEGIN
    PRINT 'Table already exists, skipping: dbo.emailSubscription';
END
GO
