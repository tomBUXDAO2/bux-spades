import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { rateLimit } from '../../middleware/rateLimit.middleware';
import { games } from '../../gamesStore';
import { io } from '../../index';
import { enrichGameForClient } from './shared/gameUtils';

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

// Leave table route (used by client leave button)
router.post('/:id/leave', requireAuth, (req, res) => {
  try {
    const gameId = req.params.id;
    const userId = (req as AuthenticatedRequest).user!.id;

    const game = games.find(g => g.id === gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Remove from players
    const playerIdx = game.players.findIndex(p => p && p.id === userId);
    if (playerIdx !== -1) {
      game.players[playerIdx] = null;
    }

    // Remove from spectators
    if (Array.isArray((game as any).spectators)) {
      const specIdx = (game as any).spectators.findIndex((s: any) => s.id === userId);
      if (specIdx !== -1) {
        (game as any).spectators.splice(specIdx, 1);
      }
    }

    // If no human players remain and not a league game, remove game
    const hasHumanPlayers = game.players.some(p => p && p.type === 'human');
    const isLeague = Boolean((game as any).league);

    if (!hasHumanPlayers && !isLeague) {
      const idx = games.findIndex(g => g.id === gameId);
      if (idx !== -1) {
        games.splice(idx, 1);
      }
      io.emit('games_updated', games);
      return res.json({ success: true, removed: true });
    }

    // Emit updates
    io.to(game.id).emit('game_update', enrichGameForClient(game));
    io.emit('games_updated', games);

    return res.json({ success: true, game: enrichGameForClient(game) });
  } catch (error) {
    console.error('[LEAVE TABLE] Error:', error);
    return res.status(500).json({ error: 'Failed to leave table' });
  }
});

// Export the logGameStart function for use in other modules
export { logGameStart };

export default router;
