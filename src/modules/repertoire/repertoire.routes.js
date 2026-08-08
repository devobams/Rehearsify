import { Router } from 'express';

import multer from 'multer';

import validate from '../../shared/middleware/validate.js';
import requireAuth from '../../shared/middleware/requireAuth.js';
import requireRole from '../../shared/middleware/requireRole.js';
import { 
  createSongSchema, 
  updateSongSchema, 
  listSongsQuerySchema,
  idParamSchema
} from './repertoire.schemas.js';
import {
  createSongHandler,
  listSongsHandler,
  getSongHandler,
  updateSongHandler,
  deleteSongHandler,
  uploadSheetHandler,
  deleteSheetHandler
} from './repertoire.controller.js';

const router = Router();

// Protect ALL routes in this file (applies to GET, POST, PATCH, DELETE)
router.use(requireAuth);

// 2. Attach query validation here!
// Notice requireAuth was removed from listSongsHandler/getSongHandler because router.use(requireAuth) already handles it.
router.get('/', validate(listSongsQuerySchema, 'query'), listSongsHandler);
router.get('/:id', validate(idParamSchema, 'params'), getSongHandler);

const requireManager = requireRole('ADMINISTRATOR', 'CHOIR_DIRECTOR');

// Multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB cap
  },
})


// Only directors/admins can add, edit, or remove songs
router.post('/', requireManager, validate(createSongSchema), createSongHandler);
router.patch('/:id', requireManager, validate(idParamSchema, 'params'), validate(updateSongSchema), updateSongHandler);
router.delete('/:id', requireManager, validate(idParamSchema, 'params'), deleteSongHandler);
// Only choir directors can upload song sheets --> form field must be named "sheet"
router.post('/:id/sheet', requireManager, validate(idParamSchema, 'params'), upload.single('sheet'), uploadSheetHandler);
// only choir directors can delete song sheets
router.delete('/:id/sheet', requireManager, validate(idParamSchema, 'params'), deleteSheetHandler);
export default router;