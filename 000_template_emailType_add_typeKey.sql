-- ============================================================
-- MIGRATION: Add new typeKey value(s) to emailType
--
-- COPY THIS FILE and rename it with the next sequence number
-- and a description, e.g.:
--   002_emailType_add_maintenance_reminder.sql
--
-- CHECKLIST — complete all four steps before running:
--   [ ] 1. Update CHK_emailType_typeKey below with the new value(s)
--   [ ] 2. Add the new row(s) to /schema/seed/001_emailTypes.sql
--          (keep the seed file the authoritative full list)
--   [ ] 3. Add the new constant to /config/constants.js in the app
--   [ ] 4. Implement the worker handler for the new type
--
-- Safe to re-run: existence checks guard every step.
-- Run in a transaction so a partial failure leaves nothing behind.
-- ============================================================

BEGIN TRANSACTION;

BEGIN TRY

    -- ── Step 1: Drop the existing check constraint ────────────
    -- The constraint name is fixed — do not rename it on re-add.

    IF EXISTS (
        SELECT 1 FROM sys.check_constraints
        WHERE  name      = 'CHK_emailType_typeKey'
        AND    parent_object_id = OBJECT_ID('dbo.emailType')
    )
    BEGIN
        ALTER TABLE dbo.emailType
            DROP CONSTRAINT CHK_emailType_typeKey;

        PRINT 'Dropped constraint: CHK_emailType_typeKey';
    END
    ELSE
    BEGIN
        PRINT 'Constraint not found, skipping drop: CHK_emailType_typeKey';
    END


    -- ── Step 2: Re-add the constraint with the full updated list ──
    --
    -- IMPORTANT: copy the COMPLETE list from the previous version
    -- of this constraint and ADD your new value(s).  Do not remove
    -- existing values — rows already in the table must still satisfy
    -- the constraint or the ALTER TABLE will fail.
    --
    -- ↓↓↓  ADD YOUR NEW typeKey VALUE(S) TO THIS LIST  ↓↓↓

    ALTER TABLE dbo.emailType
        ADD CONSTRAINT CHK_emailType_typeKey CHECK (typeKey IN (

            -- ── Existing values — do not remove ──────────────
            'ticket.ticket.opened',
            'ticket.ticket.updated',
            'ticket.ticket.closed',
            'ticket.ticket.reminder',
            'reporting.ticket.mtbf_summary',
            'reporting.ticket.weekly_digest'

            -- ── New value(s) added by this migration ─────────
            -- EXAMPLE (uncomment and replace with your real value):
            -- ,'maintenance.equipment.scheduled'

        ));

    PRINT 'Re-added constraint: CHK_emailType_typeKey';


    -- ── Step 3: Insert the new emailType row(s) ───────────────
    -- Guard each with an existence check so the script is
    -- safely re-runnable.
    --
    -- EXAMPLE (uncomment and replace with your real values):
    --
    -- IF NOT EXISTS (
    --     SELECT 1 FROM dbo.emailType
    --     WHERE typeKey = 'maintenance.equipment.scheduled'
    -- )
    -- BEGIN
    --     INSERT INTO dbo.emailType (typeKey, description, isActive)
    --     VALUES (
    --         'maintenance.equipment.scheduled',
    --         'Sent when a scheduled maintenance event is created for a piece of equipment.',
    --         0   -- set to 1 only when the worker implementation is complete
    --     );
    --     PRINT 'Inserted emailType: maintenance.equipment.scheduled';
    -- END
    -- ELSE
    -- BEGIN
    --     PRINT 'emailType row already exists, skipping: maintenance.equipment.scheduled';
    -- END


    -- ── Verification ──────────────────────────────────────────
    PRINT '';
    PRINT 'Current emailType rows after migration:';

    COMMIT TRANSACTION;

END TRY
BEGIN CATCH

    ROLLBACK TRANSACTION;

    PRINT 'Migration failed — transaction rolled back.';
    PRINT 'Error ' + CAST(ERROR_NUMBER() AS VARCHAR) + ': ' + ERROR_MESSAGE();

    THROW;

END CATCH
GO

-- Run outside the transaction so it always executes regardless
-- of whether the migration was a no-op or a fresh apply.
SELECT
    emailTypeId,
    typeKey,
    isActive,
    createdAt,
    description
FROM  dbo.emailType
ORDER BY emailTypeId;
GO
