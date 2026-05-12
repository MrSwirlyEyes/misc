-- ============================================================
-- sp_emailOutbox_enqueue
-- Inserts a new row into emailOutbox.
--
-- Called by the main API process inside the same transaction as
-- the ticket write (open/update/close).  If the transaction rolls
-- back, this insert rolls back with it — the outbox row and the
-- business event are always in sync.
--
-- DUPLICATE HANDLING
-- ------------------
-- On unique constraint violation (error 2601 or 2627), the event
-- was already enqueued by a concurrent call.  This is not an error
-- — the procedure returns wasInserted = 0 silently so the caller
-- can proceed without special-casing.
--
-- PARAMETERS
-- ----------
-- @emailTypeId    FK to dbo.emailType.emailTypeId
-- @entityType     Entity domain, e.g. 'ticket'
-- @entityId       PK of the entity, e.g. ticketId
-- @eventSourceId  ticketLogId for updated/closed events;
--                 NULL for opened (no log entry exists yet)
-- @payload        JSON string — recipient list + template data
--                 snapshot captured at enqueue time
--
-- RETURNS
-- -------
-- emailOutboxId   IDENTITY of the inserted row; NULL if already existed
-- wasInserted     1 if a new row was inserted, 0 if it already existed
-- ============================================================

CREATE OR ALTER PROCEDURE dbo.sp_emailOutbox_enqueue
    @emailTypeId    INT,
    @entityType     VARCHAR(50),
    @entityId       INT,
    @eventSourceId  INT           = NULL,
    @payload        NVARCHAR(MAX) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY

        INSERT INTO dbo.emailOutbox (
            emailTypeId,
            entityType,
            entityId,
            eventSourceId,
            payload
        )
        VALUES (
            @emailTypeId,
            @entityType,
            @entityId,
            @eventSourceId,
            @payload
        );

        SELECT
            SCOPE_IDENTITY() AS emailOutboxId,
            CAST(1 AS BIT)   AS wasInserted;

    END TRY
    BEGIN CATCH

        -- Unique constraint violation: this event is already enqueued.
        -- Return gracefully — the worker will handle the existing row.
        IF ERROR_NUMBER() IN (2601, 2627)
        BEGIN
            SELECT
                NULL           AS emailOutboxId,
                CAST(0 AS BIT) AS wasInserted;
            RETURN;
        END

        -- Any other error is unexpected — re-raise to the caller so
        -- the enclosing transaction is rolled back correctly.
        THROW;

    END CATCH
END
GO
