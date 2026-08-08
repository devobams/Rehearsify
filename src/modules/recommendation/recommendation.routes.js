import { Router } from 'express';

import validate from '../../shared/middleware/validate.js';
import requireAuth from '../../shared/middleware/requireAuth.js';

import { getRecommendationsHandler } from './recommendation.controller.js';
import { serviceIdParamSchema } from './recommendation.schemas.js';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/recommendations/:serviceId
 */
router.get(
  '/:serviceId',
  validate(serviceIdParamSchema, 'params'),
  getRecommendationsHandler,
);

export default router;
