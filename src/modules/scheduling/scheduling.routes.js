import { Router } from 'express';
import requireAuth from '../../shared/middleware/requireAuth.js';
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

router.post('/', createServiceHandler);
router.get('/', listServicesHandler);
router.get('/:id', getServiceHandler);
router.patch('/:id', updateServiceHandler);
router.delete('/:id', deleteServiceHandler);
router.patch('/:id/status', updateServiceStatusHandler);

export default router;