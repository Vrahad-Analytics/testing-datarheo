import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { connectorController } from '../controllers/connectorController';

const router = Router();

router.use(authenticate);

router.get('/', connectorController.listConnectors);
router.get('/catalog', connectorController.getCatalog);
router.post('/', connectorController.createConnector);
router.get('/:id', connectorController.getConnector);
router.put('/:id', connectorController.updateConnector);
router.delete('/:id', connectorController.deleteConnector);
router.post('/:id/test', connectorController.testConnector);

export { router as connectorRoutes };
