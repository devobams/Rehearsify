import { Router } from 'express';

import {
  getLastPerformedHandler,
  getPerformanceCountsHandler,
} from './performance.controller.js';

import requireAuth from '../../shared/middleware/requireAuth.js';
import validate from '../../shared/middleware/validate.js';
import { songIdsSchema } from './performance.schemas.js';

const router = Router();

router.use(requireAuth);

// Read endpoints
router.get('/last-performed', validate(songIdsSchema, 'query'), getLastPerformedHandler);
router.get('/counts', validate(songIdsSchema, 'query'), getPerformanceCountsHandler);

export default router;
