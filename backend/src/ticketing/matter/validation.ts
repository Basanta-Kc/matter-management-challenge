import { z } from 'zod';

// Query schema for GET /matters
export const getMattersQuerySchema = z.object({
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 25)),
  sortBy: z.string().optional().default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  search: z.string().optional().default(''),
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
