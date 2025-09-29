import { Router } from 'express';
import userListRoutes from './user-list/userListRoutes';
import userStatsRoutes from './user-stats/userStatsRoutes';

const router = Router();

// Mount user list routes
router.use('/', userListRoutes);

// Mount user stats routes
router.use('/', userStatsRoutes);

export default router;
