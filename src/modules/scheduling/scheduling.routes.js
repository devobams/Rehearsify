import { Router } from 'express';
import requireAuth from '../../shared/middleware/requireAuth.js';
import requireRole from '../../shared/middleware/requireRole.js';
import {
  createServiceHandler,
  getServiceHandler,
  listServicesHandler,
  updateServiceHandler,
  deleteServiceHandler,
  updateServiceStatusHandler,
} from './scheduling.controller.js';

const router = Router();

router.use(requireAuth);

// RBAC: directors/admins create and edit services; only admins delete.
const requireManager = requireRole('ADMINISTRATOR', 'CHOIR_DIRECTOR');
const requireAdmin = requireRole('ADMINISTRATOR');

router.post('/', requireManager, createServiceHandler);
router.get('/', listServicesHandler);
router.get('/:id', getServiceHandler);
router.patch('/:id', requireManager, updateServiceHandler);
router.delete('/:id', requireAdmin, deleteServiceHandler);
router.patch('/:id/status', requireManager, updateServiceStatusHandler);

export default router;