import { z } from 'zod';
import { seasonSchema } from '../../shared/constants/seasons.js';

export const createSongSchema = z.object({
  title: z.string().trim().min(1, 'Title is required'),
  composer: z.string().trim().min(1, 'Composer is required'),
  voicing: z.string().trim().min(1, 'Voicing is required'),
  difficulty: z.number().int().min(1, 'Difficulty must be at least 1').max(5, 'Difficulty cannot exceed 5'),
  season: seasonSchema,
  language: z.string().trim().min(1, 'Language is required'),
  sheetUrl: z.string().url().optional(),
});

export const updateSongSchema = createSongSchema.partial();

export const listSongsQuerySchema = z.object({
  season: seasonSchema.optional(),
  voicing: z.string().trim().optional(),
  difficulty: z.coerce.number().int().min(1).max(5).optional(),
  active: z.coerce.boolean().optional(),
});

export const idParamSchema = z.object({
  id: z.string().uuid('Invalid song id'),
});