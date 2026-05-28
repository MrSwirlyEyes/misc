/* ============================================================
   PARAMETERS
   ============================================================ */
DECLARE @dateStart  DATETIME   = '2025-01-01 00:00:00';
DECLARE @dateFinish DATETIME   = '2025-12-31 23:59:59';

/* ============================================================
   QUERY 1 — FULL DATE-RANGE SUMMARY
   Rolled up: Program → Cell → Equipment via GROUPING SETS
   ============================================================ */
;WITH

/* --- 1. Tickets that overlap the window (clamped to its boundaries) --- */
base_tickets AS (
    SELECT
        ticketId,
        programId,   programName,
        cellId,      cellName,
        equipmentId, equipmentName,
        dateOpened,
        dateClosed,
        CASE WHEN dateOpened < @dateStart
             THEN @dateStart ELSE dateOpened END              AS clampedOpen,
        CASE WHEN COALESCE(dateClosed, @dateFinish) > @dateFinish
             THEN @dateFinish
             ELSE COALESCE(dateClosed, @dateFinish) END       AS clampedClose
    FROM vw_ticket
    WHERE dateOpened  < @dateFinish
      AND COALESCE(dateClosed, @dateFinish) > @dateStart
),

/* --- 2. Merge overlapping downtime intervals per equipment (gaps-and-islands) --- */
overlap_detect AS (
    SELECT
        equipmentId, cellId, programId,
        clampedOpen, clampedClose,
        MAX(clampedClose) OVER (
            PARTITION BY equipmentId
            ORDER BY     clampedOpen
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ) AS runningMaxClose
    FROM base_tickets
),
island_grp AS (
    SELECT
        equipmentId, cellId, programId,
        clampedOpen, clampedClose,
        SUM(CASE WHEN clampedOpen > ISNULL(runningMaxClose, clampedOpen)
                 THEN 1 ELSE 0 END)
            OVER (PARTITION BY equipmentId ORDER BY clampedOpen) AS grp
    FROM overlap_detect
),
merged_intervals AS (        -- non-overlapping downtime blocks per equipment
    SELECT
        equipmentId, cellId, programId,
        MIN(clampedOpen)  AS dtStart,
        MAX(clampedClose) AS dtEnd
    FROM island_grp
    GROUP BY equipmentId, cellId, programId, grp
),

/* --- 3. Total merged downtime minutes per equipment --- */
equip_downtime AS (
    SELECT
        equipmentId,
        SUM(DATEDIFF(MINUTE, dtStart, dtEnd)) AS downtimeMinutes
    FROM merged_intervals
    GROUP BY equipmentId
),

/* --- 4. Per-equipment ticket counts and repair totals --- */
equip_stats AS (
    SELECT
        equipmentId, equipmentName,
        cellId,      cellName,
        programId,   programName,
        COUNT(*)                                               AS totalTickets,
        COUNT(dateClosed)                                      AS closedTickets,
        SUM(CASE WHEN dateClosed IS NOT NULL
                 THEN CAST(DATEDIFF(MINUTE, dateOpened, dateClosed) AS FLOAT)
                 ELSE 0 END)                                   AS totalRepairMinutes
    FROM base_tickets
    GROUP BY equipmentId, equipmentName,
             cellId,      cellName,
             programId,   programName
),

/* --- 5. Attach operating minutes (window − downtime) per equipment --- */
equip_summary AS (
    SELECT
        s.equipmentId, s.equipmentName,
        s.cellId,      s.cellName,
        s.programId,   s.programName,
        s.totalTickets,
        s.closedTickets,
        s.totalRepairMinutes,
        CAST(
            DATEDIFF(MINUTE, @dateStart, @dateFinish)
            - ISNULL(d.downtimeMinutes, 0)
        AS FLOAT) AS operatingMinutes
    FROM equip_stats s
    LEFT JOIN equip_downtime d ON d.equipmentId = s.equipmentId
)

SELECT
    CASE WHEN GROUPING(equipmentId) = 0 THEN 'Equipment'
         WHEN GROUPING(cellId)      = 0 THEN 'Cell'
         ELSE 'Program'
    END                                                       AS [Level],
    programId,   programName,
    cellId,      cellName,
    equipmentId, equipmentName,

    SUM(totalTickets)                                         AS totalTickets,
    SUM(closedTickets)                                        AS closedTickets,
    SUM(totalTickets) - SUM(closedTickets)                    AS openTickets,

    /* MTTR — total repair minutes / closed ticket count
       Rolling up: numerator and denominator both sum, preserving the weighted average */
    ROUND(SUM(totalRepairMinutes)
          / NULLIF(SUM(closedTickets), 0), 1)                 AS mttrMinutes,
    ROUND(SUM(totalRepairMinutes)
          / NULLIF(SUM(closedTickets), 0) / 60.0, 2)          AS mttrHours,

    /* MTBF — total operating machine-minutes / total failures
       At Equipment: one machine's operating time / its failures
       At Cell/Program: sum of all machines' operating time / all failures  */
    ROUND(SUM(operatingMinutes)
          / NULLIF(SUM(totalTickets), 0), 1)                  AS mtbfMinutes,
    ROUND(SUM(operatingMinutes)
          / NULLIF(SUM(totalTickets), 0) / 60.0, 2)           AS mtbfHours

FROM equip_summary
GROUP BY GROUPING SETS (
    (programId, programName),
    (programId, programName, cellId, cellName),
    (programId, programName, cellId, cellName, equipmentId, equipmentName)
)
ORDER BY
    programId,
    GROUPING(cellId)      DESC,   -- program row before its cells
    cellId,
    GROUPING(equipmentId) DESC,   -- cell row before its equipment
    equipmentId;
