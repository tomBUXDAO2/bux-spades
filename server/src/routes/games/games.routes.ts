import { Router } from 'express';
import { Request, Response } from 'express';
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

// Spectate a game (DB-only)
router.post('/:id/spectate', requireAuth, async (req: any, res: Response) => {
  try {
    const gameId = req.params.id;
    const userId = (req as AuthenticatedRequest).user!.id;
    const { username: bodyUsername, avatar: bodyAvatar } = req.body || {};

    // Ensure game exists
    const dbGame = await prisma.game.findUnique({ where: { id: gameId } });
    if (!dbGame) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Prevent joining as both player and spectator
    const existingPlayer = await prisma.gamePlayer.findFirst({ where: { gameId, userId } });
    if (existingPlayer) {
      return res.status(400).json({ error: 'Already joined as player' });
    }

    // Load latest user profile for name/avatar fallback
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const username = bodyUsername || user?.username || `User ${userId.slice(-4)}`;
    const avatar = bodyAvatar || user?.avatarUrl || null;

    // Join the game room
    req.socket.join(gameId);

    // Notify all players in the game
    io.to(gameId).emit('spectator_joined', {
      id: userId,
      username,
      avatar
    });

    res.json(enrichedGame || { success: true });
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
          teamIndex: p.teamIndex ?? null,
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
        teamIndex: p.teamIndex ?? null,
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

// Leave a game (DB-only)
router.post('/:id/leave', requireAuth, async (req: any, res: Response) => {
  try {
    const gameId = req.params.id;
    const userId = (req as AuthenticatedRequest).user!.id;

    // Find player in this game
    const player = await prisma.gamePlayer.findFirst({ where: { gameId, userId } });
    if (!player) {
      return res.status(400).json({ error: 'Not in this game' });
    }

    // Remove player from game
    await prisma.gamePlayer.delete({ where: { id: player.id } });

    // Leave the game room
    req.socket.leave(gameId);

    // Notify other players
    io.to(gameId).emit('player_left', {
      userId,
      seatIndex: player.seatIndex
    });

    // If no human players remain and game is not rated, delete the game entirely
    const [remainingHumans, dbGame] = await Promise.all([
      prisma.gamePlayer.count({ where: { gameId, isHuman: true } }),
      prisma.game.findUnique({ where: { id: gameId } })
    ]);

    const isRated = (dbGame as any)?.isRated ?? false;

    if (remainingHumans === 0 && !isRated) {
      console.log(`[LEAVE GAME] No human players remaining in unrated game ${gameId} - deleting game`);
      io.to(gameId).emit('game_deleted', { reason: 'no_human_players' });
      try {
        // Delete game and related rows
        await prisma.game.delete({ where: { id: gameId } });
        console.log('[LEAVE GAME] Successfully deleted unrated game from database');
      } catch (err) {
        console.error('[LEAVE GAME] Failed to delete unrated game:', err);
      }
    }

    res.json(enrichedGame || { success: true });
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

    const game = await prisma.game.findUnique({ where: { id: gameId } });
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
    const filledSeats = await prisma.gamePlayer.count({ where: { gameId, isHuman: true } });
    if (filledSeats < 4) {
      return res.status(400).json({ error: 'All seats must be filled to start the game' });
    }

    // Start the game
    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: 'BIDDING',
        bidding: {
          currentPlayer: "0",
          bids: [null, null, null, null],
        }
      }
    });

    // Notify all players
    io.to(gameId).emit('game_started', enrichGameForClient(game));
    io.emit('games_updated', [enrichGameForClient(game)]);

    res.json({ success: true, game: enrichGameForClient(game) });
  } catch (error) {
    console.error('Error starting game:', error);
    res.status(500).json({ error: 'Failed to start game' });
  }
});

// Get lobby games (for homepage)
router.get('/lobby/all', async (req: Request, res: Response) => {
  try {
    const lobbyGames = await prisma.game.findMany({
      where: { status: 'WAITING' },
      orderBy: { createdAt: 'desc' as any }
    });
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
    const allGames = await prisma.game.findMany({
      where: { status: { in: ['WAITING', 'BIDDING', 'PLAYING'] } },
      orderBy: { createdAt: 'desc' as any }
    });
    const enrichedGames = allGames.map(game => enrichGameForClient(game));
    res.json({ success: true, games: enrichedGames });
  } catch (error) {
    console.error('Error fetching all games:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch all games' });
  }
});

export default router;

// Remove a bot from a seat (pre-game)
router.post('/:id/remove-bot', requireAuth, async (req: any, res: Response) => {
  try {
    const gameId = req.params.id;
    const { seatIndex, requesterId } = req.body;
    const userId = (req as AuthenticatedRequest).user!.id;

    // Validate requester
    if (requesterId !== userId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Find the game
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: { gamePlayers: { include: { user: true } } }
    });

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Check if game is in waiting state
    if (game.status !== 'WAITING') {
      return res.status(400).json({ error: 'Game already started' });
    }

    // Validate seat index
    if (seatIndex < 0 || seatIndex > 3) {
      return res.status(400).json({ error: 'Invalid seat index' });
    }

    // Find the player at this seat
    const playerToRemove = game.gamePlayers.find(gp => gp.seatIndex === seatIndex);
    if (!playerToRemove) {
      return res.status(400).json({ error: 'No player at this seat' });
    }

    // Check if it's a bot
    if (playerToRemove.isHuman) {
      return res.status(400).json({ error: 'Cannot remove human players' });
    }

    // Check if requester is the game creator (host)
    if (game.createdById !== userId) {
      return res.status(403).json({ error: 'Only the game creator can remove bots' });
    }

    // Remove the bot from the database
    await prisma.gamePlayer.delete({
      where: { id: playerToRemove.id }
    });

    // Also delete the bot user if it's a bot
    if (playerToRemove.userId.startsWith('bot_')) {
      await prisma.user.delete({
        where: { id: playerToRemove.userId }
      });
    }

    // Get updated game and emit to clients
    const updatedGame = await prisma.game.findUnique({
      where: { id: gameId },
      include: { gamePlayers: { include: { user: true } } }
    });

    let enrichedGame = null;
    if (updatedGame) {
      enrichedGame = enrichGameForClient(updatedGame);
      io.to(gameId).emit("game_update", enrichedGame);
    }

    console.log(`[REMOVE BOT] Successfully removed bot from seat ${seatIndex} in game ${gameId}`);
    res.json(enrichedGame || { success: true });
  } catch (error) {
    console.error('Error removing bot:', error);
    res.status(500).json({ error: 'Failed to remove bot' });
  }
});

