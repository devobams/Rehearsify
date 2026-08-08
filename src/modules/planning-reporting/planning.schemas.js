import { z } from 'zod';

export const createDraftSchema = z.object({
  serviceId: z.string().uuid('Invalid service ID'),
  manualAdditions: z.array(z.string().uuid()).optional().default([]),
});

export const cloneDraftSchema = z.object({
  targetServiceId: z.string().uuid('Invalid target service ID'),
});

export const draftIdParamSchema = z.object({
  draftId: z.string().uuid('Invalid draft ID'),
});

const sortFieldEnum = z.enum(['createdAt', 'serviceDate', 'songCount']);
const sortOrderEnum = z.enum(['asc', 'desc']);

export const listDraftsQuerySchema = z.object({
  serviceId: z.string().uuid().optional(),
  status: z.enum(['active', 'deleted', 'all']).optional().default('active'),
  createdAfter: z.coerce.date().optional(),
  createdBefore: z.coerce.date().optional(),
  sortBy: sortFieldEnum.optional().default('serviceDate'),
  sortOrder: sortOrderEnum.optional().default('asc'),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(50),
});
