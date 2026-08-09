import { Router } from 'express';
import requireAuth from '../../shared/middleware/requireAuth.js';
import requireRole from '../../shared/middleware/requireRole.js';
import validate from '../../shared/middleware/validate.js';
import {
  createDraftSchema,
  cloneDraftSchema,
  listDraftsQuerySchema,
  draftIdParamSchema,
} from './planning.schemas.js';
import {
  fetchServiceHandler,
  createDraftHandler,
  addSongToDraftHandler,
  removeSongFromDraftHandler,
  getDraftHandler,
  deleteDraftHandler,
  listDraftsHandler,
  cloneDraftHandler,
  clearDraftHandler,
  confirmDraftHandler,
} from './planning.controller.js';

const router = Router();

// RBAC: read endpoints are open to any authenticated user; drafting, editing,
// confirming and deleting drafts are director/admin-only.
const requireManager = requireRole('ADMINISTRATOR', 'CHOIR_DIRECTOR');

router.get('/service/:id', requireAuth, fetchServiceHandler);

router.get('/drafts', requireAuth, validate(listDraftsQuerySchema, 'query'), listDraftsHandler);

router.post('/draft', requireAuth, requireManager, validate(createDraftSchema), createDraftHandler);
router.get('/draft/:draftId', requireAuth, getDraftHandler);
router.post('/draft/:draftId/song/:songId', requireAuth, requireManager, addSongToDraftHandler);
router.delete('/draft/:draftId/song/:songId', requireAuth, requireManager, removeSongFromDraftHandler);
router.patch('/draft/:draftId/clear', requireAuth, requireManager, clearDraftHandler);
router.post('/draft/:draftId/clone', requireAuth, requireManager, validate(cloneDraftSchema), cloneDraftHandler);
router.post('/draft/:draftId/confirm', requireAuth, requireManager, validate(draftIdParamSchema, 'params'), confirmDraftHandler);
router.delete('/draft/:draftId', requireAuth, requireManager, deleteDraftHandler);

export default router;
