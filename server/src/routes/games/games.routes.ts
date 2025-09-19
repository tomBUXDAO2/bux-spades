import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { Request, Response } from 'express';
import { games } from '../../gamesStore';
import { io } from '../../index';
import { requireAuth } from '../../middleware/auth.middleware';
import { createGame } from './create/gameCreation';
import { enrichGameForClient } from './shared/gameUtils';
import { joinGame } from './join/gameJoining';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    avatar?: string;
  };
}

const router = Router();

// Create a new game
router.post('/', requireAuth, createGame);

// Join a game
router.post('/:id/join', requireAuth, joinGame);

// Get all games
router.get('/', async (req: Request, res: Response) => {
  try {
    // Query games from database instead of in-memory store
    const dbGames = await prisma.game.findMany({
      where: {
        status: {
          in: ["WAITING", "PLAYING"]
        }
      },
      include: {
        GamePlayer: true
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    
    // Convert database games to client format
    const clientGames = dbGames.map((dbGame: any) => {
      const game = games.find(g => g.dbGameId === dbGame.id);
      if (game) {
        // Use in-memory game state if available (for active games)
        return enrichGameForClient(game);
      } else {
        // Convert database game to client format
        return {
          id: dbGame.id,
          status: dbGame.status,
          players: dbGame.GamePlayer.map((p: any) => ({
            id: p.userId,
            username: p.username,
            avatar: p.avatar,
            type: p.isBot ? "bot" : "human",
            position: p.position,
            team: p.team,
            bid: p.bid,
            tricks: p.tricks,
            points: p.points,
            bags: p.bags
          })),
          settings: {
            maxPoints: dbGame.maxPoints,
            allowBlindNil: dbGame.allowBlindNil,
            allowNil: dbGame.allowNil,
            allowDoubleNil: false
          },
          rated: dbGame.rated,
          league: dbGame.league,
          createdAt: dbGame.createdAt
        };
      }
    });
    
    const allGames = clientGames;
    res.json({
      success: true,
      games: allGames
    });
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch games'
    });
  }
});

// Get a specific game
router.get('/:id', async (req: Request, res: Response) => {
  try {
    // First try to find in-memory game
    let game = games.find(g => g.id === req.params.id);
    
    // If not found in memory, query database
    if (!game) {
      const dbGame = await prisma.game.findUnique({
        where: { id: req.params.id },
        include: { GamePlayer: true }
      });
      
      if (dbGame) {
        // Convert database game to client format
        game = {
          id: dbGame.id,
          status: dbGame.status,
          players: dbGame.GamePlayer.map((p: any) => ({
            id: p.userId,
            username: p.username,
            avatar: p.avatar,
            type: p.isBot ? "bot" : "human",
            position: p.position,
            team: p.team,
            bid: p.bid,
            tricks: p.tricks,
            points: p.points,
            bags: p.bags
          })),
          settings: {
            maxPoints: dbGame.maxPoints,
            allowBlindNil: dbGame.allowBlindNil,
            allowNil: dbGame.allowNil,
            allowDoubleNil: false
          },
          rated: dbGame.rated,
          league: dbGame.league,
          createdAt: dbGame.createdAt
        } as any;
      }
    }
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    res.json({
      success: true,
      game
    });
  } catch (error) {
    console.error('Error fetching game:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch game'
    });
  }
});

// Leave a game
router.post('/:id/leave', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gameId = req.params.id;
    const userId = (req as AuthenticatedRequest).user!.id;

    const game = games.find(g => g.id === gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Remove from players
    // Make user leave the socket room
    const userSocket = [...io.sockets.sockets.values()].find(s => (s as any).userId === userId);
    if (userSocket) {
      userSocket.leave(gameId);
      console.log(`[LEAVE GAME] User ${userId} left socket room ${gameId}`);
    }
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

    // Emit game update to all players in the room first
    io.to(gameId).emit('game_update', enrichGameForClient(game));
    
    // If no human players remain and not a league game, remove game
    const hasHumanPlayers = game.players.some(p => p && p.type === 'human');
    const isLeague = Boolean((game as any).league);

    if (!hasHumanPlayers && !isLeague) {
      const index = games.findIndex(g => g.id === gameId);
      if (index !== -1) games.splice(index, 1);
    }
    
    // Update lobby for all clients
    const lobbyGames = games.filter(g => {
      if ((g as any).league && g.status === 'WAITING') {
        return false;
      }
      return true;
    });
    console.log(`[LEAVE GAME] Connected sockets: ${io.sockets.sockets.size}`);
    console.log(`[LEAVE GAME] Emitting games_updated to all clients, ${lobbyGames.length} games`);
    io.emit('games_updated', lobbyGames.map(g => enrichGameForClient(g)));
    
    // Also emit all games (including league games) for real-time league game detection
    console.log(`[LEAVE GAME] Emitting all_games_updated to all clients, ${games.length} total games`);
    io.emit('all_games_updated', games.map(g => enrichGameForClient(g)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error leaving game:', error);
    res.status(500).json({ error: 'Failed to leave game' });
  }
});

export default router;
