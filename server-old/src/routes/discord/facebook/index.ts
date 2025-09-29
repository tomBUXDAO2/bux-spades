import { Router } from 'express';
import oauthRoutes from './oauth/oauthRoutes';
import callbackRoutes from './callback/callbackRoutes';

const router = Router();

// Mount OAuth routes
router.use('/', oauthRoutes);

// Mount callback routes
router.use('/', callbackRoutes);

export default router;
