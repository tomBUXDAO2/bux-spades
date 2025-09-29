import { Router } from 'express';
import oauthRoutes from './facebook/oauth/oauthRoutes';
import callbackRoutes from './facebook/callback/callbackRoutes';

const router = Router();

// Mount OAuth routes
router.use('/', oauthRoutes);

// Mount callback routes
router.use('/', callbackRoutes);

export default router;
