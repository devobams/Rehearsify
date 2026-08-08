// routes/index.js
import { Router } from 'express';


import authRoutes from '../modules/auth/auth.routes.js';
import repertoireRoutes from '../modules/repertoire/repertoire.routes.js';
import schedulingRoutes from '../modules/scheduling/scheduling.routes.js';
import performanceRoutes from '../modules/performance-history/performance.routes.js';
import recommendationRoutes from '../modules/recommendation/recommendation.routes.js';
import planningRoutes from '../modules/planning-reporting/planning.routes.js';
import reportingRoutes from '../modules/planning-reporting/reporting.routes.js';
import healthRoutes from '../modules/health/health.routes.js';
import jobsRoutes from '../modules/jobs/jobs.routes.js';

const router = Router();

router.use('/health', healthRoutes);

router.use('/auth', authRoutes);
router.use('/songs', repertoireRoutes);
router.use('/services', schedulingRoutes);
router.use('/performances', performanceRoutes);
router.use('/recommendations', recommendationRoutes);
router.use('/plans', planningRoutes);
router.use('/reports', reportingRoutes);
router.use('/admin/jobs', jobsRoutes);

export default router;