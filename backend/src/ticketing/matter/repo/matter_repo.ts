import pool from '../../../db/pool.js';
import { Matter, MatterListParams, FieldValue, UserValue, CurrencyValue, StatusValue, SLAStatus, CycleTime } from '../../types.js';
import logger from '../../../utils/logger.js';
import { config } from '../../../utils/config.js';
import { PoolClient } from 'pg';

export class MatterRepo {
  // Cache for field IDs by field name
  private fieldIdCache: Map<string, { id: string; fieldType: string }> = new Map();

  /**
   * Format duration in milliseconds to human-readable format
   */
  private formatDuration(durationMs: number | null, isInProgress: boolean): string {
    if (durationMs === null || durationMs === undefined || durationMs < 0) {
      return 'N/A';
    }

    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const years = Math.floor(days / 365);

    const remainingDays = days % 365;
    const remainingHours = hours % 24;
    const remainingMinutes = minutes % 60;
    const remainingSeconds = seconds % 60;

    const parts: string[] = [];

    if (years > 0) {
      parts.push(`${years}y`);
      // When we have years, only show remaining days if > 0
      if (remainingDays > 0) {
        parts.push(`${remainingDays}d`);
      }
    } else if (days > 0) {
      parts.push(`${days}d`);
      // When we have days (but no years), show hours if > 0
      if (remainingHours > 0) {
        parts.push(`${remainingHours}h`);
      }
    } else if (hours > 0) {
      parts.push(`${hours}h`);
      // When we have hours (but no days), show minutes if > 0
      if (remainingMinutes > 0) {
        parts.push(`${remainingMinutes}m`);
      }
    } else if (minutes > 0) {
      parts.push(`${minutes}m`);
    } else {
      // Less than a minute
      parts.push(`${remainingSeconds}s`);
    }

    const formatted = parts.join(' ');
    return isInProgress ? `In Progress: ${formatted}` : formatted;
  }

  private getCycleTimeJoins(): string {
    return `
      LEFT JOIN (
        SELECT 
          tcth.ticket_id,
          MIN(tcth.transitioned_at) as first_transition_at
        FROM ticketing_cycle_time_histories tcth
        GROUP BY tcth.ticket_id
      ) first_transition ON tt.id = first_transition.ticket_id
      LEFT JOIN (
        SELECT 
          tcth.ticket_id,
          MIN(tcth.transitioned_at) as done_transition_at
        FROM ticketing_cycle_time_histories tcth
        JOIN ticketing_field_status_options tfso ON tcth.to_status_id = tfso.id
        JOIN ticketing_field_status_groups tfsg ON tfso.group_id = tfsg.id
        WHERE tfsg.name = 'Done'
        GROUP BY tcth.ticket_id
      ) done_transition ON tt.id = done_transition.ticket_id
      LEFT JOIN (
        SELECT 
          ttfv.ticket_id,
          tfsg.name as current_status_group_name
        FROM ticketing_ticket_field_value ttfv
        JOIN ticketing_fields tf ON ttfv.ticket_field_id = tf.id AND tf.name = 'Status'
        JOIN ticketing_field_status_options tfso ON ttfv.status_reference_value_uuid = tfso.id
        JOIN ticketing_field_status_groups tfsg ON tfso.group_id = tfsg.id
        WHERE tf.deleted_at IS NULL
      ) current_status ON tt.id = current_status.ticket_id
    `;
  }

  /**
   * Generate resolution time SQL expression
   */
  private getResolutionTimeSql(): string {
    return `
      CASE 
        WHEN done_transition.done_transition_at IS NOT NULL AND first_transition.first_transition_at IS NOT NULL THEN
          EXTRACT(EPOCH FROM (done_transition.done_transition_at - first_transition.first_transition_at)) * 1000
        WHEN first_transition.first_transition_at IS NOT NULL THEN
          EXTRACT(EPOCH FROM (NOW() - first_transition.first_transition_at)) * 1000
        ELSE NULL
      END
    `;
  }

  /**
   * Generate SLA status SQL expression
   */
  private getSlaStatusSql(): string {
    const slaThresholdMs = config.SLA_THRESHOLD_HOURS * 60 * 60 * 1000;
    return `
      CASE 
        WHEN current_status.current_status_group_name != 'Done' THEN 'In Progress'
        WHEN done_transition.done_transition_at IS NOT NULL AND first_transition.first_transition_at IS NOT NULL THEN
          CASE 
            WHEN EXTRACT(EPOCH FROM (done_transition.done_transition_at - first_transition.first_transition_at)) * 1000 <= ${slaThresholdMs} THEN 'Met'
            ELSE 'Breached'
          END
        ELSE 'In Progress'
      END
    `;
  }

  /**
   * Process cycle time data from query result row
   */
  private processCycleTimeData(row: {
    resolution_time_ms?: string | null;
    current_status_group_name?: string;
    first_transition_at?: string | null;
    done_transition_at?: string | null;
    sla_status?: string;
  }): { cycleTime: CycleTime; sla: SLAStatus } {
    const resolutionTimeMs = row.resolution_time_ms ? parseFloat(row.resolution_time_ms) : null;
    const isInProgress = row.current_status_group_name !== 'Done';
    
    return {
      cycleTime: {
        resolutionTimeMs,
        resolutionTimeFormatted: this.formatDuration(resolutionTimeMs, isInProgress),
        isInProgress,
        startedAt: row.first_transition_at ? new Date(row.first_transition_at) : null,
        completedAt: row.done_transition_at ? new Date(row.done_transition_at) : null,
      },
      sla: row.sla_status as SLAStatus,
    };
  }
  /**
   * Get field ID and type by field name (with caching)
   */
  private async getFieldInfo(client: PoolClient, fieldName: string): Promise<{ id: string; fieldType: string } | null> {
    // Check cache first
    if (this.fieldIdCache.has(fieldName)) {
      return this.fieldIdCache.get(fieldName)!;
    }

    const result = await client.query(
      `SELECT id, field_type 
       FROM ticketing_fields 
       WHERE name = $1 AND deleted_at IS NULL 
       LIMIT 1`,
      [fieldName],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const fieldInfo = {
      id: result.rows[0].id,
      fieldType: result.rows[0].field_type,
    };

    // Cache the result
    this.fieldIdCache.set(fieldName, fieldInfo);
    return fieldInfo;
  }

  /**
   * Build order by clause for field-based sorting
   *    
   * The challenge: We store different field types in different columns (number_value, 
   * text_value, etc.), so sorting requires knowing which column to use.
   * 
   * The solution: We look up the field type, then build a custom JOIN and ORDER BY
   * clause that targets the right column. We also handle NULLs gracefully by pushing
   * them to the end with NULLS LAST.
   * 
   * Example: Sorting by "Case Number" (a number field) becomes:
   *   LEFT JOIN ticketing_ticket_field_value ON ... field_id = 'abc-123'
   *   ORDER BY number_value DESC NULLS LAST
   */
  private async buildOrderByClause(
    client: PoolClient,
    sortBy: string,
    sortOrder: 'asc' | 'desc',
  ): Promise<{ orderByClause: string; joins: string[] }> {
    const sortOrderUpper = sortOrder.toUpperCase();
    const joins: string[] = [];

    // Handle built-in columns
    if (sortBy === 'created_at') {
      return { orderByClause: `tt.created_at ${sortOrderUpper}`, joins: [] };
    }
    if (sortBy === 'updated_at') {
      return { orderByClause: `tt.updated_at ${sortOrderUpper}`, joins: [] };
    }

    // Handle Resolution Time and SLA
    if (sortBy === 'Resolution Time') {
      return { 
        orderByClause: `(${this.getResolutionTimeSql()}) ${sortOrderUpper} NULLS LAST, tt.created_at ${sortOrderUpper}`, 
        joins: [] // No additional joins needed, main query handles them
      };
    }
    
    if (sortBy === 'SLA') {
      const slaThresholdMs = config.SLA_THRESHOLD_HOURS * 60 * 60 * 1000;
      const slaStatusSubquery = `
        CASE 
          WHEN current_status.current_status_group_name != 'Done' THEN 0  -- 'In Progress'
          WHEN done_transition.done_transition_at IS NOT NULL AND first_transition.first_transition_at IS NOT NULL THEN
            CASE 
              WHEN EXTRACT(EPOCH FROM (done_transition.done_transition_at - first_transition.first_transition_at)) * 1000 <= ${slaThresholdMs} THEN 1  -- 'Met'
              ELSE 2  -- 'Breached'
            END
          ELSE 0  -- 'In Progress'
        END
      `;
      
      return { 
        orderByClause: `${slaStatusSubquery} ${sortOrderUpper}, tt.created_at ${sortOrderUpper}`, 
        joins: [] // No additional joins needed, main query handles them
      };
    }

    // Get field info
    const fieldInfo = await this.getFieldInfo(client, sortBy);
    if (!fieldInfo) {
      // Field not found, fall back to created_at
      return { orderByClause: `tt.created_at ${sortOrderUpper}`, joins: [] };
    }

    const { id: fieldId, fieldType } = fieldInfo;
    const sortAlias = 'ttfv_sort';
    
    // Validate fieldId is a valid UUID format to prevent SQL injection
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(fieldId)) {
      logger.warn('Invalid field ID format', { fieldId, sortBy });
      return { orderByClause: `tt.created_at ${sortOrderUpper}`, joins: [] };
    }

    switch (fieldType) {
      case 'number':
        joins.push(
          `LEFT JOIN ticketing_ticket_field_value ${sortAlias} ON tt.id = ${sortAlias}.ticket_id AND ${sortAlias}.ticket_field_id = '${fieldId}'`,
        );
        return {
          orderByClause: `${sortAlias}.number_value ${sortOrderUpper} NULLS LAST, tt.created_at ${sortOrderUpper}`,
          joins,
        };

      case 'text':
        joins.push(
          `LEFT JOIN ticketing_ticket_field_value ${sortAlias} ON tt.id = ${sortAlias}.ticket_id AND ${sortAlias}.ticket_field_id = '${fieldId}'`,
        );
        return {
          orderByClause: `COALESCE(${sortAlias}.string_value, ${sortAlias}.text_value) ${sortOrderUpper} NULLS LAST, tt.created_at ${sortOrderUpper}`,
          joins,
        };

      case 'date':
        joins.push(
          `LEFT JOIN ticketing_ticket_field_value ${sortAlias} ON tt.id = ${sortAlias}.ticket_id AND ${sortAlias}.ticket_field_id = '${fieldId}'`,
        );
        return {
          orderByClause: `${sortAlias}.date_value ${sortOrderUpper} NULLS LAST, tt.created_at ${sortOrderUpper}`,
          joins,
        };

      case 'boolean':
        joins.push(
          `LEFT JOIN ticketing_ticket_field_value ${sortAlias} ON tt.id = ${sortAlias}.ticket_id AND ${sortAlias}.ticket_field_id = '${fieldId}'`,
        );
        return {
          orderByClause: `${sortAlias}.boolean_value ${sortOrderUpper} NULLS LAST, tt.created_at ${sortOrderUpper}`,
          joins,
        };

      case 'currency':
        joins.push(
          `LEFT JOIN ticketing_ticket_field_value ${sortAlias} ON tt.id = ${sortAlias}.ticket_id AND ${sortAlias}.ticket_field_id = '${fieldId}'`,
        );
        return {
          orderByClause: `(${sortAlias}.currency_value->>'amount')::numeric ${sortOrderUpper} NULLS LAST, tt.created_at ${sortOrderUpper}`,
          joins,
        };

      case 'user':
        joins.push(
          `LEFT JOIN ticketing_ticket_field_value ${sortAlias} ON tt.id = ${sortAlias}.ticket_id AND ${sortAlias}.ticket_field_id = '${fieldId}'`,
        );
        joins.push(`LEFT JOIN users u_sort ON ${sortAlias}.user_value = u_sort.id`);
        return {
          orderByClause: `u_sort.last_name ${sortOrderUpper} NULLS LAST, u_sort.first_name ${sortOrderUpper} NULLS LAST, tt.created_at ${sortOrderUpper}`,
          joins,
        };

      case 'select':
        joins.push(
          `LEFT JOIN ticketing_ticket_field_value ${sortAlias} ON tt.id = ${sortAlias}.ticket_id AND ${sortAlias}.ticket_field_id = '${fieldId}'`,
        );
        joins.push(
          `LEFT JOIN ticketing_field_options tfo_sort ON ${sortAlias}.select_reference_value_uuid = tfo_sort.id`,
        );
        return {
          orderByClause: `tfo_sort.sequence ${sortOrderUpper} NULLS LAST, tfo_sort.label ${sortOrderUpper} NULLS LAST, tt.created_at ${sortOrderUpper}`,
          joins,
        };

      case 'status':
        joins.push(
          `LEFT JOIN ticketing_ticket_field_value ${sortAlias} ON tt.id = ${sortAlias}.ticket_id AND ${sortAlias}.ticket_field_id = '${fieldId}'`,
        );
        joins.push(
          `LEFT JOIN ticketing_field_status_options tfso_sort ON ${sortAlias}.status_reference_value_uuid = tfso_sort.id`,
        );
        joins.push(`LEFT JOIN ticketing_field_status_groups tfsg_sort ON tfso_sort.group_id = tfsg_sort.id`);
        return {
          orderByClause: `tfsg_sort.sequence ${sortOrderUpper} NULLS LAST, tfso_sort.sequence ${sortOrderUpper} NULLS LAST, tfso_sort.label ${sortOrderUpper} NULLS LAST, tt.created_at ${sortOrderUpper}`,
          joins,
        };

      default:
        return { orderByClause: `tt.created_at ${sortOrderUpper}`, joins: [] };
    }
  }

  /**
   * Build search condition for WHERE clause
   * 
   * We need to search across ALL field types! 
   * 
   * The problem: A user might search for "John" (a user name), "1000" (a case number),
   * or "Critical" (a priority). We don't know which field they're searching in.
   * 
   * The solution: We use EXISTS subqueries to check each field type separately:
   * - Text fields: Check string_value and text_value with ILIKE (case-insensitive)
   * - Number fields: Cast to text and search
   * - User fields: Search first name, last name, and full name
   * - Status/Select fields: Search the label (not the UUID)
   * - Currency fields: Search the amount
   * - SLA: Even search the SLA status!
   * 
   * All searches use parameterized queries ($1) to prevent SQL injection. 
   */
  private buildSearchCondition(
    search: string | undefined,
    queryParams: (string | number)[],
    paramIndex: number
  ): { condition: string; nextParamIndex: number } {
    if (!search || search.trim() === '') {
      return { condition: '', nextParamIndex: paramIndex };
    }
  
    const searchTerm = search.trim();
    queryParams.push(searchTerm);
    const searchParam = `$${paramIndex}`;
    const nextParamIndex = paramIndex + 1;
  
    const condition = `
      AND (
        EXISTS (
          SELECT 1 FROM ticketing_ticket_field_value ttfv_search
          JOIN ticketing_fields tf_search ON ttfv_search.ticket_field_id = tf_search.id
          WHERE ttfv_search.ticket_id = tt.id
            AND tf_search.field_type = 'text'
            AND (
              ttfv_search.string_value ILIKE '%' || $${paramIndex} || '%'
              OR ttfv_search.text_value ILIKE '%' || $${paramIndex} || '%'
            )
        )
        OR EXISTS (
          SELECT 1 FROM ticketing_ticket_field_value ttfv_search
          JOIN ticketing_fields tf_search ON ttfv_search.ticket_field_id = tf_search.id
          WHERE ttfv_search.ticket_id = tt.id
            AND tf_search.field_type = 'number'
            AND CAST(ttfv_search.number_value AS TEXT) ILIKE '%' || ${searchParam} || '%'
        )
        OR EXISTS (
          SELECT 1 FROM ticketing_ticket_field_value ttfv_search
          JOIN ticketing_fields tf_search ON ttfv_search.ticket_field_id = tf_search.id
          JOIN ticketing_field_status_options tfso_search ON ttfv_search.status_reference_value_uuid = tfso_search.id
          WHERE ttfv_search.ticket_id = tt.id
            AND tf_search.field_type = 'status'
            AND tfso_search.label ILIKE '%' || $${paramIndex} || '%'
        )
        OR EXISTS (
          SELECT 1 FROM ticketing_ticket_field_value ttfv_search
          JOIN ticketing_fields tf_search ON ttfv_search.ticket_field_id = tf_search.id
          LEFT JOIN users u_search ON ttfv_search.user_value = u_search.id
          WHERE ttfv_search.ticket_id = tt.id
            AND tf_search.field_type = 'user'
            AND (
              u_search.first_name ILIKE '%' || $${paramIndex} || '%'
              OR u_search.last_name ILIKE '%' || $${paramIndex} || '%'
              OR (u_search.first_name || ' ' || u_search.last_name) ILIKE '%' || $${paramIndex} || '%'
            )
        )
        OR EXISTS (
          SELECT 1 FROM ticketing_ticket_field_value ttfv_search
          JOIN ticketing_fields tf_search ON ttfv_search.ticket_field_id = tf_search.id
          WHERE ttfv_search.ticket_id = tt.id
            AND tf_search.field_type = 'currency'
            AND (ttfv_search.currency_value->>'amount')::text ILIKE '%' || ${searchParam} || '%'
        )
        OR EXISTS (
          SELECT 1 FROM ticketing_ticket_field_value ttfv_search
          JOIN ticketing_fields tf_search ON ttfv_search.ticket_field_id = tf_search.id
          LEFT JOIN ticketing_field_options tfo_search ON ttfv_search.select_reference_value_uuid = tfo_search.id
          WHERE ttfv_search.ticket_id = tt.id
            AND tf_search.field_type = 'select'
            AND tfo_search.label ILIKE '%' || $${paramIndex} || '%'
        )
        OR EXISTS (
          SELECT 1 FROM ticketing_ticket tt_sla
          LEFT JOIN (
            SELECT 
              tcth.ticket_id,
              MIN(tcth.transitioned_at) as first_transition_at
            FROM ticketing_cycle_time_histories tcth
            GROUP BY tcth.ticket_id
          ) first_transition_sla ON tt_sla.id = first_transition_sla.ticket_id
          LEFT JOIN (
            SELECT 
              tcth.ticket_id,
              MIN(tcth.transitioned_at) as done_transition_at
            FROM ticketing_cycle_time_histories tcth
            JOIN ticketing_field_status_options tfso ON tcth.to_status_id = tfso.id
            JOIN ticketing_field_status_groups tfsg ON tfso.group_id = tfsg.id
            WHERE tfsg.name = 'Done'
            GROUP BY tcth.ticket_id
          ) done_transition_sla ON tt_sla.id = done_transition_sla.ticket_id
          LEFT JOIN (
            SELECT 
              ttfv.ticket_id,
              tfsg.name as current_status_group_name
            FROM ticketing_ticket_field_value ttfv
            JOIN ticketing_fields tf ON ttfv.ticket_field_id = tf.id AND tf.name = 'Status'
            JOIN ticketing_field_status_options tfso ON ttfv.status_reference_value_uuid = tfso.id
            JOIN ticketing_field_status_groups tfsg ON tfso.group_id = tfsg.id
            WHERE tf.deleted_at IS NULL
          ) current_status_sla ON tt_sla.id = current_status_sla.ticket_id
          WHERE tt_sla.id = tt.id
          AND (
            (CASE 
              WHEN current_status_sla.current_status_group_name != 'Done' THEN 'In Progress'
              WHEN done_transition_sla.done_transition_at IS NOT NULL AND first_transition_sla.first_transition_at IS NOT NULL THEN
                CASE 
                  WHEN EXTRACT(EPOCH FROM (done_transition_sla.done_transition_at - first_transition_sla.first_transition_at)) * 1000 <= ${config.SLA_THRESHOLD_HOURS * 60 * 60 * 1000} THEN 'Met'
                  ELSE 'Breached'
                END
              ELSE 'In Progress'
            END) ILIKE '%' || ${searchParam} || '%'
          )
        )
      )
    `;
  
    return { condition, nextParamIndex };
  }
  

  /**
   * Get paginated list of matters with search and sorting
   * 
   * 
   * What it does:
   * 1. Takes user input (page, limit, sortBy, sortOrder, search)
   * 2. Builds a dynamic SQL query based on those parameters
   * 3. Fetches matters with cycle time and SLA data
   * 4. Batch-fetches all fields to avoid N+1 queries
   * 5. Returns paginated results with total count
   * 
   * The tricky parts:
   * - Dynamic ORDER BY: Different field types need different sorting logic
   * - Search across all fields: We check text, numbers, users, statuses, etc.
   * - Cycle time calculation: Done in SQL for performance
   * - NULL handling: Matters with missing fields still show up (NULLS LAST)
   * 
   * Performance notes:
   * - Uses LEFT JOINs so matters without certain fields aren't excluded
   * - Calculates resolution time and SLA in SQL (faster than doing it in code)
   * - Batch fetches fields to minimize database round trips
   */
  async getMatters(params: MatterListParams) {
    const { page = 1, limit = 25, sortBy = 'created_at', sortOrder = 'desc', search } = params;
    const offset = (page - 1) * limit;

    const client = await pool.connect();

    try {
      const queryParams: (string | number)[] = [];
      let paramIndex = 1;

      // Build search condition
      const { condition: searchCondition, nextParamIndex } = this.buildSearchCondition(search, queryParams, paramIndex);
      paramIndex = nextParamIndex;

      // Build order by clause with joins
      const { orderByClause, joins } = await this.buildOrderByClause(client, sortBy, sortOrder);

      // Cycle time calculation joins for data retrieval
      const cycleTimeJoins = this.getCycleTimeJoins();

      // Calculate resolution time and SLA in SQL
      // Why in SQL? Because calculating in code would mean fetching ALL matters first,
      // then filtering/sorting in memory. That doesn't scale! By doing it in SQL,
      // the database can use indexes and only return the page we need.
      const resolutionTimeMs = this.getResolutionTimeSql();
      const slaStatus = this.getSlaStatusSql();

      const countQuery = `
        SELECT COUNT(DISTINCT tt.id) as total
        FROM ticketing_ticket tt
        ${joins.join(' ')}
        ${cycleTimeJoins}
        WHERE 1=1 ${searchCondition}
      `;
      
      const countResult = await client.query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total);

      // Get matters
      const mattersQuery = `
        SELECT 
          tt.id, 
          tt.board_id, 
          tt.created_at, 
          tt.updated_at,
          first_transition.first_transition_at,
          done_transition.done_transition_at,
          current_status.current_status_group_name,
          (${resolutionTimeMs}) as resolution_time_ms,
          (${slaStatus}) as sla_status
        FROM ticketing_ticket tt
        ${joins.join(' ')}
        ${cycleTimeJoins}
        WHERE 1=1 ${searchCondition}
        ORDER BY ${orderByClause}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;
      
      queryParams.push(limit, offset);
      const mattersResult = await client.query(mattersQuery, queryParams);

      // Batch fetch all fields for all matters to avoid N+1 queries
      const matterIds = mattersResult.rows.map((row) => row.id);
      const allFields = await this.getMatterFieldsBatch(client, matterIds);

      // Build matters array with fields and cycle time data
      const matters: Matter[] = mattersResult.rows.map((matterRow) => {
        const { cycleTime, sla } = this.processCycleTimeData(matterRow);
        
        return {
          id: matterRow.id,
          boardId: matterRow.board_id,
          fields: allFields[matterRow.id] || {},
          cycleTime,
          sla,
          createdAt: matterRow.created_at,
          updatedAt: matterRow.updated_at,
        };
      });

      return { matters, total };
    } catch (error) {
      logger.error('Error fetching matters', { error, params });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get a single matter by ID
   */
  async getMatterById(matterId: string): Promise<Matter | null> {
    const client = await pool.connect();

    try {
      const matterResult = await client.query(
        `SELECT id, board_id, created_at, updated_at
         FROM ticketing_ticket
         WHERE id = $1`,
        [matterId],
      );

      if (matterResult.rows.length === 0) {
        return null;
      }

      const matterRow = matterResult.rows[0];
      const fields = (await this.getMatterFieldsBatch(client, [matterId]))[matterId];

      return {
        id: matterRow.id,
        boardId: matterRow.board_id,
        fields,
        createdAt: matterRow.created_at,
        updatedAt: matterRow.updated_at,
      };
    } finally {
      client.release();
    }
  }

  /**
   * Get all field values for multiple matters (batch operation to avoid N+1 queries)
   */
  private async getMatterFieldsBatch(client: PoolClient, ticketIds: string[]): Promise<Record<string, Record<string, FieldValue>>> {
    if (ticketIds.length === 0) {
      return {};
    }

    const fieldsResult = await client.query(
      `SELECT 
        ttfv.ticket_id,
        ttfv.id,
        ttfv.ticket_field_id,
        tf.name as field_name,
        tf.field_type,
        ttfv.text_value,
        ttfv.string_value,
        ttfv.number_value,
        ttfv.date_value,
        ttfv.boolean_value,
        ttfv.currency_value,
        ttfv.user_value,
        ttfv.select_reference_value_uuid,
        ttfv.status_reference_value_uuid,
        -- User data
        u.id as user_id,
        u.email as user_email,
        u.first_name as user_first_name,
        u.last_name as user_last_name,
        -- Select option label
        tfo.label as select_option_label,
        -- Status option data
        tfso.label as status_option_label,
        tfsg.name as status_group_name
       FROM ticketing_ticket_field_value ttfv
       JOIN ticketing_fields tf ON ttfv.ticket_field_id = tf.id
       LEFT JOIN users u ON ttfv.user_value = u.id
       LEFT JOIN ticketing_field_options tfo ON ttfv.select_reference_value_uuid = tfo.id
       LEFT JOIN ticketing_field_status_options tfso ON ttfv.status_reference_value_uuid = tfso.id
       LEFT JOIN ticketing_field_status_groups tfsg ON tfso.group_id = tfsg.id
       WHERE ttfv.ticket_id = ANY($1::uuid[])`,
      [ticketIds],
    );

    const fieldsByMatter: Record<string, Record<string, FieldValue>> = {};

    for (const row of fieldsResult.rows) {
      const ticketId = row.ticket_id;
      if (!fieldsByMatter[ticketId]) {
        fieldsByMatter[ticketId] = {};
      }

      let value: string | number | boolean | Date | CurrencyValue | UserValue | StatusValue | null = null;
      let displayValue: string | undefined = undefined;

      switch (row.field_type) {
        case 'text':
          value = row.text_value || row.string_value;
          break;
        case 'number':
          value = row.number_value ? parseFloat(row.number_value) : null;
          displayValue = value !== null ? value.toLocaleString() : undefined;
          break;
        case 'date':
          value = row.date_value;
          // Send raw date value, let frontend format it
          displayValue = row.date_value ? row.date_value : undefined;
          break;
        case 'boolean':
          value = row.boolean_value;
          displayValue = value ? '✓' : '✗';
          break;
        case 'currency':
          value = row.currency_value as CurrencyValue;
          if (row.currency_value) {
            displayValue = `${(row.currency_value as CurrencyValue).amount.toLocaleString()} ${(row.currency_value as CurrencyValue).currency}`;
          }
          break;
        case 'user':
          if (row.user_id) {
            const userValue: UserValue = {
              id: row.user_id,
              email: row.user_email,
              firstName: row.user_first_name,
              lastName: row.user_last_name,
              displayName: `${row.user_first_name} ${row.user_last_name}`,
            };
            value = userValue;
            displayValue = userValue.displayName;
          }
          break;
        case 'select':
          value = row.select_reference_value_uuid;
          displayValue = row.select_option_label;
          break;
        case 'status':
          value = row.status_reference_value_uuid;
          displayValue = row.status_option_label;
          // Store group name in metadata for SLA calculations
          if (row.status_group_name) {
            value = {
              statusId: row.status_reference_value_uuid,
              groupName: row.status_group_name,
            } as StatusValue;
          }
          break;
      }

      fieldsByMatter[ticketId][row.field_name] = {
        fieldId: row.ticket_field_id,
        fieldName: row.field_name,
        fieldType: row.field_type,
        value,
        displayValue,
      };
    }

    return fieldsByMatter;
  }

  /**
   * Update a matter's field value
   */
  async updateMatterField(
    matterId: string,
    fieldId: string,
    fieldType: string,
    value: string | number | boolean | Date | CurrencyValue | UserValue | StatusValue | null,
    userId: number,
  ): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Determine which column to update based on field type
      let columnName: string;
      let columnValue: string | number | boolean | Date | null = null;

      switch (fieldType) {
        case 'text':
          columnName = 'text_value';
          columnValue = value as string;
          break;
        case 'number':
          columnName = 'number_value';
          columnValue = value as number;
          break;
        case 'date':
          columnName = 'date_value';
          columnValue = value as Date;
          break;
        case 'boolean':
          columnName = 'boolean_value';
          columnValue = value as boolean;
          break;
        case 'currency':
          columnName = 'currency_value';
          columnValue = JSON.stringify(value);
          break;
        case 'user':
          columnName = 'user_value';
          columnValue = value as number;
          break;
        case 'select':
          columnName = 'select_reference_value_uuid';
          columnValue = value as string;
          break;
        case 'status': {
          columnName = 'status_reference_value_uuid';
          columnValue = value as string;
          
          // Track status change in cycle time history
          const currentStatusResult = await client.query(
            `SELECT status_reference_value_uuid 
             FROM ticketing_ticket_field_value 
             WHERE ticket_id = $1 AND ticket_field_id = $2`,
            [matterId, fieldId],
          );
          
          if (currentStatusResult.rows.length > 0) {
            const fromStatusId = currentStatusResult.rows[0].status_reference_value_uuid;
            
            await client.query(
              `INSERT INTO ticketing_cycle_time_histories 
               (ticket_id, status_field_id, from_status_id, to_status_id, transitioned_at)
               VALUES ($1, $2, $3, $4, NOW())`,
              [matterId, fieldId, fromStatusId, value],
            );
          }
          break;
        }
        default:
          throw new Error(`Unsupported field type: ${fieldType}`);
      }

      // Upsert field value
      await client.query(
        `INSERT INTO ticketing_ticket_field_value 
         (ticket_id, ticket_field_id, ${columnName}, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (ticket_id, ticket_field_id)
         DO UPDATE SET ${columnName} = $3, updated_by = $5, updated_at = NOW()`,
        [matterId, fieldId, columnValue, userId, userId],
      );

      // Update matter's updated_at
      await client.query(
        `UPDATE ticketing_ticket SET updated_at = NOW() WHERE id = $1`,
        [matterId],
      );

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Error updating matter field', { error, matterId, fieldId });
      throw error;
    } finally {
      client.release();
    }
  }
}

export default MatterRepo;

