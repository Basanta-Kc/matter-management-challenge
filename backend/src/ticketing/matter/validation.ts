import { z } from 'zod';

// Valid sortable fields - must match what frontend sends
const SORTABLE_FIELDS = [
  'subject',
  'Case Number',
  'Status',
  'Assigned To',
  'Priority',
  'Contract Value',
  'Due Date',
  'Urgent',
  'Resolution Time',
  'SLA',
  'created_at',
  'updated_at',
] as const;

// Query schema for GET /matters
export const getMattersQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .refine((val) => val > 0, { message: 'Page must be greater than 0' }),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 25))
    .refine((val) => val > 0 && val <= 100, { message: 'Limit must be between 1 and 100' }),
  sortBy: z
    .enum(SORTABLE_FIELDS, {
      errorMap: () => ({ message: 'Invalid sort field' }),
    })
    .optional()
    .default('created_at'),
  sortOrder: z.enum(['asc', 'desc'], {
    errorMap: () => ({ message: 'Sort order must be asc or desc' }),
  }).optional().default('desc'),
  search: z
    .string()
    .optional()
    .default('')
    .transform((val) => val.trim())
    .refine((val) => val.length <= 200, { message: 'Search term too long' }),
});

// Params schema for GET /matters/:id
export const matterIdParamsSchema = z.object({
  id: z.string().uuid({ message: 'Invalid matter ID format' }),
});

// Body schema for PATCH /matters/:id
export const updateMatterBodySchema = z.object({
  fieldId: z.string().uuid({ message: 'Invalid field ID format' }),
  fieldType: z.enum(['text', 'number', 'select', 'date', 'currency', 'boolean', 'status', 'user'], {
    errorMap: () => ({ message: 'Invalid field type' }),
  }),
  value: z.any(),
});
