import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { userController } from '../controllers/userController';

const router = Router();

router.use(authenticate);

router.get('/profile', userController.getProfile);
router.put('/profile', userController.updateProfile);
router.get('/api-keys', userController.getApiKeys);
router.post('/api-keys', userController.createApiKey);
router.delete('/api-keys/:id', userController.deleteApiKey);

// Admin routes
router.get('/', authorize('ADMIN', 'SUPER_ADMIN'), userController.listUsers);
router.get('/:id', authorize('ADMIN', 'SUPER_ADMIN'), userController.getUser);
router.put('/:id', authorize('ADMIN', 'SUPER_ADMIN'), userController.updateUser);
router.delete('/:id', authorize('SUPER_ADMIN'), userController.deleteUser);

export { router as userRoutes };
