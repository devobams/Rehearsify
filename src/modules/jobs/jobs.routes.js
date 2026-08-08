import { Router } from 'express';
import requireAuth from '../../shared/middleware/requireAuth.js';
import requireRole from '../../shared/middleware/requireRole.js';
import validate from '../../shared/middleware/validate.js';
import { runJobQuerySchema } from './jobs.schemas.js';
import { runJobHandler } from './jobs.controller.js';

const router = Router();

/**
 * POST /api/admin/jobs/run?job=weeklySongPlanning&dryRun=true
 * Manually trigger a scheduled job. dryRun=true logs what would happen
 * without any DB writes or emails.
 */
router.post(
  '/run',
  requireAuth,
  requireRole('ADMINISTRATOR', 'CHOIR_DIRECTOR'),
  validate(runJobQuerySchema, 'query'),
  runJobHandler,
);

export default router;
