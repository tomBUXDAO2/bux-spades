// Main games routes - now modularized
import { Router } from 'express';
import gameCreationRoutes from './game-ops/gameCreation';
import gameLogicRoutes from './game-ops/gameLogic';
import { updateStatsAndCoins, enrichGameForClient, logGameStart, updateGamePlayerRecord } from './game-ops/gameStats';

const router = Router();

// Mount sub-routes
router.use('/', gameCreationRoutes);
router.use('/', gameLogicRoutes);

// Export functions that other modules need
export { updateStatsAndCoins, enrichGameForClient, logGameStart, updateGamePlayerRecord };

export default router;
