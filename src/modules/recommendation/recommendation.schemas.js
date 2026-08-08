import { z } from 'zod';

export const serviceIdParamSchema = z.object({
  serviceId: z.string().uuid('Invalid service id'),
});
