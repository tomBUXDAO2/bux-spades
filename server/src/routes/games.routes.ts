import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Game, GamePlayer, Card, Suit, Rank } from '../types/game';
import { io } from '../index';
import { games } from '../gamesStore';
import prisma from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { z } from 'zod';
import { rateLimit } from '../middleware/rateLimit.middleware';

// Import our new modular functions
import { 
  dealCards, 
  assignDealer,
  validateGameSettings,
  createGameFormatConfig,
  applyGameFormatRules,
  logGameStart
} from '../modules';

const router = Router();

// Helper function to filter out null values
function isNonNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

// Create a new game
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

router.post('/', rateLimit({ key: 'create_game', windowMs: 10_000, max: 5 }), requireAuth, validate(createGameSchema), async (req, res) => {
  try {
    const settings = req.body;
    const creatorPlayer = {
      id: (req as AuthenticatedRequest).user!.id,
      username: settings.creatorName || 'Unknown',
      avatar: settings.creatorImage || null,
      type: 'human' as const,
    };

    // Validate game settings using our modular function
    const validation = validateGameSettings(settings);
    if (!validation.valid) {
      return res.status(400).json({ error: 'Invalid game settings', details: validation.errors });
    }

    // Create game format configuration
    const gameFormat = createGameFormatConfig(settings);

    // Handle pre-assigned players for league games
    let players: (GamePlayer | null)[] = [null, null, null, null];
    
    if (settings.league && settings.players && settings.players.length === 4) {
      // League game with pre-assigned players
      for (const playerData of settings.players) {
        let user = await prisma.user.findFirst({
          where: { discordId: playerData.discordId || playerData.userId }
        });
        
        if (!user) {
          user = await prisma.user.create({
            data: {
              id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              username: playerData.username,
              discordId: playerData.discordId || playerData.userId,
              coins: 5000000,
            }
          });
        }
        
        players[playerData.seat] = {
          id: user.id,
          username: user.username,
          avatar: user.avatar,
          type: 'human',
          position: playerData.seat,
          team: playerData.seat % 2,
          bid: undefined,
          tricks: 0,
          points: 0,
          bags: 0
        };
      }
    } else {
      // Regular game - creator takes first available seat
      players[0] = {
        id: creatorPlayer.id,
        username: creatorPlayer.username,
        avatar: creatorPlayer.avatar,
        type: 'human',
        position: 0,
        team: 0,
        bid: undefined,
        tricks: 0,
        points: 0,
        bags: 0
      };
    }

    // Create the game
    const game: Game = {
      id: uuidv4(),
      creatorId: creatorPlayer.id,
      status: 'WAITING',
      gameMode: settings.gameMode,
      maxPoints: settings.maxPoints,
      minPoints: settings.minPoints,
      buyIn: settings.buyIn,
      rated: !settings.league,
      allowNil: true,
      allowBlindNil: false,
      league: settings.league || false,
      completed: false,
      cancelled: false,
      solo: settings.gameMode === 'SOLO',
      currentRound: 1,
      currentTrick: 1,
      dealerIndex: 0,
      lastActivity: Date.now(),
      createdAt: new Date(),
      updatedAt: new Date(),
      players,
      hands: [],
      bidding: undefined,
      play: undefined,
      team1TotalScore: 0,
      team2TotalScore: 0,
      team1Bags: 0,
      team2Bags: 0,
      isBotGame: false
    };

    // Apply game format rules
    applyGameFormatRules(game, gameFormat);

    // Add to games array
    games.push(game);

    console.log('[GAME CREATION] Created game:', {
      id: game.id,
      gameMode: game.gameMode,
      format: gameFormat.format,
      gimmickType: gameFormat.gimmickType,
      players: game.players.map(p => p ? p.username : 'empty')
    });

    res.json({
      success: true,
      game: enrichGameForClient(game)
    });

  } catch (error) {
    console.error('Error creating game:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

// Start the game
router.post('/:id/start', rateLimit({ key: 'start_game', windowMs: 10_000, max: 5 }), requireAuth, async (req, res) => {
  console.log('[DEBUG] /start route CALLED for game', req.params.id);
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status !== 'WAITING') return res.status(400).json({ error: 'Game already started' });
  
  // If any seat is a bot, set isBotGame true
  game.isBotGame = game.players.some(p => p && p.type === 'bot');
  
  // Only log rated games (4 human players, no bots)
  const humanPlayers = game.players.filter(p => p && p.type === 'human').length;
  const isRated = humanPlayers === 4;
  
  if (isRated && !game.dbGameId) {
    console.log('[GAME START DEBUG] Creating rated game in database:', {
      id: game.id,
      isBotGame: game.isBotGame,
      humanPlayers,
      players: game.players.map(p => p ? { type: p.type, username: p.username } : null)
    });
    
    try {
      await logGameStart(game);
      console.log('[GAME START DEBUG] Game logged to database with ID:', game.dbGameId);
    } catch (err) {
      console.error('Failed to log game start:', err);
    }
  } else if (!isRated) {
    console.log('[GAME START DEBUG] Unrated game (has bots) - not logging to database. Human players:', humanPlayers);
  }
  
  game.status = 'PLAYING';
  
  // Deal cards using our modular function
  const dealerIndex = assignDealer(game.players, game.dealerIndex);
  game.dealerIndex = dealerIndex;
  const hands = dealCards(game.players, dealerIndex);
  game.hands = hands;
  
  // Assign hands to individual players
  game.hands.forEach((hand, index) => {
    if (game.players[index]) {
      game.players[index]!.hand = hand;
    }
  });

  // Start bidding
  game.bidding = {
    currentBidderIndex: (dealerIndex + 1) % 4,
    currentPlayer: game.players[(dealerIndex + 1) % 4]?.id ?? '',
    bids: [null, null, null, null],
    nilBids: {}
  };

  console.log('[GAME START] Game started:', {
    id: game.id,
    dealerIndex,
    currentBidder: game.bidding.currentBidderIndex,
    hands: game.hands.map(h => h.length)
  });

  // Emit game started event
  io.to(game.id).emit('game_started', {
    gameId: game.id,
    dealerIndex,
    hands: game.hands,
    currentBidderIndex: game.bidding.currentBidderIndex
  });

  res.json({ success: true, game: enrichGameForClient(game) });
});

// Get all games
router.get('/', async (req, res) => {
  try {
    const validatedGames = games.filter(game => {
      const { validGames } = require('../lib/gameValidator').GameValidator.validateAllGames([game]);
      return validGames.length > 0;
    });

    const enrichedGames = validatedGames.map(game => enrichGameForClient(game));
    
    res.json({
      success: true,
      games: enrichedGames
    });
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

// Get specific game
router.get('/:id', async (req, res) => {
  try {
    const game = games.find(g => g.id === req.params.id);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    res.json({
      success: true,
      game: enrichGameForClient(game)
    });
  } catch (error) {
    console.error('Error fetching game:', error);
    res.status(500).json({ error: 'Failed to fetch game' });
  }
});

// Join game
router.post('/:id/join', rateLimit({ key: 'join_game', windowMs: 5_000, max: 10 }), requireAuth, async (req, res) => {
  try {
    const game = games.find(g => g.id === req.params.id);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    if (game.status !== 'WAITING') {
      return res.status(400).json({ error: 'Game is not waiting for players' });
    }

    const userId = (req as AuthenticatedRequest).user!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, avatar: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user is already in the game
    const existingPlayerIndex = game.players.findIndex(p => p && p.id === userId);
    if (existingPlayerIndex !== -1) {
      console.log(`[JOIN GAME] User ${userId} is already in game at seat ${existingPlayerIndex}`);
      return res.json({
        success: true,
        game: enrichGameForClient(game),
        message: "Already in game"
      });
    }
    // Find first available seat
    const availableSeat = game.players.findIndex(p => p === null);
    if (availableSeat === -1) {
      return res.status(400).json({ error: 'Game is full' });
    }

    // Add player to game
    game.players[availableSeat] = {
      id: userId,
      username: user.username,
      avatar: user.avatar,
      type: 'human',
      position: availableSeat,
      team: availableSeat % 2,
      bid: undefined,
      tricks: 0,
      points: 0,
      bags: 0
    };

    console.log('[JOIN GAME] Player joined:', {
      gameId: game.id,
      userId,
      username: user.username,
      seat: availableSeat
    });

    // Emit player joined event
    io.to(game.id).emit('player_joined', {
      gameId: game.id,
      player: {
        id: userId,
        username: user.username,
        avatar: user.avatar,
        position: availableSeat,
        team: availableSeat % 2
      }
    });

    res.json({
      success: true,
      game: enrichGameForClient(game)
    });

  } catch (error) {
    console.error('Error joining game:', error);
    res.status(500).json({ error: 'Failed to join game' });
  }
});

// Leave game
router.post('/:id/leave', rateLimit({ key: 'leave_game', windowMs: 5_000, max: 10 }), requireAuth, async (req, res) => {
  try {
    const game = games.find(g => g.id === req.params.id);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const userId = (req as AuthenticatedRequest).user!.id;
    const playerIndex = game.players.findIndex(p => p && p.id === userId);
    
    if (playerIndex === -1) {
      return res.status(400).json({ error: 'You are not in this game' });
    }

    // Remove player from game
    game.players[playerIndex] = null;

    console.log('[LEAVE GAME] Player left:', {
      gameId: game.id,
      userId,
      seat: playerIndex
    });

    // Emit player left event
    io.to(game.id).emit('player_left', {
      gameId: game.id,
      playerId: userId,
      position: playerIndex
    });

    res.json({ success: true });

  } catch (error) {
    console.error('Error leaving game:', error);
    res.status(500).json({ error: 'Failed to leave game' });
  }
});

// Helper function to enrich game data for client
export function enrichGameForClient(game: Game): any {
  return {
    id: game.id,
    status: game.status,
    gameMode: game.gameMode,
    maxPoints: game.maxPoints,
    minPoints: game.minPoints,
    buyIn: game.buyIn,
    rated: game.rated,
    league: game.league,
    solo: game.solo,
    currentRound: game.currentRound,
    currentTrick: game.currentTrick,
    dealerIndex: game.dealerIndex,
    lastActivity: game.lastActivity,
    createdAt: game.createdAt,
    players: game.players.map(p => p ? {
      id: p.id,
      username: p.username,
      avatar: p.avatar,
      type: p.type,
      position: p.position,
      team: p.team,
      bid: p.bid,
      tricks: p.tricks,
      points: p.points,
      bags: p.bags
    } : null),
    hands: game.hands,
    bidding: game.bidding,
    play: game.play,
    team1TotalScore: game.team1TotalScore,
    team2TotalScore: game.team2TotalScore,
    team1Bags: game.team1Bags,
    team2Bags: game.team2Bags,
    isBotGame: game.isBotGame,
    rules: game.rules,
    forcedBid: game.forcedBid
  };
}

// Export logGameStart function for use in modules
export async function logGameStart(game: Game): Promise<void> {
  try {
    const dbGame = await prisma.game.create({
      data: {
        id: game.id,
        creatorId: game.creatorId,
        status: game.status,
        gameMode: game.gameMode,
        bidType: game.rules?.bidType || 'REGULAR',
        specialRules: game.rules?.screamer || game.rules?.assassin ? 
          (game.rules.screamer ? ['SCREAMER'] : []) : [],
        minPoints: game.minPoints,
        maxPoints: game.maxPoints,
        buyIn: game.buyIn,
        rated: game.rated,
        allowNil: game.allowNil,
        allowBlindNil: game.allowBlindNil,
        league: game.league,
        whiz: game.rules?.bidType === 'WHIZ',
        mirror: game.rules?.bidType === 'MIRRORS',
        gimmick: game.rules?.bidType === 'GIMMICK',
        screamer: game.rules?.screamer || false,
        assassin: game.rules?.assassin || false,
        solo: game.solo,
        currentRound: game.currentRound,
        currentTrick: game.currentTrick,
        dealer: game.dealerIndex,
        gameState: game as any,
        lastActionAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    game.dbGameId = dbGame.id;
    console.log('[DATABASE] Game logged with ID:', dbGame.id);
  } catch (error) {
    console.error('[DATABASE] Failed to log game:', error);
    throw error;
  }
}

export default router;
