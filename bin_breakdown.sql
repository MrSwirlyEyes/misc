/* ============================================================
   PARAMETERS
   ============================================================ */
DECLARE @dateStart  DATETIME   = '2025-01-01 00:00:00';
DECLARE @dateFinish DATETIME   = '2025-12-31 23:59:59';
DECLARE @binType    VARCHAR(10) = 'MONTH';  -- 'DAY' | 'WEEK' | 'MONTH'

/* ============================================================
   QUERY 2 — BINNED STATS + AVG-ACROSS-BINS SUMMARY ROW
   Same hierarchy: Program → Cell → Equipment
   ============================================================ */
;WITH

/* --- Shared CTEs (identical to Query 1) --- */
base_tickets AS (
    SELECT
        ticketId,
        programId,   programName,
        cellId,      cellName,
        equipmentId, equipmentName,
        dateOpened,  dateClosed,
        CASE WHEN dateOpened < @dateStart
             THEN @dateStart ELSE dateOpened END              AS clampedOpen,
        CASE WHEN COALESCE(dateClosed, @dateFinish) > @dateFinish
             THEN @dateFinish
             ELSE COALESCE(dateClosed, @dateFinish) END       AS clampedClose
    FROM vw_ticket
    WHERE dateOpened  < @dateFinish
      AND COALESCE(dateClosed, @dateFinish) > @dateStart
),
overlap_detect AS (
    SELECT
        equipmentId, cellId, programId, clampedOpen, clampedClose,
        MAX(clampedClose) OVER (
            PARTITION BY equipmentId
            ORDER BY     clampedOpen
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS runningMaxClose
    FROM base_tickets
),
island_grp AS (
    SELECT
        equipmentId, cellId, programId, clampedOpen, clampedClose,
        SUM(CASE WHEN clampedOpen > ISNULL(runningMaxClose, clampedOpen)
                 THEN 1 ELSE 0 END)
            OVER (PARTITION BY equipmentId ORDER BY clampedOpen) AS grp
    FROM overlap_detect
),
merged_intervals AS (
    SELECT equipmentId, cellId, programId,
           MIN(clampedOpen)  AS dtStart,
           MAX(clampedClose) AS dtEnd
    FROM island_grp
    GROUP BY equipmentId, cellId, programId, grp
),

/* --- Bin boundaries (recursive date spine) --- */
date_spine AS (
    SELECT @dateStart AS binStart
    UNION ALL
    SELECT CASE @binType
               WHEN 'DAY'   THEN DATEADD(DAY,   1, binStart)
               WHEN 'WEEK'  THEN DATEADD(WEEK,  1, binStart)
               WHEN 'MONTH' THEN DATEADD(MONTH, 1, binStart)
           END
    FROM date_spine
    WHERE CASE @binType
              WHEN 'DAY'   THEN DATEADD(DAY,   1, binStart)
              WHEN 'WEEK'  THEN DATEADD(WEEK,  1, binStart)
              WHEN 'MONTH' THEN DATEADD(MONTH, 1, binStart)
          END < @dateFinish
),
bins AS (
    SELECT
        binStart,
        ISNULL(LEAD(binStart) OVER (ORDER BY binStart), @dateFinish) AS binEnd,
        CAST(DATEDIFF(MINUTE,
            binStart,
            ISNULL(LEAD(binStart) OVER (ORDER BY binStart), @dateFinish)
        ) AS FLOAT) AS binMinutes
    FROM date_spine
),

/* --- Accurate per-bin downtime: intersect already-merged intervals with
       each bin's boundary instead of re-merging inside every bin --- */
equip_bin_downtime AS (
    SELECT
        b.binStart,
        m.equipmentId,
        SUM(DATEDIFF(MINUTE,
            CASE WHEN m.dtStart < b.binStart THEN b.binStart ELSE m.dtStart END,
            CASE WHEN m.dtEnd   > b.binEnd   THEN b.binEnd   ELSE m.dtEnd   END
        )) AS downtimeMinutes
    FROM merged_intervals m
    JOIN bins b
        ON m.dtStart < b.binEnd
       AND m.dtEnd   > b.binStart
    GROUP BY b.binStart, m.equipmentId
),

/* --- Ticket stats per equipment per bin (keyed on dateOpened) --- */
bin_ticket_stats AS (
    SELECT
        b.binStart,
        t.equipmentId, t.equipmentName,
        t.cellId,      t.cellName,
        t.programId,   t.programName,
        COUNT(*)                                               AS ticketsOpened,
        COUNT(t.dateClosed)                                    AS ticketsClosed,
        SUM(CASE WHEN t.dateClosed IS NOT NULL
                 THEN CAST(DATEDIFF(MINUTE, t.dateOpened, t.dateClosed) AS FLOAT)
                 ELSE 0 END)                                   AS repairMinutes
    FROM base_tickets t
    JOIN bins b
        ON t.dateOpened >= b.binStart
       AND t.dateOpened  < b.binEnd
    GROUP BY b.binStart,
             t.equipmentId, t.equipmentName,
             t.cellId,      t.cellName,
             t.programId,   t.programName
),

/* --- Per equipment per bin: merge ticket stats + downtime → operating minutes --- */
equip_bin AS (
    SELECT
        bt.binStart,
        bt.equipmentId, bt.equipmentName,
        bt.cellId,      bt.cellName,
        bt.programId,   bt.programName,
        bt.ticketsOpened,
        bt.ticketsClosed,
        bt.repairMinutes,
        b.binMinutes,
        b.binMinutes - ISNULL(bd.downtimeMinutes, 0) AS operatingMinutes
    FROM bin_ticket_stats bt
    JOIN  bins b  ON b.binStart = bt.binStart
    LEFT JOIN equip_bin_downtime bd
        ON  bd.binStart    = bt.binStart
        AND bd.equipmentId = bt.equipmentId
),

/* --- Pre-aggregate to Cell and Program levels per bin.
       Critical: doing this BEFORE the final AVG means AVG(tickets) averages
       across bins, not across equipment×bin rows.                          --- */
cell_bin AS (
    SELECT binStart, programId, cellId,
           SUM(ticketsOpened)    AS ticketsOpened,
           SUM(ticketsClosed)    AS ticketsClosed,
           SUM(repairMinutes)    AS repairMinutes,
           SUM(binMinutes)       AS binMinutes,
           SUM(operatingMinutes) AS operatingMinutes
    FROM equip_bin
    GROUP BY binStart, programId, cellId
),
program_bin AS (
    SELECT binStart, programId,
           SUM(ticketsOpened)    AS ticketsOpened,
           SUM(ticketsClosed)    AS ticketsClosed,
           SUM(repairMinutes)    AS repairMinutes,
           SUM(binMinutes)       AS binMinutes,
           SUM(operatingMinutes) AS operatingMinutes
    FROM equip_bin
    GROUP BY binStart, programId
),

/* --- Union all hierarchy levels into one dataset --- */
combined AS (
    SELECT 'Program'   AS [Level], binStart,
           programId, NULL AS cellId, NULL AS equipmentId,
           ticketsOpened, ticketsClosed, repairMinutes, binMinutes, operatingMinutes
    FROM program_bin
    UNION ALL
    SELECT 'Cell',   binStart,
           programId, cellId, NULL,
           ticketsOpened, ticketsClosed, repairMinutes, binMinutes, operatingMinutes
    FROM cell_bin
    UNION ALL
    SELECT 'Equipment', binStart,
           programId, cellId, equipmentId,
           ticketsOpened, ticketsClosed, repairMinutes, binMinutes, operatingMinutes
    FROM equip_bin
)

SELECT
    [Level],

    /* Bin label — NULL binStart means the GROUPING SETS rolled it up → avg row */
    CASE GROUPING(binStart)
        WHEN 1 THEN 'AVG per Bin'
        ELSE CONVERT(VARCHAR(20), binStart, 120)
    END                                                       AS [Bin],

    programId,
    cellId,
    equipmentId,

    /* Total tickets — SUM for a specific bin, AVG per-bin for the summary row */
    CASE GROUPING(binStart)
        WHEN 0 THEN CAST(SUM(ticketsOpened) AS FLOAT)
        ELSE        ROUND(AVG(CAST(ticketsOpened AS FLOAT)), 2)
    END                                                       AS tickets,

    /* MTTR */
    ROUND(
        CASE GROUPING(binStart)
            WHEN 0 THEN SUM(repairMinutes) / NULLIF(SUM(ticketsClosed), 0)
            ELSE AVG(CASE WHEN ticketsClosed > 0
                         THEN repairMinutes / CAST(ticketsClosed AS FLOAT) END)
        END, 1
    )                                                         AS mttrMinutes,
    ROUND(
        CASE GROUPING(binStart)
            WHEN 0 THEN SUM(repairMinutes) / NULLIF(SUM(ticketsClosed), 0) / 60.0
            ELSE AVG(CASE WHEN ticketsClosed > 0
                         THEN repairMinutes / CAST(ticketsClosed AS FLOAT) END) / 60.0
        END, 2
    )                                                         AS mttrHours,

    /* MTBF */
    ROUND(
        CASE GROUPING(binStart)
            WHEN 0 THEN SUM(operatingMinutes) / NULLIF(SUM(ticketsOpened), 0)
            ELSE AVG(CASE WHEN ticketsOpened > 0
                         THEN operatingMinutes / CAST(ticketsOpened AS FLOAT) END)
        END, 1
    )                                                         AS mtbfMinutes,
    ROUND(
        CASE GROUPING(binStart)
            WHEN 0 THEN SUM(operatingMinutes) / NULLIF(SUM(ticketsOpened), 0) / 60.0
            ELSE AVG(CASE WHEN ticketsOpened > 0
                         THEN operatingMinutes / CAST(ticketsOpened AS FLOAT) END) / 60.0
        END, 2
    )                                                         AS mtbfHours

FROM combined
GROUP BY GROUPING SETS (
    ([Level], programId, cellId, equipmentId, binStart),   -- one row per entity per bin
    ([Level], programId, cellId, equipmentId)               -- AVG row per entity (binStart rolled up)
)
ORDER BY
    programId,
    CASE [Level] WHEN 'Program' THEN 1 WHEN 'Cell' THEN 2 ELSE 3 END,
    cellId,
    equipmentId,
    GROUPING(binStart) DESC,   -- AVG row last within each entity
    binStart

OPTION (MAXRECURSION 0);      -- needed for the recursive date spine
