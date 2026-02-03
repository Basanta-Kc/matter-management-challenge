/**
 * Database Query Result Types
 * 
 * These types represent the raw data structures returned from database queries.
 * They use snake_case to match PostgreSQL column naming conventions.
 * 
 * These are separate from the domain types (in ../types.ts) which use camelCase
 * and represent the business logic layer.
 */

import { CurrencyValue } from '../../types.js';

/**
 * Result type for the main matters list query
 */
export interface MatterQueryRow {
  id: string;
  board_id: string;
  created_at: string;
  updated_at: string;
  first_transition_at: string | null;
  done_transition_at: string | null;
  current_status_group_name: string;
  resolution_time_ms: string | null;
  sla_status: string;
}

/**
 * Result type for field metadata lookup
 */
export interface FieldInfoRow {
  id: string;
  field_type: 'text' | 'number' | 'select' | 'date' | 'currency' | 'boolean' | 'status' | 'user';
}

/**
 * Result type for count queries
 */
export interface CountRow {
  total: string;
}

/**
 * Result type for matter basic info query
 */
export interface MatterBasicRow {
  id: string;
  board_id: string;
  created_at: string;
  updated_at: string;
}

/**
 * Result type for batch field values query
 * 
 * This query JOINs multiple tables to get field values along with
 * their display information (user names, option labels, etc.)
 */
export interface FieldValueRow {
  ticket_id: string;
  id: string;
  ticket_field_id: string;
  field_name: string;
  field_type: 'text' | 'number' | 'select' | 'date' | 'currency' | 'boolean' | 'status' | 'user';
  // Value columns (one per field type)
  text_value: string | null;
  string_value: string | null;
  number_value: string | null;
  date_value: string | null;
  boolean_value: boolean | null;
  currency_value: CurrencyValue | null;
  user_value: number | null;
  select_reference_value_uuid: string | null;
  status_reference_value_uuid: string | null;
  // Joined display data
  user_id: number;
  user_email: string ;
  user_first_name: string;
  user_last_name: string;
  select_option_label: string;
  status_option_label: string;
  status_group_name: string;
}
