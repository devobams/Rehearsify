import { z } from 'zod';

export const songIdsSchema = z.object({
  songIds: z
    .union([
      z.string().uuid(),
      z.array(z.string().uuid()).min(1).max(200),
    ])
    .transform((value) => (Array.isArray(value) ? value : [value])),
});
