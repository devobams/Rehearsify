import { Router } from 'express';
import requireAuth from '../../shared/middleware/requireAuth.js';
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

router.get('/service/:id', requireAuth, fetchServiceHandler);

router.get('/drafts', requireAuth, validate(listDraftsQuerySchema, 'query'), listDraftsHandler);

router.post('/draft', requireAuth, validate(createDraftSchema), createDraftHandler);
router.get('/draft/:draftId', requireAuth, getDraftHandler);
router.post('/draft/:draftId/song/:songId', requireAuth, addSongToDraftHandler);
router.delete('/draft/:draftId/song/:songId', requireAuth, removeSongFromDraftHandler);
router.patch('/draft/:draftId/clear', requireAuth, clearDraftHandler);
router.post('/draft/:draftId/clone', requireAuth, validate(cloneDraftSchema), cloneDraftHandler);
router.post('/draft/:draftId/confirm', requireAuth, validate(draftIdParamSchema, 'params'), confirmDraftHandler);
router.delete('/draft/:draftId', requireAuth, deleteDraftHandler);

export default router;
