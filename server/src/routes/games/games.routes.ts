import { Router } from 'express';
import { Request, Response } from 'express';
import { io } from '../../index';
import { requireAuth } from '../../middleware/auth.middleware';
import { createGame } from './create/gameCreation';
import { enrichGameForClient } from './shared/gameUtils';
import { deleteUnratedGameFromDatabase } from '../../lib/hand-completion/game/gameCompletion';
import { joinGame } from './join/gameJoining';
import { handleStartGame } from "../../modules/socket-handlers/game-start/gameStartHandler";
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
        status: { in: ['WAITING', 'BIDDING', 'PLAYING'] }
      },
      orderBy: { createdAt: 'desc' }
    });

    // For each game, fetch players from GamePlayer
    const clientGames = [] as any[];
    for (const dbGame of dbGames) {
      const players = await prisma.gamePlayer.findMany({
        where: { gameId: dbGame.id },
        orderBy: { seatIndex: 'asc' }
      });

      const userIds = players.map(p => p.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } }
      });
      const userMap = new Map(users.map(u => [u.id, u]));

      // Get current round and bids
      const currentRound = await prisma.round.findFirst({
        where: { gameId: dbGame.id },
        orderBy: { roundNumber: 'desc' }
      });
      
      const bids = currentRound ? await prisma.roundBid.findMany({
        where: { roundId: currentRound.id }
      }) : [];
      
      const bidMap = new Map(bids.map(b => [b.userId, b.bid]));

      clientGames.push({
        id: dbGame.id,
        status: dbGame.status,
        mode: dbGame.mode || 'PARTNERS',
        rated: dbGame.isRated ?? false,
        league: dbGame.isLeague ?? false,
        solo: (dbGame.mode === 'SOLO') || false,
        players: players.map(p => ({
          id: p.userId,
          username: userMap.get(p.userId)?.username || `Bot ${p.userId.slice(-4)}`,
          avatarUrl: userMap.get(p.userId)?.avatarUrl || null,
          type: p.isHuman ? 'human' : 'bot',
          seatIndex: p.seatIndex,
          teamIndex: p.teamIndex ?? null,
          bid: bidMap.get(p.userId) ?? null,
          tricks: null as number | null,
          points: null as number | null,
          bags: null as number | null
        })),
        rules: {
          minPoints: dbGame.minPoints || 500,
          maxPoints: dbGame.maxPoints || 500,
          allowNil: dbGame.nilAllowed ?? true,
          allowBlindNil: dbGame.blindNilAllowed ?? false,
          assassin: false, // TODO: Extract from specialRules JSON
          screamer: false  // TODO: Extract from specialRules JSON
        },
        createdAt: dbGame.createdAt
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
      orderBy: { seatIndex: 'asc' }
    });

    const userIds = players.map(p => p.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } }
    });
    const userMap = new Map(users.map(u => [u.id, u]));

    // Get current round and bids
    const currentRound = await prisma.round.findFirst({
      where: { gameId: dbGame.id },
      orderBy: { roundNumber: 'desc' }
    });
    
    const bids = currentRound ? await prisma.roundBid.findMany({
      where: { roundId: currentRound.id }
    }) : [];
    
    const bidMap = new Map(bids.map(b => [b.userId, b.bid]));

    const game = {
      id: dbGame.id,
      status: dbGame.status,
      mode: dbGame.mode || 'PARTNERS',
      rated: dbGame.isRated ?? false,
      league: dbGame.isLeague ?? false,
      solo: (dbGame.mode === 'SOLO') || false,
      minPoints: dbGame.minPoints || -100,
      maxPoints: dbGame.maxPoints || 150,
      buyIn: dbGame.buyIn || 100000,
      players: players.map(p => ({
        id: p.userId,
        username: userMap.get(p.userId)?.username || `Bot ${p.userId.slice(-4)}`,
        avatarUrl: userMap.get(p.userId)?.avatarUrl || null,
        type: p.isHuman ? 'human' : 'bot',
        seatIndex: p.seatIndex,
        teamIndex: p.teamIndex ?? null,
        bid: bidMap.get(p.userId) ?? null,
        tricks: null as number | null,
        points: null as number | null,
        bags: null as number | null
      })),
      rules: {
        minPoints: dbGame.minPoints || -100,
        maxPoints: dbGame.maxPoints || 150,
        allowNil: dbGame.nilAllowed ?? true,
        allowBlindNil: dbGame.blindNilAllowed ?? false,
        assassin: false, // TODO: Extract from specialRules JSON
        screamer: false  // TODO: Extract from specialRules JSON
      },
      createdAt: dbGame.createdAt
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

    // Leave the game room - find the user's socket
    const userSocket = [...io.sockets.sockets.values()].find(s => (s as any).userId === userId);
    if (userSocket) {
      userSocket.leave(gameId);
      console.log(`[LEAVE GAME] User ${userId} left socket room ${gameId}`);
    }

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

    const isRated = dbGame?.isRated ?? false;

    if (remainingHumans === 0 && !isRated) {
      console.log(`[LEAVE GAME] No human players remaining in unrated game ${gameId} - deleting game`);
      io.to(gameId).emit('game_deleted', { reason: 'no_human_players' });
      try {
        // First, get all bot players to delete their user records
        const botPlayers = await prisma.gamePlayer.findMany({
          where: { gameId, isHuman: false },
          select: { userId: true }
        });

        // Delete bot users from User table
        for (const botPlayer of botPlayers) {
          if (botPlayer.userId.startsWith('bot_')) {
            try {
              await prisma.user.delete({ where: { id: botPlayer.userId } });
              console.log(`[LEAVE GAME] Deleted bot user: ${botPlayer.userId}`);
            } catch (userErr) {
              console.error(`[LEAVE GAME] Failed to delete bot user ${botPlayer.userId}:`, userErr);
            }
          }
        }

        // Delete all related data in correct order to avoid foreign key constraints
        // 1. Delete round bids first
        const rounds = await prisma.round.findMany({ where: { gameId } });
        for (const round of rounds) {
          await prisma.roundBid.deleteMany({ where: { roundId: round.id } });
          await prisma.roundHandSnapshot.deleteMany({ where: { roundId: round.id } });
        }
        
        // 2. Delete rounds
        await prisma.round.deleteMany({ where: { gameId } });
        
        // 3. Delete all game players
        await prisma.gamePlayer.deleteMany({ where: { gameId } });
        
        // 4. Delete the game
        await prisma.game.delete({ where: { id: gameId } });
        console.log('[LEAVE GAME] Successfully deleted unrated game, rounds, bids, hand snapshots, and all bot users from database');
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
        status: 'BIDDING'
      }
    });

    // Notify all players
    // Call socket handler to start game with hands
    const mockSocket = { userId, emit: () => {} } as any;
    await handleStartGame(mockSocket, { gameId });
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
      orderBy: { createdAt: 'desc' }
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
      orderBy: { createdAt: 'desc' }
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
      where: { id: gameId }
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
    const playerToRemove = await prisma.gamePlayer.findFirst({
      where: { gameId, seatIndex }
    });
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
      where: { id: gameId }
    });

    let enrichedGame = null;
    if (updatedGame) {
      enrichedGame = enrichGameForClient(updatedGame);
      io.to(gameId).emit("game_update", enrichedGame);
    }

    console.log(`[REMOVE BOT] Successfully removed bot from seat ${seatIndex} in game ${gameId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing bot:', error);
    res.status(500).json({ error: 'Failed to remove bot' });
  }
});

