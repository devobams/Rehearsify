import { Router } from 'express';
import requireAuth from '../../shared/middleware/requireAuth.js';
import validate from '../../shared/middleware/validate.js';
import { staleSongsQuerySchema } from './reporting.schemas.js';
import { staleSongsHandler, performanceFrequencyHandler } from './reporting.controller.js';

const router = Router();

router.get('/stale-songs', requireAuth, validate(staleSongsQuerySchema, 'query'), staleSongsHandler);
router.get('/performance-frequency', requireAuth, performanceFrequencyHandler);

export default router;