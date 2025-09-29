import { Router } from 'express';
import oauthRoutes from './discord/oauthRoutes';
import facebookRoutes from './discord/facebookRoutes';
import webhookRoutes from './discord/webhookRoutes';

const router = Router();

// Mount all Discord-related routes
router.use('/', oauthRoutes);
router.use('/', facebookRoutes);
router.use('/', webhookRoutes);

export default router;
