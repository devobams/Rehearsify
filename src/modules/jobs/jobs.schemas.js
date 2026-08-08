import { z } from 'zod';

export const runJobQuerySchema = z
  .object({
    job: z.enum(['weeklySongPlanning']).optional().default('weeklySongPlanning'),
    dryRun: z
      .enum(['true', 'false'])
      .optional()
      .default('false')
      .transform((value) => value === 'true'),
    lookaheadDays: z.coerce.number().int().min(1).optional(),
  })
  .strict();
