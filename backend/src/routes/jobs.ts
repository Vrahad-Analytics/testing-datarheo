import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { jobController } from '../controllers/jobController';

const router = Router();

router.use(authenticate);

router.get('/', jobController.listJobs);
router.get('/:id', jobController.getJob);
router.post('/:id/cancel', jobController.cancelJob);
router.get('/:id/logs', jobController.getJobLogs);

export { router as jobRoutes };
