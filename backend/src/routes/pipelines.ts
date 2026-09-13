import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { pipelineController } from '../controllers/pipelineController';

const router = Router();

router.use(authenticate);

router.get('/', pipelineController.listPipelines);
router.post('/', pipelineController.createPipeline);
router.get('/:id', pipelineController.getPipeline);
router.put('/:id', pipelineController.updatePipeline);
router.delete('/:id', pipelineController.deletePipeline);
router.post('/:id/run', pipelineController.runPipeline);
router.post('/:id/pause', pipelineController.pausePipeline);
router.post('/:id/resume', pipelineController.resumePipeline);

export { router as pipelineRoutes };
