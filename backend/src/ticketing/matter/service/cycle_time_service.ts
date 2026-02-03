import { config } from '../../../utils/config.js';
import { SLAStatus, CycleTime } from '../../types.js';
import pool from '../../../db/pool.js';
import logger from '../../../utils/logger.js';

/**
 * NOTE:
 * With the new implementation in the Matters repository, these helper functions
 * are no longer strictly required.
 *
 * Cycle time and SLA could be calculated directly at the query level using the
 * existing SQL helpers, for example:
 *
 *   // Get matter with cycle time and SLA data using SQL helpers
 *   const cycleTimeJoins = this.getCycleTimeJoins();
 *   const resolutionTimeMs = this.getResolutionTimeSql();
 *   const slaStatus = this.getSlaStatusSql();
 *
 *   const matterResult = await client.query(
 *     `
 *     SELECT
 *       tt.id,
 *       tt.board_id,
 *       tt.created_at,
 *       tt.updated_at,
 *       first_transition.first_transition_at,
 *       done_transition.done_transition_at,
 *       current_status.current_status_group_name,
 *       (${resolutionTimeMs}) AS resolution_time_ms,
 *       (${slaStatus}) AS sla_status
 *     FROM ticketing_ticket tt
 *     ${cycleTimeJoins}
 *     WHERE tt.id = $1
 *     `,
 *     [matterId]
 *   );
 *
 * However, the cycle time service has been intentionally retained because the
 * assessment explicitly required this logic to be implemented and tested
 * separately.
 */


/**
 * Pure function to format duration in milliseconds to human-readable format
 * @param durationMs - Duration in milliseconds
 * @param isInProgress - Whether the matter is still in progress
 * @returns Formatted duration string (e.g., "2h 30m", "3d 5h")
 */
export function formatDuration(durationMs: number | null, isInProgress: boolean): string {
  if (durationMs === null || durationMs === undefined || durationMs < 0) {
    return 'N/A';
  }

  const seconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const remainingHours = hours % 24;
  const remainingMinutes = minutes % 60;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days}d`);
  }
  if (remainingHours > 0) {
    parts.push(`${remainingHours}h`);
  }
  if (remainingMinutes > 0 && days === 0) {
    parts.push(`${remainingMinutes}m`);
  }

  if (parts.length === 0) {
    parts.push(`${seconds}s`);
  }

  const formatted = parts.join(' ');
  return isInProgress ? `In Progress: ${formatted}` : formatted;
}

/**
 * Pure function to determine SLA status based on resolution time and threshold
 * @param resolutionTimeMs - Resolution time in milliseconds
 * @param isInProgress - Whether the matter is still in progress
 * @param slaThresholdMs - SLA threshold in milliseconds
 * @returns SLA status ('In Progress', 'Met', or 'Breached')
 */
export function determineSLAStatus(
  resolutionTimeMs: number | null,
  isInProgress: boolean,
  slaThresholdMs: number,
): SLAStatus {
  if (isInProgress) {
    return 'In Progress';
  }

  if (resolutionTimeMs === null) {
    return 'In Progress';
  }

  return resolutionTimeMs <= slaThresholdMs ? 'Met' : 'Breached';
}

/**
 * Pure function to calculate resolution time
 * @param startedAt - Start date
 * @param completedAt - Completion date (null if in progress)
 * @param currentTime - Current time for in-progress calculations
 * @returns Resolution time in milliseconds or null
 */
export function calculateResolutionTime(
  startedAt: Date | null,
  completedAt: Date | null,
  currentTime: Date = new Date(),
): number | null {
  if (!startedAt) {
    return null;
  }

  if (completedAt) {
    return completedAt.getTime() - startedAt.getTime();
  }

  // In progress - calculate ongoing duration
  return currentTime.getTime() - startedAt.getTime();
}

/**
 * CycleTimeService - Calculate resolution times and SLA status for matters
 * 
 * Implements:
 * 1. Calculate resolution time from first status transition to "Done" status
 * 2. Determine SLA status based on resolution time vs threshold
 * 3. Format durations in human-readable format (e.g., "2h 30m", "3d 5h")
 */
export class CycleTimeService {
  // SLA threshold in milliseconds
  private slaThresholdMs: number;

  constructor(slaThresholdHours?: number) {
    this.slaThresholdMs = (slaThresholdHours ?? config.SLA_THRESHOLD_HOURS) * 60 * 60 * 1000;
  }

  /**
   * Batched calculation of cycle time and SLA for multiple tickets.
   * Returns a map keyed by ticketId.
   * 
   * Previously getMatters was also uing this method to get the cycle time and sla
   * for each ticket we were looping in which was causing n+1 queries so I changed this 
   * method to accept array of items so that we get all the data at once,
   * 
   * @param items - An array of objects containing ticketId and currentStatusGroupName
   * @returns A map keyed by ticketId with cycleTime and sla properties
   */
  async calculateCycleTimesAndSLA(
    items: { ticketId: string; currentStatusGroupName: string | null }[],
  ): Promise<Record<string, { cycleTime: CycleTime; sla: SLAStatus }>> {
    const resultMap: Record<string, { cycleTime: CycleTime; sla: SLAStatus }> = {};
    
    const ticketIds = items.map((item) => item.ticketId);

    const client = await pool.connect();

    try {
      // Query to get first transition and Done transition for all tickets
      const result = await client.query(
        `SELECT 
          tcth.ticket_id,
          MIN(tcth.transitioned_at) as started_at,
          MIN(tcth.transitioned_at) FILTER (WHERE tfsg.name = 'Done') as completed_at
        FROM ticketing_cycle_time_histories tcth
        JOIN ticketing_field_status_options tfso ON tcth.to_status_id = tfso.id
        JOIN ticketing_field_status_groups tfsg ON tfso.group_id = tfsg.id
        WHERE tcth.ticket_id = ANY($1::uuid[])
        GROUP BY tcth.ticket_id`,
        [ticketIds],
      );

      // Index results by ticket_id for quick lookup
      const rowsByTicketId: Record<
        string,
        { started_at: string | null; completed_at: string | null }
      > = {};

      for (const row of result.rows) {
        rowsByTicketId[row.ticket_id] = {
          started_at: row.started_at,
          completed_at: row.completed_at,
        };
      }

      const now = new Date();

      for (const { ticketId, currentStatusGroupName } of items) {
        const row = rowsByTicketId[ticketId];
        const startedAt = row?.started_at ? new Date(row.started_at) : null;
        const completedAt = row?.completed_at ? new Date(row.completed_at) : null;
        const isInProgress = currentStatusGroupName !== 'Done';

        // Use pure functions for calculations
        const resolutionTimeMs = calculateResolutionTime(startedAt, completedAt, now);
        const resolutionTimeFormatted = formatDuration(resolutionTimeMs, isInProgress);
        const sla = determineSLAStatus(resolutionTimeMs, isInProgress, this.slaThresholdMs);

        resultMap[ticketId] = {
          cycleTime: {
            resolutionTimeMs,
            resolutionTimeFormatted,
            isInProgress,
            startedAt,
            completedAt,
          },
          sla,
        };
      }

      return resultMap;
    } catch (error) {
      logger.error('Error calculating cycle time and SLA (batched)', {
        error,
        ticketIds,
      });
      throw error;
    } finally {
      client.release();
    }
  }
}

export default CycleTimeService;

