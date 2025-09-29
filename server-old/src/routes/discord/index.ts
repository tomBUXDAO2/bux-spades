import { Router } from 'express';
import oauthRoutes from './oauthRoutes';
import facebookRoutes from './facebookRoutes';
import webhookRoutes from './webhookRoutes';

const router = Router();

// Mount all Discord-related routes
router.use('/', oauthRoutes);
router.use('/', facebookRoutes);
router.use('/', webhookRoutes);

export default router;
