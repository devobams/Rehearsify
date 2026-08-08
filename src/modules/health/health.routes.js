import { Router } from 'express';
import * as model from './health.model.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    await model.checkDatabase();
    res.status(200).json({ status: 'ok', database: 'reachable' });
  } catch (err) {
    res.status(503).json({ status: 'error', database: 'unreachable' });
  }
});

export default router;
