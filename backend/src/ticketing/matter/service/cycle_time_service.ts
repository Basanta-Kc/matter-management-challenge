import { config } from '../../../utils/config.js';
import { SLAStatus, CycleTime } from '../../types.js';
import pool from '../../../db/pool.js';
import logger from '../../../utils/logger.js';

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
  private _slaThresholdMs: number;

  constructor() {
    this._slaThresholdMs = config.SLA_THRESHOLD_HOURS * 60 * 60 * 1000;
  }


  /**
   * Batched calculation of cycle time and SLA for multiple tickets.
   * Returns a map keyed by ticketId.
   * 
   * @param items - An array of objects containing ticketId and currentStatusGroupName
   * @returns A map keyed by ticketId with cycleTime and sla properties
   * @example
   * const items = [
   *   { ticketId: '123', currentStatusGroupName: 'Done' },
   *   { ticketId: '456', currentStatusGroupName: 'In Progress' },
   * ];
   * const result = await calculateCycleTimesAndSLA(items);
   * console.log(result);
   */
  async calculateCycleTimesAndSLA(
    items: { ticketId: string; currentStatusGroupName: string | null }[],
  ): Promise<Record<string, { cycleTime: CycleTime; sla: SLAStatus }>> {
    const resultMap: Record<string, { cycleTime: CycleTime; sla: SLAStatus }> = {};
    
    const ticketIds = items.map((item) => item.ticketId);

    const client = await pool.connect();

    try {
      // Query to get first transition (earliest transitioned_at) and Done transition
      // for all requested tickets in a single round-trip.
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

        let resolutionTimeMs: number | null = null;
        let resolutionTimeFormatted: string;

        if (completedAt && startedAt) {
          // Matter is completed - calculate resolution time
          resolutionTimeMs = completedAt.getTime() - startedAt.getTime();
          resolutionTimeFormatted = this._formatDuration(resolutionTimeMs, false);
        } else if (startedAt && isInProgress) {
          // Matter is in progress - calculate ongoing duration
          resolutionTimeMs = now.getTime() - startedAt.getTime();
          resolutionTimeFormatted = this._formatDuration(resolutionTimeMs, true);
        } else {
          // No history or no start time
          resolutionTimeFormatted = 'N/A';
        }

        // Determine SLA status
        let sla: SLAStatus = 'In Progress';
        if (isInProgress) {
          sla = 'In Progress';
        } else if (resolutionTimeMs !== null && resolutionTimeMs <= this._slaThresholdMs) {
          sla = 'Met';
        } else if (resolutionTimeMs !== null && resolutionTimeMs > this._slaThresholdMs) {
          sla = 'Breached';
        } else {
          sla = 'In Progress';
        }

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

  // Helper method for formatting durations
  private _formatDuration(durationMs: number, isInProgress: boolean): string {
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
}

export default CycleTimeService;

