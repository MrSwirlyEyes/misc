-- ============================================================
-- sp_emailSubscription_delete
-- Removes subscription rows for a user.  Supports both targeted
-- deletion (one specific subscription) and bulk deletion
-- (the "unsubscribe from everything" / select-all scenario).
--
-- NULL WILDCARD BEHAVIOUR
-- -----------------------
-- NULL parameters act as wildcards — they match any value in
-- that column.  This drives the bulk-delete patterns below.
--
-- Pass only the parameters you need; leave the rest as NULL.
--
-- EXAMPLES
-- --------
-- 1. Delete one specific subscription:
--      EXEC dbo.sp_emailSubscription_delete
--           @userId = 1, @emailTypeId = 2,
--           @scopeEntity = 'equipment', @scopeEntityId = 42;
--
-- 2. Delete all ticket-type subscriptions for a user (all scopes):
--      EXEC dbo.sp_emailSubscription_delete
--           @userId = 1, @emailTypeId = 2;
--
-- 3. Delete all equipment-scope entries for a user across all types:
--      EXEC dbo.sp_emailSubscription_delete
--           @userId = 1, @scopeEntity = 'equipment';
--
-- 4. Delete ALL subscriptions for a user (full unsubscribe):
--      EXEC dbo.sp_emailSubscription_delete @userId = 1;
--
-- WARNING
-- -------
-- Do not pass @scopeEntityId without @scopeEntity — that
-- combination is semantically meaningless (entity ID 42 in
-- which scope?) and will delete more rows than intended.
--
-- PARAMETERS
-- ----------
-- @userId         Required.  Always scoped to a single user.
-- @emailTypeId    NULL = match all email types
-- @scopeEntity    NULL = match all scope entity types
-- @scopeEntityId  NULL = match all entity IDs within the scope
--
-- RETURNS
-- -------
-- rowsDeleted   Number of rows removed
-- ============================================================

CREATE OR ALTER PROCEDURE dbo.sp_emailSubscription_delete
    @userId        INT,
    @emailTypeId   INT         = NULL,
    @scopeEntity   VARCHAR(50) = NULL,
    @scopeEntityId INT         = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DELETE FROM dbo.emailSubscription
    WHERE userId        =  @userId
      AND (@emailTypeId   IS NULL OR emailTypeId   = @emailTypeId)
      AND (@scopeEntity   IS NULL OR scopeEntity   = @scopeEntity)
      AND (@scopeEntityId IS NULL OR scopeEntityId = @scopeEntityId);

    SELECT @@ROWCOUNT AS rowsDeleted;
END
GO
