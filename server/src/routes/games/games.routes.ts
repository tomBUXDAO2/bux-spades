import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { rateLimit } from '../../middleware/rateLimit.middleware';

// Import modular route handlers
import { createGame } from './create';
import { joinGame } from './join';
import { getAllGames, getGameById } from './status';
import { logGameStart } from './database';

const router = Router();

// Validation schemas
const createGameSchema = z.object({
  gameMode: z.enum(['SOLO', 'PARTNERS']),
  maxPoints: z.number().int().min(-1000).max(10000),
  minPoints: z.number().int().min(-10000).max(1000),
  buyIn: z.number().int().min(0).max(100000000),
  biddingOption: z.string().optional(),
  specialRules: z.any().optional(),
  league: z.boolean().optional(),
  creatorId: z.string().optional(),
  creatorName: z.string().optional(),
  creatorImage: z.string().nullable().optional(),
  gameType: z.string().optional(),
  players: z.array(z.object({
    userId: z.string().optional(),
    discordId: z.string().optional(),
    username: z.string(),
    avatar: z.string().nullable().optional(),
    seat: z.number().int().min(0).max(3)
  })).optional()
});

// Routes
router.post('/', rateLimit({ key: 'create_game', windowMs: 10_000, max: 5 }), requireAuth, validate(createGameSchema), createGame);
router.get('/', getAllGames);
router.get('/:id', getGameById);
router.post('/:id/join', rateLimit({ key: 'join_game', windowMs: 5_000, max: 10 }), requireAuth, joinGame);

// Export the logGameStart function for use in other modules
export { logGameStart };

export default router;
