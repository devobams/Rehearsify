import { z } from 'zod';

export const SEASONS = [
  'ADVENT',
  'CHRISTMAS',
  'LENT',
  'EASTER',
  'PENTECOST',
  'ORDINARY',
];

export const seasonSchema = z.enum(SEASONS);