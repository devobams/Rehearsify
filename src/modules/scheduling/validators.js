import { z } from 'zod';

const seasons = ['ADVENT', 'CHRISTMAS', 'LENT', 'EASTER', 'PENTECOST', 'ORDINARY'];

function rangeCheck(min, max) {
  if (min == null || max == null) return true;
  return min <= max;
}

export const createServiceSchema = z
  .object({
    eventTypeId: z.string().uuid(),
    date: z.coerce.date(),
    season: z.enum(seasons),
    minSongCount: z.number().int().positive().optional(),
    maxSongCount: z.number().int().positive().optional(),
  })
  .refine((data) => rangeCheck(data.minSongCount, data.maxSongCount), {
    message: 'minSongCount must not exceed maxSongCount',
    path: ['minSongCount'],
  });

export const updateServiceSchema = z.object({
  date: z.coerce.date().optional(),
  season: z.enum(seasons).optional(),
  minSongCount: z.number().int().positive().nullable().optional(),
  maxSongCount: z.number().int().positive().nullable().optional(),
});

export function createMergedUpdateSchema(currentService) {
  return updateServiceSchema.refine(
    (patch) => {
      const min = Object.prototype.hasOwnProperty.call(patch, 'minSongCount')
        ? patch.minSongCount
        : currentService.minSongCount;
      const max = Object.prototype.hasOwnProperty.call(patch, 'maxSongCount')
        ? patch.maxSongCount
        : currentService.maxSongCount;
      return rangeCheck(min, max);
    },
    {
      message: 'minSongCount must not exceed maxSongCount',
      path: ['minSongCount'],
    },
  );
}
