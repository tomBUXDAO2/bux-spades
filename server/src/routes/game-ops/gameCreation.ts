import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Game, GamePlayer, Card, Suit, Rank, BiddingOption, GamePlayOption } from '../../types/game';
import { io } from '../../server';
import { games } from '../../gamesStore';
import { trickLogger } from '../../lib/trickLogger';
import prisma from '../../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { z } from 'zod';
import { rateLimit } from '../../middleware/rateLimit.middleware';

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
    
    // Determine forcedBid based on bidding option
    let forcedBid: 'SUICIDE' | 'BID4NIL' | 'BID3' | 'BIDHEARTS' | 'CRAZY ACES' | 'NONE' = 'NONE';
    
    if (settings.biddingOption === 'SUICIDE') {
      forcedBid = 'SUICIDE';
    } else if (settings.biddingOption === '4 OR NIL') {
      forcedBid = 'BID4NIL';
    } else if (settings.biddingOption === 'BID 3') {
      forcedBid = 'BID3';
    } else if (settings.biddingOption === 'BID HEARTS') {
      forcedBid = 'BIDHEARTS';
    } else if (settings.biddingOption === 'CRAZY ACES') {
      forcedBid = 'CRAZY ACES';
    }
    
    console.log('[GAME CREATION DEBUG] Creating game with settings:', {
      gameMode: settings.gameMode,
      biddingOption: settings.biddingOption,
      specialRules: settings.specialRules,
      forcedBid,
      finalGameType: (settings.biddingOption === 'SUICIDE' || settings.biddingOption === '4 OR NIL' || settings.biddingOption === 'BID 3' || settings.biddingOption === 'BID HEARTS' || settings.biddingOption === 'CRAZY ACES') ? 'REG' : (settings.biddingOption || 'REG')
    });
    
    // Handle pre-assigned players for league games
    let players: (GamePlayer | null)[] = [null, null, null, null];
    
    if (settings.league && settings.players && Array.isArray(settings.players)) {
      // Pre-assign players to specific seats for league games
      for (const playerData of settings.players) {
        if (playerData.seat >= 0 && playerData.seat < 4) {
          players[playerData.seat] = {
            id: playerData.userId || `bot_${playerData.seat}`,
            username: playerData.username,
            avatar: playerData.avatar || null,
            type: playerData.userId ? 'human' : 'bot',
            score: 0,
            bid: 0,
            tricks: 0,
            nil: false,
            blindNil: false
          };
        }
      }
    } else {
      // Regular game creation - creator takes seat 0
      players[0] = creatorPlayer;
    }
    
    const game: Game = {
      id: uuidv4(),
      creatorId: (req as AuthenticatedRequest).user!.id,
      gameMode: settings.gameMode,
      maxPoints: settings.maxPoints,
      minPoints: settings.minPoints,
      buyIn: settings.buyIn,
      status: 'WAITING',
      players,
      hands: null,
      bidding: null,
      play: null,
      dealerIndex: 0,
      currentRound: 0,
      lastActivity: Date.now(),
      isBotGame: false,
      rated: false,
      dbGameId: null,
      rules: {
        bidType: (settings.biddingOption === 'SUICIDE' || settings.biddingOption === '4 OR NIL' || settings.biddingOption === 'BID 3' || settings.biddingOption === 'BID HEARTS' || settings.biddingOption === 'CRAZY ACES') ? 'REG' : (settings.biddingOption || 'REG'),
        specialRules: settings.specialRules || [],
        forcedBid
      }
    };
    
    // For rated games (4 human players), create database record immediately
    if (settings.league && players.filter(p => p && p.type === 'human').length === 4) {
      try {
        const dbGame = await prisma.game.create({
          data: {
            id: game.id,
            creatorId: game.creatorId,
            gameMode: game.gameMode,
            bidType: 'REGULAR',
            specialRules: game.rules.specialRules,
            minPoints: game.minPoints,
            maxPoints: game.maxPoints,
            buyIn: game.buyIn,
            rated: true,
            status: 'WAITING',
            updatedAt: new Date()
          }
        });
        
        game.dbGameId = dbGame.id;
        game.rated = true;
        console.log('[GAME CREATION] Created rated game in database:', game.dbGameId);
      } catch (err) {
        console.error('Failed to create rated game in database:', err);
      }
    }
    
    games.push(game);
    
    // Emit games updated
    io.emit('games_updated', games);
    
    res.status(201).json(game);
  } catch (error) {
    console.error('Error creating game:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

// List all games
router.get('/', requireAuth, (_req, res) => {
  res.json(games);
});

// Get game details
router.get('/:id', requireAuth, (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  res.json(game);
});

export default router;
