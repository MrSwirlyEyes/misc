-- ============================================================
-- sp_emailSubscription_upsert
-- Inserts or updates a subscription record for a user.
-- Handles both:
--   isSubscribed = 1  opt-in  (Tier 2 subscriber, or re-subscribe
--                              after a previous opt-out)
--   isSubscribed = 0  opt-out (explicit unsubscribe at this scope)
--
-- RACE CONDITION SAFETY
-- ---------------------
-- Attempts INSERT first.  On unique constraint violation (a
-- concurrent call already inserted the row), falls through to
-- UPDATE instead.  No separate existence check — the unique
-- index is the authority.  This is safe under concurrent load
-- without requiring an explicit transaction around the upsert.
--
-- PARAMETERS
-- ----------
-- @userId         FK to dbo.webUser.userId
-- @emailTypeId    FK to dbo.emailType.emailTypeId
-- @scopeEntity    'equipment'|'room'|'building'|'location'|
--                 'program'|'manufacturingEquipmentType'
-- @scopeEntityId  PK of the scoped entity
-- @isSubscribed   1 = subscribe, 0 = unsubscribe/opt-out
--
-- RETURNS
-- -------
-- emailSubscriptionId   PK of the affected row
-- wasInserted           1 if a new row was created, 0 if updated
-- ============================================================

CREATE OR ALTER PROCEDURE dbo.sp_emailSubscription_upsert
    @userId        INT,
    @emailTypeId   INT,
    @scopeEntity   VARCHAR(50),
    @scopeEntityId INT,
    @isSubscribed  BIT
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @wasInserted BIT = 0;

    BEGIN TRY

        INSERT INTO dbo.emailSubscription (
            userId,
            emailTypeId,
            scopeEntity,
            scopeEntityId,
            isSubscribed
        )
        VALUES (
            @userId,
            @emailTypeId,
            @scopeEntity,
            @scopeEntityId,
            @isSubscribed
        );

        SET @wasInserted = 1;

    END TRY
    BEGIN CATCH

        IF ERROR_NUMBER() IN (2601, 2627)
        BEGIN
            -- Row already exists — update preference and timestamp only.
            UPDATE dbo.emailSubscription
            SET
                isSubscribed = @isSubscribed,
                updatedAt    = GETUTCDATE()
            WHERE userId        = @userId
              AND emailTypeId   = @emailTypeId
              AND scopeEntity   = @scopeEntity
              AND scopeEntityId = @scopeEntityId;
        END
        ELSE
        BEGIN
            THROW;
        END

    END CATCH

    -- Return the row regardless of whether it was inserted or updated.
    SELECT
        emailSubscriptionId,
        @wasInserted AS wasInserted
    FROM dbo.emailSubscription
    WHERE userId        = @userId
      AND emailTypeId   = @emailTypeId
      AND scopeEntity   = @scopeEntity
      AND scopeEntityId = @scopeEntityId;
END
GO
