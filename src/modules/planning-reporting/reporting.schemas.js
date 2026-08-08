import { z } from 'zod';

// Cap `days` to something sane — an unbounded value could be used to force
// a full-table scan style query with no practical ceiling.
export const staleSongsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(3650).optional().default(90),
});