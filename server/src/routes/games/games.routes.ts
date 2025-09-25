import { Router } from 'express';
import { Request, Response } from 'express';
import { games } from '../../gamesStore';
import { io } from '../../index';
import { requireAuth } from '../../middleware/auth.middleware';
import { createGame } from './create/gameCreation';
import { enrichGameForClient } from './shared/gameUtils';
import { deleteUnratedGameFromDatabase } from '../../lib/hand-completion/game/gameCompletion';
import { joinGame } from './join/gameJoining';
import { prisma } from '../../lib/prisma';

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

// Spectate a game
router.post('/:id/spectate', requireAuth, async (req: any, res: Response) => {
  try {
    const gameId = req.params.id;
    const userId = (req as AuthenticatedRequest).user!.id;
    const { username, avatar } = req.body;

    const game = games.find(g => g.id === gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Prevent duplicate spectate
    if ((game as any).spectators?.some((s: any) => s.id === userId)) {
      return res.status(400).json({ error: 'Already spectating' });
    }

    // Prevent joining as both player and spectator
    if (game.players.some(p => p && p.id === userId)) {
      return res.status(400).json({ error: 'Already joined as player' });
    }

    // Initialize spectators array if it doesn't exist
    if (!(game as any).spectators) {
      (game as any).spectators = [];
    }

    // Add spectator
    (game as any).spectators.push({
      id: userId,
      username,
      avatar
    });

    // Join the game room
    req.socket.join(gameId);

    // Notify all players in the game
    io.to(gameId).emit('spectator_joined', {
      id: userId,
      username,
      avatar
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error spectating game:', error);
    res.status(500).json({ error: 'Failed to spectate game' });
  }
});

// Get all games - NEW DB ONLY
router.get('/', async (req: Request, res: Response) => {
  try {
    // Query games from NEW database
    const dbGames = await prisma.game.findMany({
      where: {
        status: { in: ['WAITING' as any, 'BIDDING' as any, 'PLAYING' as any] }
      },
      orderBy: { createdAt: 'desc' as any }
    });

    // For each game, fetch players from GamePlayer
    const clientGames = [] as any[];
    for (const dbGame of dbGames) {
      const players = await prisma.gamePlayer.findMany({
        where: { gameId: dbGame.id },
        orderBy: { seatIndex: 'asc' as any }
      });

      const userIds = players.map(p => p.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } }
      });
      const userMap = new Map(users.map(u => [u.id, u]));

      clientGames.push({
        id: dbGame.id,
        status: dbGame.status,
        mode: (dbGame as any).mode || 'PARTNERS',
        rated: (dbGame as any).isRated ?? false,
        league: (dbGame as any).isLeague ?? false,
        solo: ((dbGame as any).mode === 'SOLO') || false,
        players: players.map(p => ({
          id: p.userId,
          username: userMap.get(p.userId)?.username || `Bot ${p.userId.slice(-4)}`,
          avatarUrl: userMap.get(p.userId)?.avatarUrl || null,
          type: p.isHuman ? 'human' : 'bot',
          seatIndex: p.seatIndex,
          team: p.teamIndex ?? null,
          bid: null as any,
          tricks: null as any,
          points: null as any,
          bags: null as any
        })),
        rules: {
          minPoints: (dbGame as any).minPoints || 500,
          maxPoints: (dbGame as any).maxPoints || 500,
          allowNil: (dbGame as any).allowNil ?? true,
          allowBlindNil: (dbGame as any).allowBlindNil ?? false,
          assassin: (dbGame as any).assassin ?? false,
          screamer: (dbGame as any).screamer ?? false
        },        createdAt: (dbGame as any).createdAt
      });
    }

    res.json({ success: true, games: clientGames });
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch games' });
  }
});

// Get a specific game - NEW DB ONLY
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const gameId = req.params.id;
    
    const dbGame = await prisma.game.findUnique({
      where: { id: gameId }
    });

    if (!dbGame) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const players = await prisma.gamePlayer.findMany({
      where: { gameId: dbGame.id },
      orderBy: { seatIndex: 'asc' as any }
    });

    const userIds = players.map(p => p.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } }
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    const game = {
      id: dbGame.id,
      status: dbGame.status,
      mode: (dbGame as any).mode || 'PARTNERS',
      rated: (dbGame as any).isRated ?? false,
      league: (dbGame as any).isLeague ?? false,
      solo: ((dbGame as any).mode === 'SOLO') || false,
      players: players.map(p => ({
        id: p.userId,
        username: userMap.get(p.userId)?.username || `Bot ${p.userId.slice(-4)}`,
        avatarUrl: userMap.get(p.userId)?.avatarUrl || null,
        type: p.isHuman ? 'human' : 'bot',
        seatIndex: p.seatIndex,
        team: p.teamIndex ?? null,
        bid: null as any,
        tricks: null as any,
        points: null as any,
        bags: null as any
      })),
        rules: {
          minPoints: (dbGame as any).minPoints || 500,
          maxPoints: (dbGame as any).maxPoints || 500,
          allowNil: (dbGame as any).allowNil ?? true,
          allowBlindNil: (dbGame as any).allowBlindNil ?? false,
          assassin: (dbGame as any).assassin ?? false,
          screamer: (dbGame as any).screamer ?? false
        },      createdAt: (dbGame as any).createdAt
    };

    res.json({ success: true, game });
  } catch (error) {
    console.error('Error fetching game:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch game' });
  }
});

// Join a game
router.post('/:id/join', requireAuth, joinGame);

// Leave a game
router.post('/:id/leave', requireAuth, async (req: any, res: Response) => {
  try {
    const gameId = req.params.id;
    const userId = (req as AuthenticatedRequest).user!.id;

    const game = games.find(g => g.id === gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Remove player from game
    const playerIndex = game.players.findIndex(p => p && p.id === userId);
    if (playerIndex === -1) {
      return res.status(400).json({ error: 'Not in this game' });
    }

    game.players[playerIndex] = null;

    // Leave the game room
    req.socket.leave(gameId);

    // Notify other players
    io.to(gameId).emit('player_left', {
      userId,
      seatIndex: playerIndex
    });

    // Check if game should be deleted (unrated games with no human players)
    const humanPlayersRemaining = game.players.some(p => p && p.type === 'human');
    if (!humanPlayersRemaining && !game.rated) {
      console.log(`[LEAVE GAME] No human players remaining in unrated game ${gameId} - deleting game`);
      io.to(gameId).emit('game_deleted', { reason: 'no_human_players' });
      try {
        await deleteUnratedGameFromDatabase(game);
        console.log('[LEAVE GAME] Successfully deleted unrated game from database');
      } catch (err) {
        console.error('[LEAVE GAME] Failed to delete unrated game:', err);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error leaving game:', error);
    res.status(500).json({ error: 'Failed to leave game' });
  }
});

// Start a game
router.post('/:id/start', requireAuth, async (req: any, res: Response) => {
  try {
    const gameId = req.params.id;
    const userId = (req as AuthenticatedRequest).user!.id;

    const game = games.find(g => g.id === gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Check if user is the creator
    if (game.createdById !== userId) {
      return res.status(403).json({ error: 'Only the game creator can start the game' });
    }

    // Check if game is in waiting state
    if (game.status !== 'WAITING') {
      return res.status(400).json({ error: 'Game is not in waiting state' });
    }

    // Check if all seats are filled
    const filledSeats = game.players.filter(p => p !== null).length;
    if (filledSeats < 4) {
      return res.status(400).json({ error: 'All seats must be filled to start the game' });
    }

    // Start the game
    game.status = 'BIDDING';
    game.bidding = {
      currentPlayer: 0,
      bids: [null, null, null, null],
      completed: false
    };

    // Notify all players
    io.to(gameId).emit('game_started', enrichGameForClient(game));
    io.emit('games_updated', games.map(g => enrichGameForClient(g)));

    res.json({ success: true, game: enrichGameForClient(game) });
  } catch (error) {
    console.error('Error starting game:', error);
    res.status(500).json({ error: 'Failed to start game' });
  }
});

// Get lobby games (for homepage)
router.get('/lobby/all', async (req: Request, res: Response) => {
  try {
    const lobbyGames = games.filter(g => g.status === 'WAITING');
    const enrichedGames = lobbyGames.map(game => enrichGameForClient(game));
    res.json({ success: true, games: enrichedGames });
  } catch (error) {
    console.error('Error fetching lobby games:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch lobby games' });
  }
});

// Get all games (for homepage)
router.get('/all', async (req: Request, res: Response) => {
  try {
    const allGames = games.filter(g => ['WAITING', 'BIDDING', 'PLAYING'].includes(g.status));
    const enrichedGames = allGames.map(game => enrichGameForClient(game));
    res.json({ success: true, games: enrichedGames });
  } catch (error) {
    console.error('Error fetching all games:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch all games' });
  }
});

export default router;
