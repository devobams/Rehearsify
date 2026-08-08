import { Router } from 'express';

import validate from '../../shared/middleware/validate.js';
import requireAuth from '../../shared/middleware/requireAuth.js';
import requireRole from '../../shared/middleware/requireRole.js';

import { registerSchema, loginSchema, changeRoleSchema } from './auth.schemas.js';
import { registerHandler, loginHandler, changeRoleHandler } from './auth.controller.js';

const router = Router();

router.post('/register', validate(registerSchema), registerHandler);
router.post('/login', validate(loginSchema), loginHandler);
router.patch(
  '/users/:id/role',
  requireAuth,
  requireRole('ADMINISTRATOR'),
  validate(changeRoleSchema),
  changeRoleHandler
);

export default router;