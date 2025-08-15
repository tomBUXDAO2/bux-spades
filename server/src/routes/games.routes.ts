import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Game, GamePlayer, Card, Suit, Rank, BiddingOption, GamePlayOption } from '../types/game';
import { io } from '../index';
import { games } from '../gamesStore';
import { startSeatReplacement } from "../index";
import type { AuthenticatedSocket } from '../index';
import { trickLogger } from '../lib/trickLogger';
import prisma from '../lib/prisma';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import { z } from 'zod';
import { rateLimit } from '../middleware/rateLimit.middleware';


const router = Router();

// Helper function to filter out null values
function isNonNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

// Games store is now imported from index.ts to avoid circular dependency

// Create a new game
const createGameSchema = z.object({
	gameMode: z.enum(['SOLO', 'PARTNERS']),
	maxPoints: z.number().int().min(-1000).max(10000),
	minPoints: z.number().int().min(-10000).max(1000),
	buyIn: z.number().int().min(0).max(100000000),
	biddingOption: z.string().optional(),
	specialRules: z.any().optional(),
	league: z.boolean().optional(),
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
    
    if (settings.league && settings.players && settings.players.length === 4) {
      // League game with pre-assigned players
      for (const playerData of settings.players) {
        // Check if user exists in database, create if not
        let user = await prisma.user.findFirst({
          where: { discordId: playerData.discordId || playerData.userId }
        });
        
        if (!user) {
          // Create user with Discord ID
          user = await prisma.user.create({
            data: {
              username: playerData.username,
              email: `${playerData.username}@discord.local`, // Temporary email
              discordId: playerData.discordId || playerData.userId,
              coins: 5000000, // Default coins
              avatar: playerData.avatar || null // Use provided avatar or null
            }
          });
          
          // Create user stats
          await prisma.userStats.create({
            data: {
              userId: user.id
            }
          });
          
          console.log(`[LEAGUE GAME] Created new user for Discord ID ${playerData.discordId}: ${user.id}`);
        }
        
        const player: GamePlayer = {
          id: user.id, // Use the database user ID
          username: playerData.username,
          avatar: user.avatar,
          type: 'human' as const,
          position: playerData.seat, // Set position to match seat
        };
        players[playerData.seat] = player;
      }
    } else {
      // Regular game - only creator in first seat
      players[0] = creatorPlayer;
    }
    
    const newGame: Game = {
      id: uuidv4(),
      gameMode: settings.gameMode,
      maxPoints: settings.maxPoints,
      minPoints: settings.minPoints,
      buyIn: settings.buyIn,
      forcedBid,
      specialRules: settings.specialRules || {},
      players,
      spectators: [],
      status: 'WAITING' as Game['status'],
      completedTricks: [],
      lastActivity: Date.now(), // Initialize with current timestamp
      createdAt: Date.now(), // Add creation timestamp for logging
      rules: {
        // For gimmick games (SUICIDE, 4 OR NIL, BID 3, BID HEARTS), set gameType to 'REG'
        // and use forcedBid to distinguish between them
        gameType: (settings.biddingOption === 'SUICIDE' || settings.biddingOption === '4 OR NIL' || settings.biddingOption === 'BID 3' || settings.biddingOption === 'BID HEARTS' || settings.biddingOption === 'CRAZY ACES') ? 'REG' : (settings.biddingOption || 'REG'),
        allowNil: settings.specialRules?.allowNil ?? true,
        allowBlindNil: settings.specialRules?.allowBlindNil ?? false,
        coinAmount: settings.buyIn,
        maxPoints: settings.maxPoints,
        minPoints: settings.minPoints,
        bidType: settings.biddingOption || 'REG' as BiddingOption,
        gimmickType: 'REG' as GamePlayOption
      },
      isBotGame: false,
      league: settings.league || false, // Add league property
    };
    games.push(newGame);
    
    // FORCE GAME LOGGING - Create game in database immediately
    try {
      const dbBidType = ((): any => {
        const opt = newGame.rules.bidType;
        if (opt === 'WHIZ') return 'WHIZ';
        if (opt === 'MIRROR') return 'MIRRORS';
        if (opt === 'SUICIDE' || opt === '4 OR NIL' || opt === 'BID 3' || opt === 'BID HEARTS' || opt === 'CRAZY ACES') return 'GIMMICK';
        return 'REGULAR';
      })();
      const dbGame = await prisma.game.create({
        data: {
          creatorId: newGame.players.find(p => p && p.type === 'human')?.id || 'unknown',
          gameMode: newGame.gameMode,
          bidType: dbBidType,
          specialRules: [],
          minPoints: newGame.minPoints,
          maxPoints: newGame.maxPoints,
          buyIn: newGame.buyIn,
          rated: newGame.players.filter(p => p && p.type === 'human').length === 4,
          status: 'WAITING',
          allowNil: newGame.rules.allowNil,
          allowBlindNil: newGame.rules.allowBlindNil,
        }
      });
      
      newGame.dbGameId = dbGame.id;
      console.log('[FORCE GAME LOGGED] Game forced to database with ID:', newGame.dbGameId);
      
      // Start round logging immediately when game is created
      try {
        const { trickLogger } = await import('../lib/trickLogger');
        await trickLogger.startRound(newGame.dbGameId, 1);
        console.log('[ROUND STARTED] Round 1 started for game:', newGame.dbGameId);
      } catch (err) {
        console.error('Failed to start round logging:', err);
      }
      

    } catch (err) {
      console.error('Failed to force log game start:', err);
    }
    
    // Filter out league games in waiting status for lobby
    const lobbyGames = games.filter(game => {
      if ((game as any).league && game.status === 'WAITING') {
        return false;
      }
      return true;
    });
    io.emit('games_updated', lobbyGames);
    
    // Also emit all games (including league games) for real-time league game detection
    io.emit('all_games_updated', games);
    res.status(201).json(newGame);
  } catch (err) {
    console.error('Error creating game:', err);
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
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(enrichGameForClient(game));
});

  // Join a game
  const joinGameSchema = z.object({
	seat: z.number().int().min(0).max(3).optional(),
	username: z.string().min(1),
	avatar: z.string().optional()
});

router.post('/:id/join', rateLimit({ key: 'join_game', windowMs: 10_000, max: 10 }), requireAuth, validate(joinGameSchema), async (req, res) => {
    console.log('[HTTP JOIN DEBUG] Join request:', { gameId: req.params.id, body: req.body });
    console.log('[HTTP JOIN DEBUG] Available games:', games.map(g => ({ id: g.id, status: g.status, players: g.players.map(p => p ? p.id : 'null') })));
    
    const game = games.find(g => g.id === req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

  // Use requested seat if provided and available, otherwise find first empty seat
  const requestedSeat = typeof req.body.seat === 'number' ? req.body.seat : null;
  const playerId = (req as AuthenticatedRequest).user!.id;
  const player = {
    id: playerId,
    username: req.body.username || 'Unknown',
    avatar: req.body.avatar || '/default-pfp.jpg',
    type: 'human' as const,
    position: requestedSeat
  };

  // Prevent duplicate join - but allow league game players to "rejoin" their assigned seat
  if (game.players.some(p => p && p.id === player.id) && !(game as any).league) {
    return res.status(400).json({ error: 'Player already joined' });
  }

  // Check coin balance before seating
  try {
    const user = await prisma.user.findUnique({ where: { id: playerId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.coins < game.buyIn) {
      return res.status(400).json({ error: 'Not enough coins to join this game' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to check coin balance' });
  }

  // Find seat for player
  let seatIndex = -1;
  
  // For league games, check if player is pre-assigned to a specific seat
  if ((game as any).league) {
    console.log('[LEAGUE JOIN DEBUG] Processing league game join:', {
      playerId,
      gamePlayers: game.players.map(p => p ? { id: p.id, username: p.username } : null)
    });
    
    // Find user by database ID (playerId is already the database user ID)
    const user = await prisma.user.findUnique({
      where: { id: playerId }
    });
    
    if (!user) {
      console.log('[LEAGUE JOIN DEBUG] User not found in database:', playerId);
      return res.status(400).json({ error: 'User not found. Please login with Discord first.' });
    }
    
    const preAssignedSeat = game.players.findIndex(p => p && p.id === user.id);
    console.log('[LEAGUE JOIN DEBUG] Pre-assigned seat search:', {
      userId: user.id,
      preAssignedSeat,
      gamePlayers: game.players.map(p => p ? { id: p.id, username: p.username } : null)
    });
    
    if (preAssignedSeat !== -1) {
      // Player is pre-assigned to this seat
      seatIndex = preAssignedSeat;
      console.log(`[LEAGUE JOIN] Player ${playerId} joining pre-assigned seat ${seatIndex}`);
    } else {
      console.log('[LEAGUE JOIN DEBUG] Player not assigned to this league game:', {
        userId: user.id,
        username: user.username
      });
      return res.status(400).json({ error: 'You are not assigned to this league game' });
    }
  } else {
    // Regular game logic
    if (requestedSeat !== null && requestedSeat >= 0 && requestedSeat < 4) {
      // Use requested seat if available
      if (game.players[requestedSeat] === null) {
        seatIndex = requestedSeat;
      } else {
        return res.status(400).json({ error: 'Seat is already taken' });
      }
    } else {
      // Find first empty seat
      seatIndex = game.players.findIndex(p => p === null);
      if (seatIndex === -1) {
        return res.status(400).json({ error: 'Game is full' });
      }
    }
  }
  
  // Assign player to seat
  player.position = seatIndex;
  
  // For league games, update the existing player data with avatar/username
  if ((game as any).league && game.players[seatIndex]) {
    // Find the user to get the correct ID
    const user = await prisma.user.findUnique({
      where: { id: playerId }
    });
    
    if (user) {
      // Update the existing player with the correct user ID and data
      game.players[seatIndex] = {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        type: 'human' as const,
        position: seatIndex
      };
    }
  } else {
    game.players[seatIndex] = player;
  }
  
  console.log('[HTTP JOIN DEBUG] Player added to game:', { 
    playerId: player.id, 
    seatIndex, 
    gamePlayers: game.players.map(p => p ? p.id : 'null') 
  });

  res.json(game);
  io.emit('games_updated', games);
  // Emit game_update to the game room for real-time sync
  io.to(game.id).emit('game_update', enrichGameForClient(game));
});

// Invite a bot to an empty seat (host only, pre-game)
router.post('/:id/invite-bot', requireAuth, (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status !== 'WAITING') return res.status(400).json({ error: 'Game already started' });
  const { seatIndex } = req.body;
  const requesterId = (req as AuthenticatedRequest).user!.id;
  // Debug logging
  console.log('[INVITE BOT] seatIndex:', seatIndex, 'requesterId:', requesterId);
  console.log('[INVITE BOT] game.players BEFORE:', JSON.stringify(game.players));
  // Only host can invite bots
  if (game.players[0]?.id !== requesterId) return res.status(403).json({ error: 'Only host can invite bots' });
  if (seatIndex < 0 || seatIndex > 3 || game.players[seatIndex]) return res.status(400).json({ error: 'Invalid seat' });
  // Add bot
  const botPlayer = {
    id: `bot-${uuidv4()}`,
    username: `Bot ${seatIndex + 1}`,
    avatar: '/bot-avatar.jpg',
    type: 'bot' as const,
    position: seatIndex
  };
  game.players[seatIndex] = botPlayer;
  // Debug logging after mutation
  console.log('[INVITE BOT] game.players AFTER:', JSON.stringify(game.players));
  // If any seat is a bot, set isBotGame true
  game.isBotGame = game.players.some(p => p && p.type === 'bot');
  io.emit('games_updated', games);
  io.to(game.id).emit('game_update', enrichGameForClient(game));
  res.json(game);
});

// Invite a bot to fill an empty seat mid-game (partner only)
router.post('/:id/invite-bot-midgame', requireAuth, (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status === 'WAITING') return res.status(400).json({ error: 'Game has not started' });
  const { seatIndex } = req.body;
  const requesterId = (req as AuthenticatedRequest).user!.id;
  if (seatIndex < 0 || seatIndex > 3 || game.players[seatIndex]) return res.status(400).json({ error: 'Seat is not empty' });
  // Find the partner seat (for 4-player games: 0<->2, 1<->3)
  const partnerSeat = (seatIndex + 2) % 4;
  if (!game.players[partnerSeat] || game.players[partnerSeat]?.id !== requesterId) {
    return res.status(403).json({ error: 'Only the partner can invite a bot for this seat' });
  }
  // Add bot
  const botPlayer = {
    id: `bot-${uuidv4()}`,
    username: `Bot ${seatIndex + 1}`,
    avatar: '/bot-avatar.jpg',
    type: 'bot' as const,
    position: seatIndex
  };
  game.players[seatIndex] = botPlayer;
  io.emit('games_updated', games);
  io.to(game.id).emit('game_update', enrichGameForClient(game));
  res.json(game);
});

// Add a spectator to a game
router.post('/:id/spectate', requireAuth, async (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const userId = (req as AuthenticatedRequest).user!.id;
  let hostReplaced = false;
  // Prevent duplicate spectate
  if (game.spectators.some(s => s.id === userId)) {
    return res.status(400).json({ error: 'Already spectating' });
  }
  // Prevent joining as both player and spectator
  if (game.players.some(p => p && p.id === userId)) {
    return res.status(400).json({ error: 'Already joined as player' });
  }
  // Add to spectators
  game.spectators.push({
    id: userId,
    username: req.body.username || 'Unknown',
    avatar: req.body.avatar || '/default-pfp.jpg',
    type: 'human',
  });
  io.to(game.id).emit('game_update', game);
  io.emit('games_updated', games);
  res.json(game);
});

// Remove a player or spectator from a game
router.post('/:id/leave', requireAuth, (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const userId = (req as AuthenticatedRequest).user!.id;
  let hostReplaced = false;
  
  // Remove from players
  const playerIdx = game.players.findIndex(p => p && p.id === userId);
  if (playerIdx !== -1) {
    // Get the player before removing them
    const removedPlayer = game.players[playerIdx];
    game.players[playerIdx] = null;
    
    // Track if host replacement occurred
    
    // If the host (seat 0) was removed, appoint a new host
    if (playerIdx === 0) {
      const newHostIndex = game.players.findIndex((p: GamePlayer | null) => p && p.type === 'human');
      if (newHostIndex !== -1) {
        console.log(`[HTTP LEAVE] Host removed, appointing new host at seat ${newHostIndex}`);
        // Move the new host to seat 0
        const newHost = game.players[newHostIndex];
        game.players[newHostIndex] = null;
        game.players[0] = newHost;
        newHost.position = 0;
        hostReplaced = true;
        
        // Start seat replacement for the new host's old seat
        startSeatReplacement(game, newHostIndex);
      }
    }
  }
  
  // Remove from spectators
  const specIdx = game.spectators.findIndex(s => s.id === userId);
  if (specIdx !== -1) {
    game.spectators.splice(specIdx, 1);
  }
  
  // Start seat replacement process for the empty seat (only if host wasn't replaced)
  if (playerIdx !== -1 && !hostReplaced) {
    console.log(`[HTTP LEAVE DEBUG] About to start seat replacement for seat ${playerIdx}`);
    console.log(`[HTTP LEAVE DEBUG] Seat ${playerIdx} is now:`, game.players[playerIdx]);
    startSeatReplacement(game, playerIdx);
  }
  
  // Check if there are any human players left
  const hasHumanPlayers = game.players.some((p: GamePlayer | null) => p && p.type === 'human');
  
  console.log(`[HTTP LEAVE DEBUG] Game ${game.id} - Human players remaining:`, hasHumanPlayers);
  console.log(`[HTTP LEAVE DEBUG] Current players:`, game.players.map((p, i) => `${i}: ${p ? `${p.username} (${p.type})` : 'null'}`));
  
  // If no human players remain, remove the game
  if (!hasHumanPlayers) {
    const gameIdx = games.findIndex((g: Game) => g.id === game.id);
    if (gameIdx !== -1) {
      games.splice(gameIdx, 1);
      io.emit('games_updated', games);
      console.log(`[HTTP LEAVE] Game ${game.id} removed (no human players left)`);
    } else {
      console.log(`[HTTP LEAVE ERROR] Game ${game.id} not found in games array for removal`);
    }
  } else {
    console.log(`[HTTP LEAVE] Game ${game.id} kept (human players still present)`);
  }
  
  io.to(game.id).emit('game_update', game);
  io.emit('games_updated', games);
  res.json(game);
});

// --- Gameplay Helpers ---
const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function shuffle(deck: Card[]): Card[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function assignDealer(players: (GamePlayer | null)[], previousDealerIndex?: number): number {
  const playerIndexes = players.map((p, i) => p ? i : null).filter((i): i is number => i !== null);
  if (playerIndexes.length === 0) {
    throw new Error('No valid players to assign dealer');
  }
  if (previousDealerIndex !== undefined) {
    const nextDealerIndex = (previousDealerIndex + 1) % 4;
    return playerIndexes.includes(nextDealerIndex) ? nextDealerIndex : playerIndexes[0];
  }
  return playerIndexes[Math.floor(Math.random() * playerIndexes.length)];
}

export function dealCards(players: (GamePlayer | null)[], dealerIndex: number): Card[][] {
  const deck = shuffle(createDeck());
  const hands: Card[][] = [[], [], [], []];
  let current = (dealerIndex + 1) % 4;
  for (const card of deck) {
    hands[current].push(card);
    current = (current + 1) % 4;
  }
  return hands;
}

// Start the game
router.post('/:id/start', rateLimit({ key: 'start_game', windowMs: 10_000, max: 5 }), requireAuth, async (req, res) => {
  console.log('[DEBUG] /start route CALLED for game', req.params.id);
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status !== 'WAITING') return res.status(400).json({ error: 'Game already started' });
  
  // If any seat is a bot, set isBotGame true
  game.isBotGame = game.players.some(p => p && p.type === 'bot');
  
  if (!game.isBotGame) {
    // Debit buy-in from each human player's coin balance
    try {
      await prisma.$transaction(async (tx) => {
        // Validate all players have enough coins first
        const humanPlayers = game.players.filter(p => p && p.type === 'human') as GamePlayer[];
        const userIds = humanPlayers.map(p => p.id);
        const users = await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, coins: true } });
        const userCoins = new Map(users.map(u => [u.id, u.coins]));
        for (const p of humanPlayers) {
          const coins = userCoins.get(p.id);
          if (coins === undefined || coins < game.buyIn) {
            throw new Error('Not enough coins for all players');
          }
        }
        // Debit all
        for (const p of humanPlayers) {
          await tx.user.update({ where: { id: p.id }, data: { coins: { decrement: game.buyIn } } });
        }
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to debit coins from players' });
    }
  }
  
  game.status = 'BIDDING';
  
  // --- Dealer assignment and card dealing ---
  const dealerIndex = assignDealer(game.players, game.dealerIndex);
  game.dealerIndex = dealerIndex;
  const hands = dealCards(game.players, dealerIndex);
  game.hands = hands;
  
  // --- Bidding phase state ---
  const firstBidderIndex = (dealerIndex + 1) % 4;
  const firstBidder = game.players[firstBidderIndex];
  if (!firstBidder) return res.status(500).json({ error: 'Invalid game state' });

  game.bidding = {
    currentPlayer: firstBidder.id,
    currentBidderIndex: firstBidderIndex,
    bids: [null, null, null, null],
    nilBids: {}
  };

  // Emit to all players
  io.emit('games_updated', games);
  io.to(game.id).emit('game_started', {
    dealerIndex,
    hands: hands.map((hand, i) => ({
      playerId: game.players[i]?.id,
      hand
    })),
    bidding: game.bidding,
  });

  // --- FIX: If first bidder is a bot, trigger bot bidding immediately ---
  if (firstBidder.type === 'bot') {
    console.log('[DEBUG] About to call botMakeMove for seat', firstBidderIndex, 'bot:', firstBidder.username);
    botMakeMove(game, firstBidderIndex);
  }

  res.json(game);
});

// Remove a bot from a seat (host only, pre-game)
router.post('/:id/remove-bot', requireAuth, (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status !== 'WAITING') return res.status(400).json({ error: 'Game already started' });
  const { seatIndex } = req.body;
  const requesterId = (req as AuthenticatedRequest).user!.id;
  // Only host can remove bots
  if (game.players[0]?.id !== requesterId) return res.status(403).json({ error: 'Only host can remove bots' });
  if (seatIndex < 0 || seatIndex > 3 || !game.players[seatIndex] || game.players[seatIndex].type !== 'bot') return res.status(400).json({ error: 'Invalid seat or not a bot' });
  game.players[seatIndex] = null;
  io.emit('games_updated', games);
  io.to(game.id).emit('game_update', enrichGameForClient(game));
  res.json(game);
});

// Remove a bot from a seat mid-game (partner only)
router.post('/:id/remove-bot-midgame', requireAuth, (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status === 'WAITING') return res.status(400).json({ error: 'Game has not started' });
  const { seatIndex } = req.body;
  const requesterId = (req as AuthenticatedRequest).user!.id;
  if (seatIndex < 0 || seatIndex > 3 || !game.players[seatIndex] || game.players[seatIndex].type !== 'bot') return res.status(400).json({ error: 'Invalid seat or not a bot' });
  // Find the partner seat (for 4-player games: 0<->2, 1<->3)
  const partnerSeat = (seatIndex + 2) % 4;
  if (!game.players[partnerSeat] || game.players[partnerSeat]?.id !== requesterId) {
    return res.status(403).json({ error: 'Only the partner can remove a bot for this seat' });
  }
  game.players[seatIndex] = null;
  io.emit('games_updated', games);
  io.to(game.id).emit('game_update', enrichGameForClient(game));
  res.json(game);
});

// --- Bot Bidding Logic ---
// ===== GENERIC BOT BIDDING LOGIC =====

// Helper function to count spades in hand
function countSpades(hand: Card[]): number {
  return hand.filter(c => c.suit === 'S').length;
}

// Helper function to check if hand has Ace of Spades
function hasAceOfSpades(hand: Card[]): boolean {
  return hand.some(c => c.suit === 'S' && c.rank === 'A');
}

// Helper function to count high cards (A, K, Q, J)
function countHighCards(hand: Card[]): number {
  return hand.filter(c => ['A', 'K', 'Q', 'J'].includes(c.rank)).length;
}

// Improved function to calculate expected tricks based on hand strength
function calculateExpectedTricks(hand: Card[]): number {
  let bid = 0;
  
  // Count spades (trump suit) - most important
  const spades = hand.filter(c => c.suit === 'S');
  const spadesCount = spades.length;
  
  // More aggressive spades counting
  if (spadesCount > 0) {
    // Always count Ace of Spades
    if (spades.some(c => c.rank === 'A')) bid += 1;
    
    // Count King of Spades (if at least 2 spades)
    if (spadesCount >= 2 && spades.some(c => c.rank === 'K')) bid += 1;
    
    // Count Queen of Spades (if at least 3 spades)
    if (spadesCount >= 3 && spades.some(c => c.rank === 'Q')) bid += 1;
    
    // Count Jack of Spades (if at least 4 spades)
    if (spadesCount >= 4 && spades.some(c => c.rank === 'J')) bid += 1;
    
    // Count 10 of Spades (if at least 5 spades)
    if (spadesCount >= 5 && spades.some(c => c.rank === '10')) bid += 1;
    
    // Count 9 of Spades (if at least 6 spades)
    if (spadesCount >= 6 && spades.some(c => c.rank === '9')) bid += 1;
    
    // Count 8 of Spades (if at least 7 spades)
    if (spadesCount >= 7 && spades.some(c => c.rank === '8')) bid += 1;
    
    // Count 7 of Spades (if at least 8 spades)
    if (spadesCount >= 8 && spades.some(c => c.rank === '7')) bid += 1;
    
    // Count 6 of Spades (if at least 9 spades)
    if (spadesCount >= 9 && spades.some(c => c.rank === '6')) bid += 1;
    
    // Count 5 of Spades (if at least 10 spades)
    if (spadesCount >= 10 && spades.some(c => c.rank === '5')) bid += 1;
    
    // Count 4 of Spades (if at least 11 spades)
    if (spadesCount >= 11 && spades.some(c => c.rank === '4')) bid += 1;
    
    // Count 3 of Spades (if at least 12 spades)
    if (spadesCount >= 12 && spades.some(c => c.rank === '3')) bid += 1;
    
    // Count 2 of Spades (if all 13 spades)
    if (spadesCount === 13 && spades.some(c => c.rank === '2')) bid += 1;
    
    // Bonus for having multiple spades (trump control)
    if (spadesCount >= 3) bid += Math.floor(spadesCount / 3);
  }
  
  // More aggressive counting of other suits
  const suits = ['H', 'D', 'C'];
  for (const suit of suits) {
    const suitCards = hand.filter(c => c.suit === suit);
    const suitCount = suitCards.length;
    
    // Count Aces more liberally
    if (suitCards.some(c => c.rank === 'A')) {
      if (suitCount <= 4) bid += 1; // Always count if short suit
      else if (suitCount <= 6) bid += 0.5; // Partial credit for medium suit
    }
    
    // Count Kings more liberally
    if (suitCards.some(c => c.rank === 'K')) {
      if (suitCount <= 3) bid += 1; // Always count if very short
      else if (suitCount <= 5) bid += 0.5; // Partial credit for short suit
    }
    
    // Count Queens in short suits
    if (suitCards.some(c => c.rank === 'Q') && suitCount <= 3) {
      bid += 0.5;
    }
    
    // Bonus for void suits (if we have spades)
    if (suitCount === 0 && spadesCount > 1) {
      bid += 1;
    }
    
    // Bonus for singleton suits (if we have spades)
    if (suitCount === 1 && spadesCount > 1) {
      bid += 0.5;
    }
  }
  
  // Round up for more aggressive bidding
  return Math.max(1, Math.min(13, Math.ceil(bid)));
}

// Helper function to analyze score position
function analyzeScorePosition(game: Game, playerIndex: number): 'WINNING' | 'LOSING' | 'CLOSE' {
  const teamIndex = playerIndex % 2; // 0,1 = team 1, 2,3 = team 2
  const team1Score = game.team1TotalScore || 0;
  const team2Score = game.team2TotalScore || 0;
  
  if (teamIndex === 0) { // Team 1
    if (team1Score - team2Score > 50) return 'WINNING';
    if (team2Score - team1Score > 50) return 'LOSING';
  } else { // Team 2
    if (team2Score - team1Score > 50) return 'WINNING';
    if (team1Score - team2Score > 50) return 'LOSING';
  }
  
  return 'CLOSE';
}

// Improved function to analyze bag risk
function analyzeBagRisk(game: Game, playerIndex: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  const teamIndex = playerIndex % 2;
  const team1Bags = game.team1Bags || 0;
  const team2Bags = game.team2Bags || 0;
  
  if (teamIndex === 0) { // Team 1
    if (team1Bags >= 7) return 'HIGH'; // Lower threshold for high risk
    if (team2Bags >= 5) return 'LOW'; // Opponents have bags, we can be aggressive
  } else { // Team 2
    if (team2Bags >= 7) return 'HIGH'; // Lower threshold for high risk
    if (team1Bags >= 5) return 'LOW'; // Opponents have bags, we can be aggressive
  }
  
  return 'MEDIUM';
}

// Helper function to get bidding position
function getBiddingPosition(game: Game, playerIndex: number): 'EARLY' | 'LATE' {
  // Determine if this player is early (1st/2nd) or late (3rd/4th) in bidding
  const dealerIndex = game.dealerIndex || 0;
  const firstBidder = (dealerIndex + 1) % 4;
  const biddingOrder = [firstBidder, (firstBidder + 1) % 4, (firstBidder + 2) % 4, (firstBidder + 3) % 4];
  const position = biddingOrder.indexOf(playerIndex);
  
  return position < 2 ? 'EARLY' : 'LATE';
}

// Helper function to get partner's bid
function getPartnerBid(game: Game, playerIndex: number): number | null {
  const partnerIndex = playerIndex % 2 === 0 ? playerIndex + 2 : playerIndex - 2;
  if (partnerIndex < 0 || partnerIndex >= 4) return null;
  
  const partner = game.players[partnerIndex];
  if (!partner) return null;
  
  return partner.bid !== undefined ? partner.bid : null;
}

// Improved function to determine bidding strategy
function determineBiddingStrategy(
  scorePosition: 'WINNING' | 'LOSING' | 'CLOSE',
  bagRisk: 'HIGH' | 'MEDIUM' | 'LOW',
  biddingPosition: 'EARLY' | 'LATE',
  partnerBid: number | null
): 'CONSERVATIVE' | 'AGGRESSIVE' | 'BALANCED' {
  
  // Conservative when winning or high bag risk
  if (scorePosition === 'WINNING' || bagRisk === 'HIGH') {
    return 'CONSERVATIVE';
  }
  
  // Aggressive when losing or opponents have bags
  if (scorePosition === 'LOSING' || bagRisk === 'LOW') {
    return 'AGGRESSIVE';
  }
  
  // Partner considerations
  if (partnerBid === 0) {
    return 'CONSERVATIVE'; // Partner bid nil, be conservative
  }
  
  if (partnerBid !== null && partnerBid >= 5) {
    return 'AGGRESSIVE'; // Partner bid high, can be aggressive
  }
  
  // Default to more aggressive bidding to avoid low table bids
  if (bagRisk === 'MEDIUM' && scorePosition === 'CLOSE') {
    return 'AGGRESSIVE';
  }
  
  return 'BALANCED';
}

// Improved function to determine if should consider nil
function shouldConsiderNil(
  expectedTricks: number,
  spadesCount: number,
  hasAceSpades: boolean,
  strategy: 'CONSERVATIVE' | 'AGGRESSIVE' | 'BALANCED',
  partnerBid: number | null,
  allowNil: boolean
): boolean {
  if (!allowNil) return false;
  
  // Never nil with Ace of Spades
  if (hasAceSpades) return false;
  
  // Never nil with many spades (more conservative)
  if (spadesCount > 1) return false;
  
  // Only consider nil if very weak hand (0-1 expected tricks)
  if (expectedTricks > 1) return false;
  
  // Strategic nil considerations
  if (strategy === 'CONSERVATIVE' && expectedTricks <= 1) {
    return true;
  }
  
  // Partner considerations
  if (partnerBid === 0) {
    // Partner bid nil, consider nil if very weak
    return expectedTricks <= 1;
  }
  
  if (partnerBid !== null && partnerBid >= 5) {
    // Partner bid high, consider nil if very weak
    return expectedTricks <= 1;
  }
  
  // Strategic nil when we have bags and hand is weak
  if (strategy === 'CONSERVATIVE' && expectedTricks <= 1) {
    return true;
  }
  
  // Aggressive nil when opponents have bags and hand is weak
  if (strategy === 'AGGRESSIVE' && expectedTricks <= 0.5) {
    return true;
  }
  
  return false;
}

// Main bot bidding function
function calculateBotBid(
  hand: Card[], 
  game: Game, 
  playerIndex: number, 
  gameType?: string, 
  partnerBid?: number, 
  forcedBid?: string, 
  allowNil?: boolean, 
  allowBlindNil?: boolean
): number {
  if (!hand || hand.length === 0) return 1;
  
  // Handle forced bid game types first
  if (forcedBid === 'BID4NIL') {
    // 4 OR NIL: 50% chance to bid 4, 50% chance to nil
    return Math.random() < 0.5 ? 4 : 0;
  }
  
  if (forcedBid === 'BID3') {
    // BID 3: Must bid exactly 3
    return 3;
  }
  
  if (forcedBid === 'BIDHEARTS') {
    // BID HEARTS: Must bid number of hearts
    return hand.filter(c => c.suit === 'H').length;
  }
  
  if (forcedBid === 'CRAZY ACES') {
    // CRAZY ACES: Must bid 3 for each ace
    const acesCount = hand.filter(c => c.rank === 'A').length;
    return acesCount * 3;
  }
  
  if (forcedBid === 'SUICIDE') {
    return calculateSuicideBid(hand, game, playerIndex, partnerBid);
  }
  
  // Handle game-specific logic
  if (gameType === 'WHIZ') {
    return calculateWhizBid(hand, allowNil);
  }
  
  if (gameType === 'MIRROR') {
    // MIRROR: Must bid spades count
    return countSpades(hand);
  }
  
  // Generic bidding logic for all other game types
  return calculateGenericBid(hand, game, playerIndex, allowNil);
}

// Suicide-specific bidding logic
function calculateSuicideBid(hand: Card[], game: Game, playerIndex: number, partnerBid?: number): number {
  const spadesCount = countSpades(hand);
  const hasAceSpades = hasAceOfSpades(hand);
  const expectedTricks = calculateExpectedTricks(hand);
  const isFirstPartner = getBiddingPosition(game, playerIndex) === 'EARLY';
  
  if (isFirstPartner) {
    // First partner decides: nil or let partner nil
    if (expectedTricks <= 1.5 && spadesCount <= 1 && !hasAceSpades) {
      return 0; // Nil - my hand is weak
    }
    return Math.max(2, Math.round(expectedTricks)); // Let partner nil
  } else {
    // Second partner - forced to nil if partner didn't
    if (partnerBid === null || partnerBid > 0) {
      return 0; // Forced nil
    }
    return Math.max(2, Math.round(expectedTricks)); // Normal bid
  }
}

// Whiz-specific bidding logic
function calculateWhizBid(hand: Card[], allowNil?: boolean): number {
  const spadesCount = countSpades(hand);
  const hasAceSpades = hasAceOfSpades(hand);
  
  // If no spades, must bid nil (unless nil is disabled)
  if (spadesCount === 0) {
    return allowNil ? 0 : 1;
  }
  
  // NEVER bid nil with spades in Whiz
  return spadesCount;
}

// Improved generic bidding logic for all other game types
function calculateGenericBid(hand: Card[], game: Game, playerIndex: number, allowNil?: boolean): number {
  // 1. Calculate base bid using the improved counting system
  const baseBid = calculateExpectedTricks(hand);
  const spadesCount = countSpades(hand);
  const hasAceSpades = hasAceOfSpades(hand);
  
  // 2. Analyze game state for strategic decisions
  const scorePosition = analyzeScorePosition(game, playerIndex);
  const bagRisk = analyzeBagRisk(game, playerIndex);
  const biddingPosition = getBiddingPosition(game, playerIndex);
  const partnerBid = getPartnerBid(game, playerIndex);
  
  // 3. Determine bidding strategy
  const strategy = determineBiddingStrategy(scorePosition, bagRisk, biddingPosition, partnerBid);
  
  // 4. Strategic nil consideration
  if (shouldConsiderNil(baseBid, spadesCount, hasAceSpades, strategy, partnerBid, allowNil || false)) {
    return 0; // Nil
  }
  
  // 5. Apply strategic adjustments based on game state
  let finalBid = baseBid;
  
  // Aggressive bidding when opponents have bags
  if (bagRisk === 'LOW') {
    finalBid = Math.min(13, Math.ceil(baseBid * 1.2)); // 20% boost
  }
  
  // Conservative bidding when we have bags
  if (bagRisk === 'HIGH') {
    finalBid = Math.max(1, Math.floor(baseBid * 0.8)); // 20% reduction
  }
  
  // Partner considerations
  if (partnerBid !== null) {
    const totalTeamBid = partnerBid + finalBid;
    
    // If partner bid high, we can be more conservative
    if (partnerBid >= 5) {
      finalBid = Math.max(1, Math.floor(finalBid * 0.9));
    }
    
    // If partner bid low, we should be more aggressive
    if (partnerBid <= 2) {
      finalBid = Math.min(13, Math.ceil(finalBid * 1.1));
    }
    
    // Avoid very low table bids (aim for 10-13 total)
    if (totalTeamBid < 8 && baseBid >= 3) {
      finalBid = Math.max(finalBid, 4); // Minimum bid of 4 if we have decent hand
    }
  }
  
  // Bidding position adjustments
  if (biddingPosition === 'LATE') {
    // Late bidders can be more aggressive if table bid is low
    const currentTableBid = game.bidding?.bids?.reduce((sum, bid) => sum + (bid || 0), 0) || 0;
    if (currentTableBid < 8 && baseBid >= 3) {
      finalBid = Math.max(finalBid, 4);
    }
  }
  
  // Ensure minimum bid of 1 (unless nil)
  return Math.max(1, Math.min(13, Math.round(finalBid)));
}

// --- Basic Bot Engine ---
export function botMakeMove(game: Game, seatIndex: number) {
  const bot = game.players[seatIndex];
  console.log('[BOT DEBUG] botMakeMove called for seat', seatIndex, 'bot:', bot && bot.username, 'game.status:', game.status, 'bidding:', !!game.bidding, 'currentBidderIndex:', game.bidding?.currentBidderIndex, 'bids:', game.bidding?.bids);
  if (!bot) {
    console.log('[BOT DEBUG] No player at seat', seatIndex);
    return;
  }
  
  // Handle both bot moves and human timeout moves
  if (bot.type !== 'bot') {
    console.log('[BOT DEBUG] Player is human, acting for timeout:', bot.username);
  }
  // Only act if it's the bot's turn to bid
  if (game.status === 'BIDDING' && game.bidding && game.bidding.currentBidderIndex === seatIndex && game.bidding.bids && game.bidding.bids[seatIndex] === null) {
    setTimeout(() => {
      if (!game.bidding || !game.bidding.bids) return; // Guard for undefined
      console.log('[BOT DEBUG] Bot', bot.username, 'is making a bid...');
      // Calculate bid based on game type - always use intelligent bidding
      let bid = 1;
      if (game.rules && game.hands && game.hands[seatIndex]) {
        // Get partner bid for smart bidding logic
        let partnerBid: number | undefined;
        if ((game.rules.bidType === 'WHIZ' || game.forcedBid === 'SUICIDE') && game.bidding && game.bidding.bids) {
          // In partners mode, partner is at seatIndex + 2 (opposite side)
          const partnerIndex = (seatIndex + 2) % 4;
          partnerBid = game.bidding.bids[partnerIndex];
        }
        
        if (game.rules.bidType === 'MIRROR') {
          // Mirror games: bid the number of spades in hand
          const spades = game.hands[seatIndex].filter(c => c.suit === 'S');
          bid = spades.length;
          console.log('[BOT DEBUG] Mirror game - Bot', bot.username, 'has', spades.length, 'spades, bidding', bid);
        } else if (game.rules.bidType === 'WHIZ') {
          // Whiz games: use simplified bidding logic
          bid = calculateBotBid(game.hands[seatIndex], game, seatIndex, 'WHIZ', partnerBid, undefined, game.rules.allowNil, game.rules.allowBlindNil);
          console.log('[BOT DEBUG] Whiz game - Bot', bot.username, 'has', game.hands[seatIndex].filter(c => c.suit === 'S').length, 'spades, partner bid:', partnerBid, 'bidding', bid);
        } else if (game.forcedBid === 'SUICIDE') {
          // Suicide games: implement suicide bidding logic
          bid = calculateBotBid(game.hands[seatIndex], game, seatIndex, 'REG', partnerBid, 'SUICIDE', game.rules.allowNil, game.rules.allowBlindNil);
          console.log('[BOT DEBUG] Suicide game - Bot', bot.username, 'has', game.hands[seatIndex].filter(c => c.suit === 'S').length, 'spades, partner bid:', partnerBid, 'bidding', bid);
        } else if (game.forcedBid === 'BID4NIL') {
          // 4 OR NIL games: bot must bid 4 or nil
          bid = calculateBotBid(game.hands[seatIndex], game, seatIndex, 'REG', partnerBid, 'BID4NIL', game.rules.allowNil, game.rules.allowBlindNil);
          console.log('[BOT DEBUG] 4 OR NIL game - Bot', bot.username, 'bidding', bid);
        } else if (game.forcedBid === 'BID3') {
          // BID 3 games: bot must bid exactly 3
          bid = calculateBotBid(game.hands[seatIndex], game, seatIndex, 'REG', partnerBid, 'BID3', game.rules.allowNil, game.rules.allowBlindNil);
          console.log('[BOT DEBUG] BID 3 game - Bot', bot.username, 'bidding', bid);
        } else if (game.forcedBid === 'BIDHEARTS') {
          // BID HEARTS games: bot must bid number of hearts
          bid = calculateBotBid(game.hands[seatIndex], game, seatIndex, 'REG', partnerBid, 'BIDHEARTS', game.rules.allowNil, game.rules.allowBlindNil);
          console.log('[BOT DEBUG] BID HEARTS game - Bot', bot.username, 'has', game.hands[seatIndex].filter(c => c.suit === 'H').length, 'hearts, bidding', bid);
        } else if (game.forcedBid === 'CRAZY ACES') {
          // CRAZY ACES games: bot must bid 3 for each ace
          bid = calculateBotBid(game.hands[seatIndex], game, seatIndex, 'REG', partnerBid, 'CRAZY ACES', game.rules.allowNil, game.rules.allowBlindNil);
          console.log('[BOT DEBUG] CRAZY ACES game - Bot', bot.username, 'has', game.hands[seatIndex].filter(c => c.rank === 'A').length, 'aces, bidding', bid);
        } else if (game.rules.bidType === 'REG') {
          // Regular games: use complex bidding logic
          bid = calculateBotBid(game.hands[seatIndex], game, seatIndex, 'REG', partnerBid, undefined, game.rules.allowNil, game.rules.allowBlindNil);
        } else {
          // Default fallback - still use intelligent bidding
          bid = calculateBotBid(game.hands[seatIndex], game, seatIndex, 'REG', partnerBid, undefined, game.rules.allowNil, game.rules.allowBlindNil);
        }
      } else {
        // Fallback if game state is incomplete - still try to use intelligent bidding
        console.log('[BOT DEBUG] Game state incomplete, using fallback bidding for', bot.username);
        bid = calculateBotBid([], game, seatIndex, 'REG', undefined, undefined, true, false);
      }
      // Simulate bot making a bid
      game.bidding.bids[seatIndex] = bid;
      console.log('[BOT DEBUG] Bot', bot.username, 'bid', bid);
      // Find next player who hasn't bid
      let next = (seatIndex + 1) % 4;
      while (game.bidding.bids[next] !== null && next !== seatIndex) {
        next = (next + 1) % 4;
      }
      if (game.bidding.bids.every(b => b !== null)) {
        // All bids in, move to play phase
        // --- Play phase state ---
        if (typeof game.dealerIndex !== 'number') {
          io.to(game.id).emit('error', { message: 'Invalid game state: no dealer assigned' });
          return;
        }
        const firstPlayer = game.players[(game.dealerIndex + 1) % 4];
        if (!firstPlayer) {
          io.to(game.id).emit('error', { message: 'Invalid game state' });
          return;
        }
        
        // CRITICAL FIX: Ensure game status is properly updated
        game.status = 'PLAYING';
        game.play = {
          currentPlayer: firstPlayer.id ?? '',
          currentPlayerIndex: (game.dealerIndex + 1) % 4,
          currentTrick: [],
          tricks: [],
          trickNumber: 0,
          spadesBroken: false
        };
        
        console.log('[BIDDING COMPLETE - BOT] Moving to play phase, first player:', firstPlayer.username, 'at index:', (game.dealerIndex + 1) % 4, 'game.status:', game.status);
        
        // Emit game_update for client sync
        io.to(game.id).emit('game_update', enrichGameForClient(game));
        io.to(game.id).emit('bidding_complete', { currentBidderIndex: null, bids: game.bidding.bids });
        io.to(game.id).emit('play_start', {
          gameId: game.id,
          currentPlayerIndex: game.play.currentPlayerIndex,
          currentTrick: game.play.currentTrick,
          trickNumber: game.play.trickNumber,
        });
        
        // If first player is a bot, trigger bot card play
        if (firstPlayer.type === 'bot') {
          console.log('[BOT DEBUG] (ROUTES) About to call botPlayCard for seat', (game.dealerIndex + 1) % 4, 'bot:', firstPlayer.username);
          setTimeout(() => {
            botPlayCard(game, (game.dealerIndex + 1) % 4);
          }, 500);
        } else if (firstPlayer.type === 'human') {
          // Start timeout for human players in playing phase using the main timeout system
          console.log('[TIMEOUT DEBUG] Starting timeout for human player in playing phase:', firstPlayer.username);
          // Import the timeout function from index.ts
          const { startTurnTimeout } = require('../index');
          startTurnTimeout(game, (game.dealerIndex + 1) % 4, 'playing');
        }
        return;
      } else {
        if (!game.bidding) return; // Guard for undefined
        game.bidding.currentBidderIndex = next;
        game.bidding.currentPlayer = game.players[next]?.id ?? '';
        io.to(game.id).emit('bidding_update', {
          currentBidderIndex: next,
          bids: game.bidding.bids,
        });
        console.log('[BOT DEBUG] Next bidder is', game.players[next]?.username, 'at seat', next);
        // If next is a bot, trigger their move
        if (game.players[next] && game.players[next].type === 'bot') {
          botMakeMove(game, next);
        } else if (game.players[next] && game.players[next].type === 'human') {
          // Start timeout for human players using the main timeout system
          console.log('[TIMEOUT DEBUG] Starting timeout for human player in bot bidding logic:', game.players[next].username);
          // Import the timeout function from index.ts
          const { startTurnTimeout } = require('../index');
          startTurnTimeout(game, next, 'bidding');
        }
      }
    }, 600);
  } else {
    console.log('[BOT DEBUG] Conditions not met for bot to bid. Status:', game.status, 'currentBidderIndex:', game.bidding?.currentBidderIndex, 'seatIndex:', seatIndex, 'bid already made:', game.bidding?.bids ? game.bidding.bids[seatIndex] : undefined);
  }
}

/**
 * Call this after every player move (bid, play card, etc.)
 * It will check if the next player is a bot and, if so, trigger their move.
 */
function advanceTurnOrBotMove(game: Game, nextSeatIndex: number) {
  const nextPlayer = game.players[nextSeatIndex];
  if (nextPlayer && nextPlayer.type === 'bot') {
    botMakeMove(game, nextSeatIndex);
  }
}

// --- Smart Card Selection Functions for All Game Types ---

// Helper function to determine if a card is "boss" (highest remaining in its suit)
function isBossCard(card: Card, allHands: Card[][], currentTrick: Card[]): boolean {
  const suit = card.suit;
  const rank = card.rank;
  
  // Check if this card is the highest remaining in its suit
  const allCardsInSuit = allHands.flat().filter(c => c.suit === suit);
  const cardsInTrick = currentTrick.filter(c => c.suit === suit);
  const remainingCards = allCardsInSuit.filter(c => 
    !cardsInTrick.some(trickCard => trickCard.suit === c.suit && trickCard.rank === c.rank)
  );
  
  if (remainingCards.length === 0) return false;
  
  const highestRemaining = remainingCards.reduce((highest, c) => 
    getCardValue(c.rank) > getCardValue(highest.rank) ? c : highest
  );
  
  return highestRemaining.suit === suit && highestRemaining.rank === rank;
}

// Helper function to get partner's void suits
function getPartnerVoidSuits(partnerHand: Card[]): string[] {
  const allSuits = ['H', 'D', 'C', 'S'];
  return allSuits.filter(suit => !partnerHand.some(card => card.suit === suit));
}

// Helper function to get opponent void suits (based on what's been played)
function getOpponentVoidSuits(game: Game, currentTrick: Card[]): { [key: string]: boolean } {
  const voidSuits: { [key: string]: boolean } = { 'H': false, 'D': false, 'C': false, 'S': false };
  
  // This is a simplified version - in a real implementation, you'd track what each opponent has played
  // For now, we'll use a basic heuristic based on what's been played in the current trick
  currentTrick.forEach(card => {
    // If a high card is played, it might indicate the player is void in other suits
    if (getCardValue(card.rank) >= 10) {
      // This is a very basic heuristic - in practice you'd need more sophisticated tracking
    }
  });
  
  return voidSuits;
}

// Helper function to count remaining spades for each team
function getSpadeCounts(game: Game): { team1Spades: number, team2Spades: number } {
  const team1Spades = (game.hands?.[0]?.filter(c => c.suit === 'S').length || 0) + 
                     (game.hands?.[2]?.filter(c => c.suit === 'S').length || 0);
  const team2Spades = (game.hands?.[1]?.filter(c => c.suit === 'S').length || 0) + 
                     (game.hands?.[3]?.filter(c => c.suit === 'S').length || 0);
  return { team1Spades, team2Spades };
}

// Helper function to determine if partner is likely to win the trick
function isPartnerLikelyToWin(currentTrick: Card[], partnerHand: Card[]): boolean {
  if (currentTrick.length === 0) return false;
  
  const leadSuit = currentTrick[0].suit;
  const highestOnTable = currentTrick.reduce((highest, card) => 
    getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
  );
  
  // Check if partner has higher cards in the lead suit
  const partnerCardsInSuit = partnerHand.filter(c => c.suit === leadSuit);
  const partnerCanWin = partnerCardsInSuit.some(c => getCardValue(c.rank) > getCardValue(highestOnTable.rank));
  
  // Check if partner has boss cards
  const partnerBossCards = partnerCardsInSuit.filter(c => isBossCard(c, [partnerHand], currentTrick));
  
  return partnerCanWin || partnerBossCards.length > 0;
}

// Main card selection function for normal bidding (non-nil)
function selectCardToWin(playableCards: Card[], currentTrick: Card[], hand: Card[], game: Game, seatIndex: number): Card {
  const partnerIndex = (seatIndex + 2) % 4;
  const partnerHand = game.hands?.[partnerIndex] || [];
  const { team1Spades, team2Spades } = getSpadeCounts(game);
  const isTeam1 = seatIndex === 0 || seatIndex === 2;
  const ourSpades = isTeam1 ? team1Spades : team2Spades;
  const theirSpades = isTeam1 ? team2Spades : team1Spades;
  
  // Check if this is a mirror game (table bid is always 13)
  const isMirrorGame = game.rules?.bidType === 'MIRROR';
  const totalTableBid = game.bidding?.bids.reduce((sum, bid) => sum + (bid || 0), 0) || 0;
  const isHighBidGame = totalTableBid >= 12 || isMirrorGame;
  
  // Debug logging for spade counts
  console.log(`[BOT SPADE DEBUG] Bot at seat ${seatIndex}, Team1 spades: ${team1Spades}, Team2 spades: ${team2Spades}, Our spades: ${ourSpades}, Their spades: ${theirSpades}`);
  console.log(`[BOT SPADE DEBUG] Is high bid game: ${isHighBidGame}, Total table bid: ${totalTableBid}, Is mirror: ${isMirrorGame}`);
  
  if (currentTrick.length === 0) {
    // Leading
    if (isHighBidGame) {
      // In high-bid games, be more aggressive about winning tricks
      
      // 1. Run spades if we have more than opponents (HIGHEST PRIORITY)
      if (ourSpades > theirSpades && ourSpades > 0) {
        const spades = playableCards.filter(c => c.suit === 'S');
        console.log(`[BOT SPADE DEBUG] Should run spades! Our spades: ${ourSpades}, Their spades: ${theirSpades}, Available spades: ${spades.length}`);
        if (spades.length > 0) {
          // Lead highest spade
          const highestSpade = spades.reduce((highest, card) => 
            getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
          );
          console.log(`[BOT SPADE DEBUG] Leading highest spade: ${highestSpade.rank}${highestSpade.suit}`);
          return highestSpade;
        }
      } else {
        console.log(`[BOT SPADE DEBUG] Not running spades. Our spades: ${ourSpades}, Their spades: ${theirSpades}, Our spades > 0: ${ourSpades > 0}`);
      }
      
      // 2. Lead partner's void suits if we have spades left
      const partnerVoidSuits = getPartnerVoidSuits(partnerHand);
      for (const suit of partnerVoidSuits) {
        const suitCards = playableCards.filter(c => c.suit === suit);
        if (suitCards.length > 0 && ourSpades > theirSpades) {
          // Lead highest card in partner's void suit
          return suitCards.reduce((highest, card) => 
            getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
          );
        }
      }
      
      // 3. Lead boss cards
      const bossCards = playableCards.filter(c => isBossCard(c, game.hands || [], currentTrick));
      if (bossCards.length > 0) {
        return bossCards.reduce((highest, card) => 
          getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
        );
      }
      
      // 4. Lead highest card
      return playableCards.reduce((highest, card) => 
        getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
      );
    } else {
      // In low-bid games, be more conservative
      return playableCards.reduce((highest, card) => 
        getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
      );
    }
  } else {
    // Following
    const leadSuit = currentTrick[0].suit;
    const highestOnTable = currentTrick.reduce((highest, card) => 
      getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
    );
    
    const cardsOfLeadSuit = playableCards.filter(c => c.suit === leadSuit);
    
    if (cardsOfLeadSuit.length > 0) {
      // Must follow suit
      const winningCards = cardsOfLeadSuit.filter(c => 
        getCardValue(c.rank) > getCardValue(highestOnTable.rank)
      );
      
      if (winningCards.length > 0) {
        // Can win - check if partner is likely to win
        if (isPartnerLikelyToWin(currentTrick, partnerHand)) {
          // Partner can win - don't waste high cards
          return winningCards.reduce((lowest, card) => 
            getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
          );
        } else {
          // Partner can't win - play to win
          return winningCards.reduce((lowest, card) => 
            getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
          );
        }
      } else {
        // Can't win - play lowest card
        return cardsOfLeadSuit.reduce((lowest, card) => 
          getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
        );
      }
    } else {
      // Void in lead suit - smart spade usage based on table bid and void count
      const spades = playableCards.filter(c => c.suit === 'S');
      
      if (spades.length > 0) {
        // Check if we should avoid cutting due to multiple void players
        if (shouldAvoidCutting(game, seatIndex, leadSuit)) {
          // Multiple players void - consider playing another suit instead of cutting
          const nonSpades = playableCards.filter(c => c.suit !== 'S');
          if (nonSpades.length > 0) {
            // Play highest non-spade to avoid wasting spades
            return nonSpades.reduce((highest, card) => 
              getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
            );
          }
        }
        
        // Have spades - smart cutting strategy based on table bid
        if (isHighBidGame) {
          // High bid game (>10) - preserve high spades, use lowest that can win
          const winningSpades = spades.filter(c => 
            getCardValue(c.rank) > getCardValue(highestOnTable.rank)
          );
          
          if (winningSpades.length > 0) {
            // Can win - use lowest spade that will win
            return winningSpades.reduce((lowest, card) => 
              getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
            );
          } else {
            // Can't win - play lowest spade to preserve high ones
            return spades.reduce((lowest, card) => 
              getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
            );
          }
        } else {
          // Low bid game (≤10) - avoid bags, use highest spade to ensure we win
          const winningSpades = spades.filter(c => 
            getCardValue(c.rank) > getCardValue(highestOnTable.rank)
          );
          
          if (winningSpades.length > 0) {
            // Can win - use highest spade to avoid bags
            return winningSpades.reduce((highest, card) => 
              getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
            );
          } else {
            // Can't win - still use highest spade to avoid bags
            return spades.reduce((highest, card) => 
              getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
            );
          }
        }
      } else {
        // No spades - discard highest card
        return playableCards.reduce((highest, card) => 
          getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
        );
      }
    }
  }
}

// Card selection for nil players
function selectCardForNil(playableCards: Card[], currentTrick: Card[], hand: Card[]): Card {
  if (currentTrick.length === 0) {
    // Leading - play lowest card possible
    return playableCards.reduce((lowest, card) => 
      getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
    );
  }
  
  // Following - try to play highest card under the current highest
  const leadSuit = currentTrick[0].suit;
  const highestOnTable = currentTrick.reduce((highest, card) => 
    getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
  );
  
  const cardsOfLeadSuit = playableCards.filter(c => c.suit === leadSuit);
  if (cardsOfLeadSuit.length > 0) {
    // Must follow suit - play highest card under the highest on table
    const cardsUnderHighest = cardsOfLeadSuit.filter(c => 
      getCardValue(c.rank) < getCardValue(highestOnTable.rank)
    );
    
    if (cardsUnderHighest.length > 0) {
      // Play highest card under the highest on table
      return cardsUnderHighest.reduce((highest, card) => 
        getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
      );
    } else {
      // All cards are higher - play the lowest
      return cardsOfLeadSuit.reduce((lowest, card) => 
        getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
      );
    }
  } else {
    // Void in lead suit - discard highest cards in other suits (not spades)
    const nonSpades = playableCards.filter(c => c.suit !== 'S');
    if (nonSpades.length > 0) {
      // Discard highest non-spade
      return nonSpades.reduce((highest, card) => 
        getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
      );
    } else {
      // Only spades left - play lowest spade
      return playableCards.reduce((lowest, card) => 
        getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
      );
    }
  }
}

// Helper function to determine if we should avoid cutting when multiple bots are void
function shouldAvoidCutting(game: Game, seatIndex: number, leadSuit: string): boolean {
  const totalTableBid = game.bidding?.bids.reduce((sum, bid) => sum + (bid || 0), 0) || 0;
  const isHighBidGame = totalTableBid > 10;
  
  if (!isHighBidGame) return false; // In low bid games, always cut to avoid bags
  
  // Check how many players are void in the lead suit
  let voidCount = 0;
  for (let i = 0; i < 4; i++) {
    const playerHand = game.hands?.[i];
    if (playerHand && !playerHand.some(c => c.suit === leadSuit)) {
      voidCount++;
    }
  }
  
  // If multiple players are void, be more conservative about cutting
  return voidCount > 1;
}

// Card selection when partner is nil
function selectCardToCoverPartner(playableCards: Card[], currentTrick: Card[], hand: Card[], partnerHand: Card[], game: Game, seatIndex: number): Card {
  // Get table bid to determine spade strategy
  const totalTableBid = game.bidding?.bids.reduce((sum, bid) => sum + (bid || 0), 0) || 0;
  const isHighBidGame = totalTableBid > 10;
  
  // Determine play order to see if we're playing before or after nil partner
  const nilPartnerIndex = (seatIndex + 2) % 4;
  const playOrder = [game.play?.currentPlayerIndex || 0];
  let currentPlayer = (game.play?.currentPlayerIndex || 0 + 1) % 4;
  while (currentPlayer !== game.play?.currentPlayerIndex) {
    playOrder.push(currentPlayer);
    currentPlayer = (currentPlayer + 1) % 4;
  }
  
  const ourPosition = playOrder.indexOf(seatIndex);
  const nilPartnerPosition = playOrder.indexOf(nilPartnerIndex);
  const playingAfterNilPartner = ourPosition > nilPartnerPosition;
  
  console.log(`[NIL COVER DEBUG] Bot ${seatIndex} covering nil partner ${nilPartnerIndex}, table bid: ${totalTableBid}, playing after nil: ${playingAfterNilPartner}`);
  
  if (currentTrick.length === 0) {
    // Leading - lead highest cards first, especially in suits partner is void
    const partnerVoidSuits = getPartnerVoidSuits(partnerHand);
    
    // Prioritize leading in suits partner is void
    for (const suit of partnerVoidSuits) {
      const suitCards = playableCards.filter(c => c.suit === suit);
      if (suitCards.length > 0) {
        // Lead highest card in this suit
        return suitCards.reduce((highest, card) => 
          getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
        );
      }
    }
    
    // If no void suits available, lead highest card
    return playableCards.reduce((highest, card) => 
      getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
    );
  }
  
  // Following - play to win if possible, otherwise play high
  const leadSuit = currentTrick[0].suit;
  const highestOnTable = currentTrick.reduce((highest, card) => 
    getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
  );
  
  const cardsOfLeadSuit = playableCards.filter(c => c.suit === leadSuit);
  if (cardsOfLeadSuit.length > 0) {
    // Can beat the highest on table
            const winningCards = cardsOfLeadSuit.filter(c => 
          getCardValue(c.rank) > getCardValue(highestOnTable.rank)
        );
    
    if (winningCards.length > 0) {
      // Play lowest winning card
      return winningCards.reduce((lowest, card) => 
        getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
      );
    } else {
      // Can't win - play highest card
      return cardsOfLeadSuit.reduce((highest, card) => 
        getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
      );
    }
      } else {
      // Void in lead suit - smart spade usage based on table bid, play order, and void count
      const spades = playableCards.filter(c => c.suit === 'S');
      if (spades.length > 0) {
        // Check if we should avoid cutting due to multiple void players
        if (shouldAvoidCutting(game, seatIndex, leadSuit)) {
          // Multiple players void - consider playing another suit instead of cutting
          const nonSpades = playableCards.filter(c => c.suit !== 'S');
          if (nonSpades.length > 0) {
            // Play highest non-spade to avoid wasting spades
            return nonSpades.reduce((highest, card) => 
              getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
            );
          }
        }
        
        if (isHighBidGame && playingAfterNilPartner) {
          // High bid game and playing after nil partner - save high spades, use lowest that can win
          const winningSpades = spades.filter(c => 
            getCardValue(c.rank) > getCardValue(highestOnTable.rank)
          );
          
          if (winningSpades.length > 0) {
            // Use lowest spade that can win
            return winningSpades.reduce((lowest, card) => 
              getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
            );
          } else {
            // Can't win with spades - play lowest spade to avoid wasting high ones
            return spades.reduce((lowest, card) => 
              getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
            );
          }
        } else if (isHighBidGame && !playingAfterNilPartner) {
          // High bid game and playing before nil partner - can use higher spades strategically
          const winningSpades = spades.filter(c => 
            getCardValue(c.rank) > getCardValue(highestOnTable.rank)
          );
          
          if (winningSpades.length > 0) {
            // Use lowest spade that can win
            return winningSpades.reduce((lowest, card) => 
              getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
            );
          } else {
            // Can't win - play lowest spade to preserve high ones
            return spades.reduce((lowest, card) => 
              getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
            );
          }
        } else {
          // Low bid game - avoid bags, use highest spade to ensure we win
          return spades.reduce((highest, card) => 
            getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
          );
        }
      } else {
        // No spades - play highest card
        return playableCards.reduce((highest, card) => 
          getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
        );
      }
    }
}

// Special rules filtering function
function applySpecialRules(playableCards: Card[], hand: Card[], currentTrick: Card[], game: Game, seatIndex: number): Card[] {
  const specialRules = game.specialRules;
  if (!specialRules) return playableCards;
  
  const isLeading = currentTrick.length === 0;
  const leadSuit = isLeading ? null : currentTrick[0].suit;
  const spadesBroken = game.play?.spadesBroken || false;
  
  // Assassin rules: Players must play spades whenever possible
  if (specialRules.assassin) {
    console.log(`[SPECIAL RULES] Assassin active for bot at seat ${seatIndex}`);
    
    if (isLeading) {
      // When leading, must lead spades if spades are broken and have spades
      const spades = hand.filter(c => c.suit === 'S');
      if (spadesBroken && spades.length > 0) {
        // Spades broken and have spades - must lead spades
        const spadePlayable = playableCards.filter(c => c.suit === 'S');
        if (spadePlayable.length > 0) {
          console.log(`[SPECIAL RULES] Assassin: Must lead spades, using spades:`, spadePlayable);
          return spadePlayable;
        }
      }
    } else {
      // Following suit
      if (leadSuit !== 'S') {
        // Not leading spades - must trump if have spades and void in lead suit
        const cardsOfLeadSuit = hand.filter(c => c.suit === leadSuit);
        if (cardsOfLeadSuit.length === 0) {
          // Void in lead suit - must cut if have spades
          const spades = hand.filter(c => c.suit === 'S');
          if (spades.length > 0) {
            const spadePlayable = playableCards.filter(c => c.suit === 'S');
            if (spadePlayable.length > 0) {
              console.log(`[SPECIAL RULES] Assassin: Must cut with spades:`, spadePlayable);
              return spadePlayable;
            }
          }
        }
      }
    }
  }
  
  return playableCards;
}



// --- Bot Card Play Logic ---
export function botPlayCard(game: Game, seatIndex: number) {
  const bot = game.players[seatIndex];
  if (!bot || bot.type !== 'bot' || !game.hands || !game.play) return;
  
  // Guard: Make sure it's actually this bot's turn
  if (game.play.currentPlayerIndex !== seatIndex) {
    console.log('[BOT GUARD] Bot', bot.username, 'at seat', seatIndex, 'tried to play but current player is', game.play.currentPlayerIndex);
    return;
  }
  const hand = game.hands[seatIndex]!;
  if (!hand || hand.length === 0) return;
  // Determine lead suit for this trick
  const leadSuit = game.play.currentTrick.length > 0 ? game.play.currentTrick[0].suit : null;
  // Find playable cards with special rules consideration
  let playableCards: Card[] = [];
  const specialRules = game.specialRules;
  
  console.log(`[BOT SCREAMER DEBUG] Bot ${bot.username} at seat ${seatIndex} - specialRules:`, specialRules);
  console.log(`[BOT SCREAMER DEBUG] Bot ${bot.username} hand:`, hand.map(c => `${c.rank}${c.suit}`));
  console.log(`[BOT SCREAMER DEBUG] Bot ${bot.username} leadSuit:`, leadSuit);
  
  if (leadSuit) {
    // Following suit - must follow lead suit if possible
    playableCards = hand.filter(c => c.suit === leadSuit);
    if (playableCards.length === 0) {
      // Void in lead suit - can play any card, but apply special rules
      if (specialRules?.screamer) {
        // Screamer: cannot cut with spades unless only spades left
        const nonSpades = hand.filter(c => c.suit !== 'S');
        if (nonSpades.length > 0) {
          playableCards = nonSpades; // Must play non-spades if available
          console.log(`[BOT SCREAMER DEBUG] Bot ${bot.username} - Screamer rule applied: cannot cut with spades, using non-spades:`, playableCards.map(c => `${c.rank}${c.suit}`));
        } else {
          playableCards = hand; // Only spades left, can play spades
          console.log(`[BOT SCREAMER DEBUG] Bot ${bot.username} - Screamer rule applied: only spades left, can play spades:`, playableCards.map(c => `${c.rank}${c.suit}`));
        }
      } else {
        playableCards = hand; // No special rules, can play anything
        console.log(`[BOT SCREAMER DEBUG] Bot ${bot.username} - No special rules, can play anything:`, playableCards.map(c => `${c.rank}${c.suit}`));
      }
    }
  } else {
    // Bot is leading
    if (specialRules?.screamer) {
      // Screamer: cannot lead spades unless only spades left
      const nonSpades = hand.filter(c => c.suit !== 'S');
      if (nonSpades.length > 0) {
        playableCards = nonSpades; // Must lead non-spades if available
        console.log(`[BOT SCREAMER DEBUG] Bot ${bot.username} - Screamer rule applied: cannot lead spades, using non-spades:`, playableCards.map(c => `${c.rank}${c.suit}`));
      } else {
        playableCards = hand; // Only spades left, can lead spades
        console.log(`[BOT SCREAMER DEBUG] Bot ${bot.username} - Screamer rule applied: only spades left, can lead spades:`, playableCards.map(c => `${c.rank}${c.suit}`));
      }
    } else {
      // Normal rules: cannot lead spades unless spades broken or only spades left
    if (game.play.spadesBroken || hand.every(c => c.suit === 'S')) {
      playableCards = hand; // Can lead any card
        console.log(`[BOT SCREAMER DEBUG] Bot ${bot.username} - Normal rules: spades broken or only spades, can lead anything:`, playableCards.map(c => `${c.rank}${c.suit}`));
    } else {
      // Cannot lead spades unless only spades left
      playableCards = hand.filter(c => c.suit !== 'S');
      if (playableCards.length === 0) {
        playableCards = hand; // Only spades left, must lead spades
        }
        console.log(`[BOT SCREAMER DEBUG] Bot ${bot.username} - Normal rules: cannot lead spades, using non-spades:`, playableCards.map(c => `${c.rank}${c.suit}`));
      }
    }
  }
  
  console.log(`[BOT SCREAMER DEBUG] Bot ${bot.username} final playableCards:`, playableCards.map(c => `${c.rank}${c.suit}`));
  
  // Apply additional special rules filtering (like Assassin)
  playableCards = applySpecialRules(playableCards, hand, game.play.currentTrick, game, seatIndex);
  
  // Smart bot card selection based on game type and bidding
  let card: Card;
  
  // Get bot's bid and partner's bid to determine strategy
  const botBid = game.bidding?.bids[seatIndex];
  const partnerIndex = (seatIndex + 2) % 4; // Partner is 2 seats away
  const partnerBid = game.bidding?.bids[partnerIndex];
  
  // Check if this is a Suicide game
  if (game.forcedBid === 'SUICIDE') {
    if (botBid === 0) {
      // Bot is nil - try to avoid winning tricks
      card = selectCardForNil(playableCards, game.play.currentTrick, hand);
    } else if (partnerBid === 0) {
      // Partner is nil - try to cover partner
      card = selectCardToCoverPartner(playableCards, game.play.currentTrick, hand, game.hands[partnerIndex] || [], game, seatIndex);
    } else {
      // Normal bidding - play to win
      card = selectCardToWin(playableCards, game.play.currentTrick, hand, game, seatIndex);
    }
  } else {
    // All other game types - check for nil players
    if (botBid === 0) {
      // Bot is nil - try to avoid winning tricks
      card = selectCardForNil(playableCards, game.play.currentTrick, hand);
    } else if (partnerBid === 0) {
      // Partner is nil - try to cover partner
      card = selectCardToCoverPartner(playableCards, game.play.currentTrick, hand, game.hands[partnerIndex] || [], game, seatIndex);
    } else {
      // Normal bidding - play to win
      card = selectCardToWin(playableCards, game.play.currentTrick, hand, game, seatIndex);
    }
  }
  if (!card) return;
  
  console.log(`[BOT SCREAMER DEBUG] Bot ${bot.username} selected card:`, `${card.rank}${card.suit}`);
  console.log(`[BOT SCREAMER DEBUG] Bot ${bot.username} selected card is spade:`, card.suit === 'S');
  console.log(`[BOT SCREAMER DEBUG] Bot ${bot.username} has non-spades:`, hand.filter(c => c.suit !== 'S').map(c => `${c.rank}${c.suit}`));
  
  setTimeout(() => {
    if (!game.play) return; // Guard for undefined
    console.log(`[BOT DEBUG] Bot ${bot.username} is playing card:`, card);
    // Simulate play_card event
    // This logic is similar to the play_card socket handler
    const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (cardIndex === -1) return;
    hand.splice(cardIndex, 1);
    game.play.currentTrick.push({ ...card, playerIndex: seatIndex });
    // Set spadesBroken if a spade is played
    if (card.suit === 'S') {
      game.play.spadesBroken = true;
    }
    
    // If trick is complete (4 cards)
    if (game.play.currentTrick.length === 4) {
      console.log('[BOT TRICK DEBUG] Determining winner for bot trick:', game.play.currentTrick);
      const winnerIndex = determineTrickWinner(game.play.currentTrick);
      console.log('[BOT TRICK DEBUG] Winner determined:', winnerIndex, 'Winner player:', game.players[winnerIndex]?.username);
      if (winnerIndex === undefined) return;
      game.play.tricks.push({
        cards: game.play.currentTrick,
        winnerIndex,
      });
      game.play.trickNumber += 1;
      console.log('[TRICK DEBUG] Trick completed, new trickNumber:', game.play.trickNumber);
      
      // NEW: Log the completed trick to database
      trickLogger.logTrickFromGame(game, game.play.trickNumber).catch((err: Error) => {
        console.error('Failed to log trick to database:', err);
      });
      game.play.currentPlayerIndex = winnerIndex;
      game.play.currentPlayer = game.players[winnerIndex]?.id ?? '';
      console.log('[BOT TRICK DEBUG] Set current player to winner:', winnerIndex, game.players[winnerIndex]?.username);
      // Update player trick counts
      if (game.players[winnerIndex]) {
        game.players[winnerIndex]!.tricks = (game.players[winnerIndex]!.tricks || 0) + 1;
        console.log('[TRICK COUNT DEBUG] Updated trick count for player', winnerIndex, game.players[winnerIndex]?.username, 'to', game.players[winnerIndex]!.tricks);
        console.log('[TRICK COUNT DEBUG] All player trick counts:', game.players.map((p, i) => `${i}: ${p?.username || 'null'} = ${p?.tricks || 0}`));
      }
        // Store the completed trick for animation before clearing
        const completedTrick = [...game.play.currentTrick];
        
        // Clear the trick immediately for proper game state
        game.play!.currentTrick = [];
        
        // Emit immediate game update with cleared trick and updated trick counts
        console.log('[BOT TRICK DEBUG] Emitting game_update with currentPlayer:', game.play?.currentPlayer, 'currentPlayerIndex:', game.play?.currentPlayerIndex);
        
        // Send game update to all players in the room
        io.to(game.id).emit('game_update', enrichGameForClient(game));
        
        // Emit trick complete with the stored trick data for animation
        io.to(game.id).emit('trick_complete', {
          trick: {
            cards: completedTrick,
            winnerIndex,
          },
          trickNumber: game.play.trickNumber,
        });
        
        // Emit clear trick event after animation delay
        setTimeout(() => {
          io.to(game.id).emit('clear_trick');
        }, 1200); // Reduced delay for faster animation
      // If all tricks played, move to hand summary/scoring
      console.log('[HAND COMPLETION CHECK] trickNumber:', game.play.trickNumber, 'checking if === 13');
      console.log('[HAND COMPLETION DEBUG] Current trick cards:', game.play.currentTrick.length, 'cards:', game.play.currentTrick);
      if (game.play.trickNumber === 13) {
        // --- Hand summary and scoring ---
        console.log('[HAND COMPLETION DEBUG] Game mode check:', game.gameMode, 'Type:', typeof game.gameMode);
        console.log('[HAND COMPLETION DEBUG] Full game object keys:', Object.keys(game));
        console.log('[HAND COMPLETION DEBUG] Game rules:', game.rules);
        
        if (game.gameMode === 'SOLO') {
          // Solo mode scoring
          const handSummary = calculateSoloHandScore(game);
          
          // Validate that we have exactly 13 tricks before proceeding
          const totalTricks = handSummary.tricksPerPlayer.reduce((a, b) => a + b, 0);
          if (totalTricks !== 13) {
            console.error(`[HAND COMPLETION ERROR] Invalid trick count: ${totalTricks}. Expected 13 tricks total. Cannot complete hand.`);
            console.error('[HAND COMPLETION ERROR] Tricks per player:', handSummary.tricksPerPlayer);
            console.error('[HAND COMPLETION ERROR] Game play tricks:', game.play.tricks);
            
            // Force a game update to show current state but don't complete the hand
            io.to(game.id).emit('game_update', enrichGameForClient(game));
            return;
          }
          
          // Update running totals for individual players
          game.playerScores = game.playerScores || [0, 0, 0, 0];
          game.playerBags = game.playerBags || [0, 0, 0, 0];
          
          for (let i = 0; i < 4; i++) {
            game.playerScores[i] += handSummary.playerScores[i];
            game.playerBags[i] += handSummary.playerBags[i];
          }
          
          // Set game status to indicate hand is completed
          game.status = 'HAND_COMPLETED';
          
          // NEW: Log completed hand to database
          trickLogger.logCompletedHand(game).catch((err: Error) => {
            console.error('Failed to log completed hand to database:', err);
          });
          
          console.log('[HAND COMPLETED] Solo mode - Emitting hand_completed event with data:', {
            // Current hand scores (for hand summary display)
            team1Score: handSummary.playerScores[0] + handSummary.playerScores[2], // Red team (positions 0,2)
            team2Score: handSummary.playerScores[1] + handSummary.playerScores[3], // Blue team (positions 1,3)
            team1Bags: handSummary.playerBags[0] + handSummary.playerBags[2],
            team2Bags: handSummary.playerBags[1] + handSummary.playerBags[3],
            tricksPerPlayer: handSummary.tricksPerPlayer,
            // Running totals (for overall game state)
            playerScores: game.playerScores,
            playerBags: game.playerBags,
            team1TotalScore: game.team1TotalScore,
            team2TotalScore: game.team2TotalScore,
            team1TotalBags: game.team1Bags,
            team2TotalBags: game.team2Bags,
          });
          io.to(game.id).emit('hand_completed', {
            // Current hand scores (for hand summary display)
            team1Score: handSummary.playerScores[0] + handSummary.playerScores[2], // Red team (positions 0,2)
            team2Score: handSummary.playerScores[1] + handSummary.playerScores[3], // Blue team (positions 1,3)
            team1Bags: handSummary.playerBags[0] + handSummary.playerBags[2],
            team2Bags: handSummary.playerBags[1] + handSummary.playerBags[3],
            tricksPerPlayer: handSummary.tricksPerPlayer,
            // Running totals (for overall game state)
            playerScores: game.playerScores,
            playerBags: game.playerBags,
            team1TotalScore: game.team1TotalScore,
            team2TotalScore: game.team2TotalScore,
            team1TotalBags: game.team1Bags,
            team2TotalBags: game.team2Bags,
          });
          
          // Update stats for this hand
          updateHandStats(game).catch(err => {
            console.error('Failed to update hand stats:', err);
          });
        } else {
          // Partners mode scoring
        const handSummary = calculatePartnersHandScore(game);
        
        // Validate that we have exactly 13 tricks before proceeding
        const totalTricks = handSummary.tricksPerPlayer.reduce((a, b) => a + b, 0);
        if (totalTricks !== 13) {
          console.error(`[HAND COMPLETION ERROR] Invalid trick count: ${totalTricks}. Expected 13 tricks total. Cannot complete hand.`);
          console.error('[HAND COMPLETION ERROR] Tricks per player:', handSummary.tricksPerPlayer);
          console.error('[HAND COMPLETION ERROR] Game play tricks:', game.play.tricks);
          
          // Force a game update to show current state but don't complete the hand
          io.to(game.id).emit('game_update', enrichGameForClient(game));
          return;
        }
        
        // Update running totals
        game.team1TotalScore = (game.team1TotalScore || 0) + handSummary.team1Score;
        game.team2TotalScore = (game.team2TotalScore || 0) + handSummary.team2Score;
        
        // Add new bags to running total
        game.team1Bags = (game.team1Bags || 0) + handSummary.team1Bags;
        game.team2Bags = (game.team2Bags || 0) + handSummary.team2Bags;
        
        // Apply bag penalty to running total if needed
        if (game.team1Bags >= 10) {
          game.team1TotalScore -= 100;
          game.team1Bags -= 10;
        }
        if (game.team2Bags >= 10) {
          game.team2TotalScore -= 100;
          game.team2Bags -= 10;
        }
        
                  // Set game status to indicate hand is completed
          game.status = 'HAND_COMPLETED';
          
          // NEW: Log completed hand to database
          trickLogger.logCompletedHand(game).catch((err: Error) => {
            console.error('Failed to log completed hand to database:', err);
          });
          
          console.log('[HAND COMPLETED] Partners mode - Emitting hand_completed event with data:', {
          ...handSummary,
          team1TotalScore: game.team1TotalScore,
          team2TotalScore: game.team2TotalScore,
          team1Bags: game.team1Bags,
          team2Bags: game.team2Bags,
        });
        io.to(game.id).emit('hand_completed', {
          ...handSummary,
          team1TotalScore: game.team1TotalScore,
          team2TotalScore: game.team2TotalScore,
          team1Bags: game.team1Bags,
          team2Bags: game.team2Bags,
        });
        
        // Update stats for this hand
        updateHandStats(game).catch(err => {
          console.error('Failed to update hand stats:', err);
        });
        }
        
        // Emit game update with new status
        io.to(game.id).emit('game_update', enrichGameForClient(game));
        
        // --- Game over check ---
        // Use the actual game settings - these should always be set when game is created
        const maxPoints = game.maxPoints;
        const minPoints = game.minPoints;
        
        // Validate that we have the required game settings
        if (maxPoints === undefined || minPoints === undefined) {
          console.error('[GAME OVER CHECK] Missing game settings - maxPoints:', maxPoints, 'minPoints:', minPoints);
          return;
        }
        
        if (game.gameMode === 'SOLO') {
          // Solo mode game over check
          const playerScores = game.playerScores || [0, 0, 0, 0];
          console.log('[GAME OVER CHECK] Solo mode - Player scores:', playerScores, 'Max points:', maxPoints, 'Min points:', minPoints);
          
          const isGameOver = playerScores.some(score => score >= maxPoints || score <= minPoints);
          
          if (isGameOver) {
            console.log('[GAME OVER] Solo game ended! Player scores:', playerScores);
            game.status = 'FINISHED';
            
            // Find winning player (highest score)
            let winningPlayer = 0;
            let highestScore = playerScores[0];
            for (let i = 1; i < playerScores.length; i++) {
              if (playerScores[i] > highestScore) {
                highestScore = playerScores[i];
                winningPlayer = i;
              }
            }
            game.winningPlayer = winningPlayer;
            
            io.to(game.id).emit('game_over', {
              playerScores: game.playerScores,
              winningPlayer: game.winningPlayer,
            });
            // Update stats and coins in DB
            updateStatsAndCoins(game, winningPlayer).catch(err => {
              console.error('Failed to update stats/coins:', err);
            });
          }
        } else {
          // Partners mode game over check
        console.log('[GAME OVER CHECK] Team 1 score:', game.team1TotalScore, 'Team 2 score:', game.team2TotalScore, 'Max points:', maxPoints, 'Min points:', minPoints);
        
        // Check if game should end (only when there's a clear winner)
        let shouldEndGame = false;
        let winningTeam = null;
        
        // If either team is below minPoints, they lose immediately
        if (game.team1TotalScore <= minPoints) {
          shouldEndGame = true;
          winningTeam = 2;
        } else if (game.team2TotalScore <= minPoints) {
          shouldEndGame = true;
          winningTeam = 1;
        }
        // If either team is above maxPoints, check if they have a clear lead
        else if (game.team1TotalScore >= maxPoints) {
          if (game.team1TotalScore > game.team2TotalScore) {
            shouldEndGame = true;
            winningTeam = 1;
          }
          // If tied at maxPoints, continue the game
        } else if (game.team2TotalScore >= maxPoints) {
          if (game.team2TotalScore > game.team1TotalScore) {
            shouldEndGame = true;
            winningTeam = 2;
          }
          // If tied at maxPoints, continue the game
        }
        
        if (shouldEndGame && winningTeam) {
          console.log('[GAME OVER] Game ended! Team 1:', game.team1TotalScore, 'Team 2:', game.team2TotalScore, 'Winner:', winningTeam);
          game.status = 'FINISHED';
          io.to(game.id).emit('game_over', {
            team1Score: game.team1TotalScore,
            team2Score: game.team2TotalScore,
            winningTeam,
          });
          // Update stats and coins in DB
          updateStatsAndCoins(game, winningTeam).catch(err => {
            console.error('Failed to update stats/coins:', err);
          });
        }
        }
        return;
      }
      
              // Additional check: If all hands are empty and we have 13 tricks total, force hand completion
      const totalTricksPlayed = game.players.reduce((sum, p) => sum + (p?.tricks || 0), 0);
      if (totalTricksPlayed === 13 && game.players.every(p => Array.isArray(p.hand) && p.hand.length === 0)) {
        console.log('[FORCE HAND COMPLETION] All hands empty and 13 tricks played, forcing hand completion');
        const handSummary = calculatePartnersHandScore(game);
        
        // Update running totals
        game.team1TotalScore = (game.team1TotalScore || 0) + handSummary.team1Score;
        game.team2TotalScore = (game.team2TotalScore || 0) + handSummary.team2Score;
        
        // Add new bags to running total
        game.team1Bags = (game.team1Bags || 0) + handSummary.team1Bags;
        game.team2Bags = (game.team2Bags || 0) + handSummary.team2Bags;
        
        // Apply bag penalty to running total if needed
        if (game.team1Bags >= 10) {
          game.team1TotalScore -= 100;
          game.team1Bags -= 10;
        }
        if (game.team2Bags >= 10) {
          game.team2TotalScore -= 100;
          game.team2Bags -= 10;
        }
        
                  // Set game status to indicate hand is completed
          game.status = 'HAND_COMPLETED';
          
          // NEW: Log completed hand to database
          trickLogger.logCompletedHand(game).catch((err: Error) => {
            console.error('Failed to log completed hand to database:', err);
          });
          
          console.log('[FORCE HAND COMPLETED] Emitting hand_completed event with data:', {
          ...handSummary,
          team1TotalScore: game.team1TotalScore,
          team2TotalScore: game.team2TotalScore,
          team1Bags: game.team1Bags,
          team2Bags: game.team2Bags,
        });
        io.to(game.id).emit('hand_completed', {
          ...handSummary,
          team1TotalScore: game.team1TotalScore,
          team2TotalScore: game.team2TotalScore,
          team1Bags: game.team1Bags,
          team2Bags: game.team2Bags,
        });
        
        // Emit game update with new status
        io.to(game.id).emit('game_update', enrichGameForClient(game));
        
        // --- Game over check ---
        // Use the actual game settings - these should always be set when game is created
        const maxPoints = game.maxPoints;
        const minPoints = game.minPoints;
        
        // Validate that we have the required game settings
        if (maxPoints === undefined || minPoints === undefined) {
          console.error('[GAME OVER CHECK] Missing game settings - maxPoints:', maxPoints, 'minPoints:', minPoints);
          return;
        }
        
        console.log('[GAME OVER CHECK] Team 1 score:', game.team1TotalScore, 'Team 2 score:', game.team2TotalScore, 'Max points:', maxPoints, 'Min points:', minPoints);
        
        // Check if game should end (only when there's a clear winner)
        let shouldEndGame = false;
        let winningTeam = null;
        
        // If either team is below minPoints, they lose immediately
        if (game.team1TotalScore <= minPoints) {
          shouldEndGame = true;
          winningTeam = 2;
        } else if (game.team2TotalScore <= minPoints) {
          shouldEndGame = true;
          winningTeam = 1;
        }
        // If either team is above maxPoints, check if they have a clear lead
        else if (game.team1TotalScore >= maxPoints) {
          if (game.team1TotalScore > game.team2TotalScore) {
            shouldEndGame = true;
            winningTeam = 1;
          }
          // If tied at maxPoints, continue the game
        } else if (game.team2TotalScore >= maxPoints) {
          if (game.team2TotalScore > game.team1TotalScore) {
            shouldEndGame = true;
            winningTeam = 2;
          }
          // If tied at maxPoints, continue the game
        }
        
        if (shouldEndGame && winningTeam) {
          console.log('[GAME OVER] Game ended! Team 1:', game.team1TotalScore, 'Team 2:', game.team2TotalScore, 'Winner:', winningTeam);
          game.status = 'FINISHED';
          io.to(game.id).emit('game_over', {
            team1Score: game.team1TotalScore,
            team2Score: game.team2TotalScore,
            winningTeam,
          });
          // Update stats and coins in DB
          updateStatsAndCoins(game, winningTeam).catch(err => {
            console.error('Failed to update stats/coins:', err);
          });
        }
        return;
      }
      // If the winner is a bot, trigger their move for the next trick
      const winnerPlayer = game.players[winnerIndex];
      if (winnerPlayer && winnerPlayer.type === 'bot') {
        console.log('[BOT TURN] Winner is bot, triggering next turn for:', winnerPlayer.username, 'at index:', winnerIndex);
        // Add a small delay to allow the trick completion animation
        setTimeout(() => {
          // Double-check that it's still this bot's turn before playing
          if (game.play && game.play.currentPlayerIndex === winnerIndex && 
              game.players[winnerIndex] && game.players[winnerIndex]!.type === 'bot') {
            botPlayCard(game, winnerIndex);
          }
        }, 1200); // 1.2 second delay to allow trick completion animation
      }
      
      // Failsafe: If all hands are empty but we haven't reached 13 tricks, force completion
      if (game.players.every(p => Array.isArray(p.hand) && p.hand.length === 0) && game.play.trickNumber < 13) {
        console.log('[FAILSAFE] All hands empty but only', game.play.trickNumber, 'tricks completed. Forcing hand completion.');
        
        // If current trick is complete, score it first
        if (game.play.currentTrick.length === 4) {
          const finalWinnerIndex = determineTrickWinner(game.play.currentTrick);
          game.play.tricks.push({
            cards: game.play.currentTrick,
            winnerIndex: finalWinnerIndex,
          });
          game.play.trickNumber += 1;
          if (game.players[finalWinnerIndex]) {
            game.players[finalWinnerIndex]!.tricks = (game.players[finalWinnerIndex]!.tricks || 0) + 1;
          }
          console.log('[FAILSAFE] Final trick completed, new trickNumber:', game.play.trickNumber);
        }
        
        // Force hand completion regardless of trick number
        console.log('[FAILSAFE] Forcing hand completion due to empty hands');
        game.status = 'HAND_COMPLETED';
        
        // NEW: Log completed hand to database
        trickLogger.logCompletedHand(game).catch((err: Error) => {
          console.error('Failed to log completed hand to database:', err);
        });
        
        // Calculate final scores
        const finalScores = calculatePartnersHandScore(game);
        console.log('[FAILSAFE] Final scores calculated:', finalScores);
        
        // Emit hand completed event
        io.to(game.id).emit('hand_completed', finalScores);
        console.log('[FAILSAFE] Hand completed event emitted');
        
        return; // Exit early to prevent further processing
      }
      
      return;
    } else {
      // Trick is not complete, advance to next player
      let nextPlayerIndex = (seatIndex + 1) % 4;
      game.play.currentPlayerIndex = nextPlayerIndex;
      game.play.currentPlayer = game.players[nextPlayerIndex]?.id ?? '';
      
      // Emit play_update to notify frontend about the card being played
      io.to(game.id).emit('play_update', {
        currentPlayerIndex: nextPlayerIndex,
        currentTrick: game.play.currentTrick,
        hands: game.hands.map((h, i) => ({
          playerId: game.players[i]?.id,
          handCount: h.length,
        })),
      });
      
      // Emit game update to ensure frontend has latest state
      io.to(game.id).emit('game_update', enrichGameForClient(game));
      
      // If the next player is a bot, trigger their move with a delay
      const nextPlayer = game.players[nextPlayerIndex];
      if (nextPlayer && nextPlayer.type === 'bot') {
        console.log('[BOT TURN DEBUG] Triggering bot', nextPlayer.username, 'at position', nextPlayerIndex, 'to play after delay');
        setTimeout(() => {
          botPlayCard(game, nextPlayerIndex);
        }, 800); // Reduced delay for faster bot play
      } else {
        console.log('[BOT TURN DEBUG] Next player is human', nextPlayer?.username, 'at position', nextPlayerIndex, '- waiting for human input');
        // Start timeout for human players in playing phase using the main timeout system
        console.log('[TIMEOUT DEBUG] Starting timeout for human player in playing phase:', nextPlayer?.username);
        // Import the timeout function from index.ts
        const { startTurnTimeout } = require('../index');
        startTurnTimeout(game, nextPlayerIndex, 'playing');
      }
    }
  }, 300);
}

// Socket handlers are now properly registered in index.ts to ensure consistent trick counting

// --- Helper: Determine Trick Winner ---
export function determineTrickWinner(trick: Card[]): number {
  if (!trick.length) {
    throw new Error('Cannot determine winner of empty trick');
  }
  let winningCard = trick[0];
  for (const card of trick) {
    if (
      (card.suit === 'S' && winningCard.suit !== 'S') ||
      (card.suit === winningCard.suit && getCardValue(card.rank) > getCardValue(winningCard.rank))
    ) {
      winningCard = card;
    }
  }
  return winningCard.playerIndex ?? 0; // Provide default value if undefined
}

function getCardValue(rank: string | Rank): number {
  const rankMap: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return rankMap[rank] || 0;
}

// --- Scoring helper ---
function calculatePartnersHandScore(game: Game) {
  if (!game.bidding || !game.play) {
    throw new Error('Invalid game state for scoring');
  }
  const team1 = [0, 2];
  const team2 = [1, 3];
  let team1Bid = 0, team2Bid = 0, team1Tricks = 0, team2Tricks = 0;
  let team1Bags = 0, team2Bags = 0;
  let team1Score = 0, team2Score = 0;
  
  // Use the already updated player trick counts instead of recalculating
  const tricksPerPlayer = game.players.map(p => p?.tricks || 0);
  
  console.log('[SCORING DEBUG] Tricks per player:', tricksPerPlayer);
  console.log('[SCORING DEBUG] Total tricks:', tricksPerPlayer.reduce((a, b) => a + b, 0));
  
  // Calculate team tricks
  for (const i of team1) {
    team1Tricks += tricksPerPlayer[i];
  }
  for (const i of team2) {
    team2Tricks += tricksPerPlayer[i];
  }
  
  // Calculate team bids (excluding nil bids)
  for (const i of team1) {
    const bid = game.bidding.bids[i] ?? 0;
    if (bid !== 0 && bid !== -1) { // Nil bids don't count toward team bid
      team1Bid += bid;
    }
  }
  for (const i of team2) {
    const bid = game.bidding.bids[i] ?? 0;
    if (bid !== 0 && bid !== -1) { // Nil bids don't count toward team bid
      team2Bid += bid;
    }
  }
  
  console.log('[SCORING DEBUG] Team 1 bid:', team1Bid, 'tricks:', team1Tricks);
  console.log('[SCORING DEBUG] Team 2 bid:', team2Bid, 'tricks:', team2Tricks);
  
  // Team 1 scoring
  if (team1Tricks >= team1Bid) {
    team1Score += team1Bid * 10;
    team1Bags = team1Tricks - team1Bid;
    team1Score += team1Bags;
  } else {
    team1Score -= team1Bid * 10;
    team1Bags = 0; // No bags for failed bids
  }
  // Team 2 scoring
  if (team2Tricks >= team2Bid) {
    team2Score += team2Bid * 10;
    team2Bags = team2Tricks - team2Bid;
    team2Score += team2Bags;
  } else {
    team2Score -= team2Bid * 10;
    team1Bags = 0; // No bags for failed bids
  }
  
  // Nil and Blind Nil
  for (const i of [...team1, ...team2]) {
    const bid = game.bidding.bids[i];
    const tricks = tricksPerPlayer[i];
    if (bid === 0) { // Nil
      if (tricks === 0) {
        if (team1.includes(i)) team1Score += 100;
        else team2Score += 100;
      } else {
        if (team1.includes(i)) team1Score -= 100;
        else team2Score -= 100;
        // Bags for failed nil go to team
        if (team1.includes(i)) team1Bags += tricks;
        else team2Bags += tricks;
      }
    } else if (bid === -1) { // Blind Nil (use -1 for blind nil)
      if (tricks === 0) {
        if (team1.includes(i)) team1Score += 200;
        else team2Score += 200;
      } else {
        if (team1.includes(i)) team1Score -= 200;
        else team2Score -= 200;
        // Bags for failed blind nil go to team
        if (team1.includes(i)) team1Bags += tricks;
        else team2Bags += tricks;
      }
    }
  }
  
  // Bag penalty
  if (team1Bags >= 10) {
    team1Score -= 100;
    team1Bags -= 10;
  }
  if (team2Bags >= 10) {
    team2Score -= 100;
    team2Bags -= 10;
  }
  
  // Validate total tricks equals 13
  const totalTricks = tricksPerPlayer.reduce((a, b) => a + b, 0);
  if (totalTricks !== 13) {
    console.error(`[SCORING ERROR] Invalid trick count: ${totalTricks}. Expected 13 tricks total.`);
    console.error('[SCORING ERROR] Tricks per player:', tricksPerPlayer);
    console.error('[SCORING ERROR] Game play tricks:', game.play.tricks);
  }
  
  console.log('[SCORING DEBUG] Final scores - Team 1:', team1Score, 'Team 2:', team2Score);
  
  return {
    team1Score,
    team2Score,
    team1Bags,
    team2Bags,
    tricksPerPlayer,
  };
}

// Helper to calculate solo hand score
export function calculateSoloHandScore(game: Game) {
  if (!game.bidding || !game.play) {
    throw new Error('Invalid game state for scoring');
  }
  
  // Use the already updated player trick counts instead of recalculating
  const tricksPerPlayer = game.players.map(p => p?.tricks || 0);
  
  console.log('[SOLO SCORING DEBUG] Tricks per player:', tricksPerPlayer);
  console.log('[SOLO SCORING DEBUG] Total tricks:', tricksPerPlayer.reduce((a, b) => a + b, 0));
  
  const playerScores = [0, 0, 0, 0];
  const playerBags = [0, 0, 0, 0];
  
  // Calculate individual player scores
  for (let i = 0; i < 4; i++) {
    const bid = game.bidding.bids[i] ?? 0;
    const tricks = tricksPerPlayer[i];
    
    console.log(`[SOLO SCORING DEBUG] Player ${i}: bid=${bid}, tricks=${tricks}`);
    
    if (tricks >= bid) {
      playerScores[i] += bid * 10;
      playerBags[i] = tricks - bid;
      playerScores[i] += playerBags[i];
    } else {
      playerScores[i] -= bid * 10;
      playerBags[i] = 0;
    }
    
    // Nil and Blind Nil
    if (bid === 0) { // Nil
      if (tricks === 0) {
        playerScores[i] += 100;
      } else {
        playerScores[i] -= 100;
        playerBags[i] += tricks;
      }
    } else if (bid === -1) { // Blind Nil
      if (tricks === 0) {
        playerScores[i] += 200;
      } else {
        playerScores[i] -= 200;
        playerBags[i] += tricks;
      }
    }
    
    // Bag penalty
    if (playerBags[i] >= 10) {
      playerScores[i] -= 100;
      playerBags[i] -= 10;
    }
  }
  
  // Validate total tricks equals 13
  const totalTricks = tricksPerPlayer.reduce((a, b) => a + b, 0);
  if (totalTricks !== 13) {
    console.error(`[SOLO SCORING ERROR] Invalid trick count: ${totalTricks}. Expected 13 tricks total.`);
    console.error('[SOLO SCORING ERROR] Tricks per player:', tricksPerPlayer);
  }
  
  console.log('[SOLO SCORING DEBUG] Final player scores:', playerScores);
  console.log('[SOLO SCORING DEBUG] Final player bags:', playerBags);
  
  return {
    playerScores,
    playerBags,
    tricksPerPlayer
  };
}

// --- Stats tracking per hand ---
async function updateHandStats(game: Game) {
  // Check if this is an all-human game (no bots)
  const humanPlayers = game.players.filter(p => p && p.type === 'human');
  const isAllHumanGame = humanPlayers.length === 4;
  
  if (!isAllHumanGame) {
    console.log('Skipping hand stats update - not an all-human game');
    return;
  }
  
  console.log('Updating hand stats for all-human game');
  
  for (let i = 0; i < 4; i++) {
    const player = game.players[i];
    if (!player || player.type !== 'human') continue;
    const userId = player.id;
    if (!userId) continue; // Skip if no user ID
    
    // Calculate bags for this player for this hand
    const playerBid = player.bid || 0;
    const playerTricks = player.tricks || 0;
    
    // For nil and blind nil, all tricks count as bags if failed
    let bags = 0;
    if (playerBid === 0 || playerBid === -1) {
      // Nil or blind nil: all tricks count as bags if failed
      bags = playerTricks;
    } else {
      // Regular bid: only excess tricks count as bags
      bags = Math.max(0, playerTricks - playerBid);
    }
    
    try {
      // Handle nil tracking for this hand
      let nilBidIncrement = 0;
      let nilMadeIncrement = 0;
      let blindNilBidIncrement = 0;
      let blindNilMadeIncrement = 0;
      
      if (playerBid === 0) {
        // Regular nil bid
        nilBidIncrement = 1;
        if (playerTricks === 0) {
          // Successfully made nil
          nilMadeIncrement = 1;
        }
      } else if (playerBid === -1) {
        // Blind nil bid
        blindNilBidIncrement = 1;
        if (playerTricks === 0) {
          // Successfully made blind nil
          blindNilMadeIncrement = 1;
        }
      }
      
      // Get current stats to calculate bags per game
      const currentStats = await prisma.userStats.findUnique({
        where: { userId }
      });
      
      const currentGamesPlayed = currentStats?.gamesPlayed || 0;
      const currentTotalBags = currentStats?.totalBags || 0;
      const newTotalBags = currentTotalBags + bags;
      const newBagsPerGame = currentGamesPlayed > 0 ? newTotalBags / currentGamesPlayed : bags;
      
      // Update stats for this hand
      await prisma.userStats.update({
        where: { userId },
        data: {
          totalBags: newTotalBags,
          bagsPerGame: newBagsPerGame,
          nilsBid: { increment: nilBidIncrement },
          nilsMade: { increment: nilMadeIncrement },
          blindNilsBid: { increment: blindNilBidIncrement },
          blindNilsMade: { increment: blindNilMadeIncrement }
        }
      });
      
      console.log(`Updated hand stats for user ${userId}: nilsBid+${nilBidIncrement}, nilsMade+${nilMadeIncrement}, blindNilsBid+${blindNilBidIncrement}, blindNilsMade+${blindNilMadeIncrement}, bags+${bags}`);
    } catch (err: any) {
      console.error('Failed to update hand stats for user', userId, err);
    }
  }
}

// --- Game logging helper ---
async function logCompletedGame(game: Game, winningTeamOrPlayer: number) {
  // Check if this is an all-human game (no bots)
  const humanPlayers = game.players.filter(p => p && p.type === 'human');
  const isAllHumanGame = humanPlayers.length === 4;
  
  if (!isAllHumanGame) {
    console.log('Skipping game logging - not an all-human game');
    return;
  }
  
  console.log('Logging completed game to database');
  
  try {
    // Determine game settings based on game rules
    const gameMode = game.gameMode;
    const bidType = game.rules?.bidType || 'REG';
    const specialRules = game.specialRules || {};
    
    // Determine boolean flags
    const solo = gameMode === 'SOLO';
    const whiz = bidType === 'WHIZ';
    const mirror = bidType === 'MIRROR';
    const gimmick = bidType === 'SUICIDE' || bidType === '4 OR NIL' || bidType === 'BID 3' || bidType === 'BID HEARTS' || bidType === 'CRAZY ACES';
    const screamer = specialRules.screamer === true;
    const assassin = specialRules.assassin === true;
    
    // Get creator ID from the first human player
    const creatorPlayer = humanPlayers[0];
    const creatorId = creatorPlayer?.id;
    
    if (!creatorId) {
      console.error('No creator ID found for game logging');
      return;
    }
    
    // Calculate final scores and determine winner
    let finalScore = 0;
    let winner = 0;
    let team1Score = null;
    let team2Score = null;
    
    if (gameMode === 'SOLO') {
      // Solo mode: find highest scoring player
      const playerScores = game.playerScores || [0, 0, 0, 0];
      winner = winningTeamOrPlayer; // This is already the player index
      finalScore = playerScores[winner];
    } else {
      // Partners mode: determine team scores
      winner = winningTeamOrPlayer; // This is already the team number (1 or 2)
      if (winner === 1) {
        team1Score = game.team1TotalScore || 0;
        team2Score = game.team2TotalScore || 0;
        finalScore = team1Score;
      } else {
        team1Score = game.team1TotalScore || 0;
        team2Score = game.team2TotalScore || 0;
        finalScore = team2Score;
      }
    }
    
    // Create game record in database with new fields
    const dbGame = await prisma.game.create({
      data: {
        creatorId: game.players[0]?.id || 'unknown', // Use first player as creator
        status: 'FINISHED',
        gameMode: game.gameMode,
                  bidType: bidType === 'WHIZ' ? 'WHIZ' : bidType === 'MIRROR' ? 'MIRRORS' : 'GIMMICK',
        specialRules: Object.keys(game.specialRules || {}).filter(key => game.specialRules?.[key as keyof typeof game.specialRules]).map(key => {
          if (key === 'screamer') return 'SCREAMER';
          if (key === 'assassin') return 'ASSASSIN';
          return 'SCREAMER'; // Default fallback
        }) as any[],
        minPoints: game.minPoints,
        maxPoints: game.maxPoints,
        buyIn: game.buyIn,
        solo: game.gameMode === 'SOLO',
        whiz: bidType === 'WHIZ',
        mirror: bidType === 'MIRROR',
        gimmick: bidType === 'SUICIDE' || bidType === '4 OR NIL' || bidType === 'BID 3' || bidType === 'BID HEARTS' || bidType === 'CRAZY ACES',
        screamer: specialRules.screamer || false,
        assassin: specialRules.assassin || false,
        // NEW: Game completion tracking
        rated: true, // This is an all-human game
        completed: true,
        cancelled: false,
        finalScore,
        winner,
        gameType: bidType === 'WHIZ' ? 'WHIZ' : bidType === 'MIRROR' ? 'MIRROR' : bidType === 'SUICIDE' || bidType === '4 OR NIL' || bidType === 'BID 3' || bidType === 'BID HEARTS' || bidType === 'CRAZY ACES' ? 'GIMMICK' : 'REGULAR',
        league: (game as any).league || false, // Add league flag
        specialRulesApplied: Object.keys(specialRules).filter(key => specialRules[key as keyof typeof specialRules] === true).map(key => {
          if (key === 'screamer') return 'SCREAMER';
          if (key === 'assassin') return 'ASSASSIN';
          return 'SCREAMER'; // Default fallback
        }) as any[]
      }
    });
    
    console.log(`Logged game ${dbGame.id} with settings: solo=${solo}, whiz=${whiz}, mirror=${mirror}, gimmick=${gimmick}, screamer=${screamer}, assassin=${assassin}, rated=true, winner=${winner}, finalScore=${finalScore}`);
    
    // Create game player records with final results
    for (let i = 0; i < 4; i++) {
      const player = game.players[i];
      if (!player || player.type !== 'human') continue;
      
      const userId = player.id;
      if (!userId) continue;
      
      // Determine team for partners games
      let team = null;
      if (gameMode === 'PARTNERS') {
        team = (i === 0 || i === 2) ? 1 : 2;
      }
      
      // Calculate final stats for this player
      const finalBid = player.bid || 0;
      const finalTricks = player.tricks || 0;
      const finalBags = Math.max(0, finalTricks - finalBid); // Calculate bags from tricks and bid
      const finalPoints = gameMode === 'SOLO' ? (game.playerScores?.[i] || 0) : 0;
      
      // Determine if this player won
      let won = false;
      if (gameMode === 'SOLO') {
        won = i === winner;
      } else {
        won = team === winner;
      }
      
      await prisma.gamePlayer.create({
        data: {
          gameId: dbGame.id,
          userId,
          position: i,
          team,
          bid: finalBid,
          bags: finalBags,
          points: finalPoints,
          // NEW: Final game results
          finalScore: finalPoints,
          finalBags: finalBags,
          finalPoints: finalPoints,
          won
        }
      });
    }
    
    // Create GameResult record for comprehensive tracking
    const playerResults = {
      players: game.players.map((p, i) => ({
        position: i,
        userId: p?.id,
        username: p?.username,
        team: gameMode === 'PARTNERS' ? ((i === 0 || i === 2) ? 1 : 2) : null,
        finalBid: p?.bid || 0,
        finalTricks: p?.tricks || 0,
        finalBags: p ? Math.max(0, (p.tricks || 0) - (p.bid || 0)) : 0,
        finalScore: gameMode === 'SOLO' ? (game.playerScores?.[i] || 0) : 0,
        won: gameMode === 'SOLO' ? (i === winner) : ((i === 0 || i === 2) ? winner === 1 : winner === 2)
      }))
    };
    
    // Count total rounds and tricks
    const totalRounds = game.rounds?.length || 0;
    const totalTricks = game.play?.tricks?.length || 0;
    
    // Track special events (nils, blind nils, etc.)
    const specialEvents = {
      nils: game.bidding?.nilBids || {},
      totalHands: game.hands?.length || 0
    };
    
    await prisma.gameResult.create({
      data: {
        gameId: dbGame.id,
        winner,
        finalScore,
        gameDuration: Math.floor((Date.now() - (game.createdAt || Date.now())) / 1000), // Duration in seconds
        team1Score,
        team2Score,
        playerResults,
        totalRounds,
        totalTricks,
        specialEvents
      }
    });
    
    console.log(`Created comprehensive game result record for game ${dbGame.id}`);
    
    // Send Discord results for league games
    if ((game as any).league) {
      try {
        const { sendLeagueGameResults } = await import('../discord-bot/bot');
        
        // Create game line string
        const formatCoins = (amount: number) => amount >= 1000000 ? `${amount / 1000000}M` : `${amount / 1000}k`;
        const gameLine = `${formatCoins(game.buyIn)} ${game.gameMode.toUpperCase()} ${game.maxPoints}/${game.minPoints} ${game.rules.gameType.toUpperCase()}`;
        
        // Prepare game data for Discord
        const gameData = {
          buyIn: game.buyIn,
          players: game.players.map((p, i) => ({
            userId: p?.id || '',
            won: game.gameMode === 'SOLO' 
              ? i === winningTeamOrPlayer 
              : (winningTeamOrPlayer === 1 && (i === 0 || i === 2)) || (winningTeamOrPlayer === 2 && (i === 1 || i === 3))
          }))
        };
        
        await sendLeagueGameResults(gameData, gameLine);
      } catch (error) {
        console.error('Failed to send Discord results:', error);
      }
    }
    
  } catch (err) {
    console.error('Failed to log completed game:', err);
  }
}

// --- Stats and coins update helper ---
async function updateStatsAndCoins(game: Game, winningTeamOrPlayer: number) {
	// Determine player composition
	const humanPlayers = game.players.filter(p => p && p.type === 'human');
	const isAllHumanGame = humanPlayers.length === 4;
	const isLeagueGame = (game as any).league === true;
	
	// Always log completed league games (for results embed), even if bots replaced seats
	// For non-league games, only log when all-human (legacy behavior)
	if (isLeagueGame || isAllHumanGame) {
		await logCompletedGame(game, winningTeamOrPlayer);
	}
	
	// Only proceed with stats/coins updates for rated (all-human) games
	if (!isAllHumanGame) {
		console.log('Skipping stats/coins update - not a rated game (has bots)');
		return;
	}
	
	console.log('Updating stats and coins for rated game');
	
	for (let i = 0; i < 4; i++) {
		const player = game.players[i];
		if (!player || player.type !== 'human') continue;
		const userId = player.id;
		if (!userId) continue; // Skip if no user ID
		
		let isWinner = false;
		if (game.gameMode === 'SOLO') {
			isWinner = i === winningTeamOrPlayer;
		} else {
			isWinner = (winningTeamOrPlayer === 1 && (i === 0 || i === 2)) || (winningTeamOrPlayer === 2 && (i === 1 || i === 3));
		}
		
		// Calculate bags for this player
		const playerBid = player.bid || 0;
		const playerTricks = player.tricks || 0;
		
		// For nil and blind nil, all tricks count as bags if failed
		let bags = 0;
		if (playerBid === 0 || playerBid === -1) {
			// Nil or blind nil: all tricks count as bags if failed
			bags = playerTricks;
		} else {
			// Regular bid: only excess tricks count as bags
			bags = Math.max(0, playerTricks - playerBid);
		}
		
		try {
			// Handle coin buy-in and prizes (only for rated games)
			const buyIn = game.buyIn || 0;
			if (buyIn > 0) {
				// Deduct buy-in from all players
				await prisma.user.update({
					where: { id: userId },
					data: { coins: { decrement: buyIn } }
				});
				
				// Award prizes to winners
				if (isWinner) {
					let prizeAmount = 0;
					const totalPot = buyIn * 4;
					const rake = Math.floor(totalPot * 0.1); // 10% rake
					const prizePool = totalPot - rake;
					
					if (game.gameMode === 'SOLO') {
						// Solo mode: 2nd place gets buy-in back, 1st place gets remainder
						const secondPlacePrize = buyIn;
						prizeAmount = prizePool - secondPlacePrize; // 1st place gets remainder
					} else {
						// Partners mode: winning team splits 90% of pot (2 winners)
						prizeAmount = Math.floor(prizePool / 2); // Each winner gets half of 90%
					}
					
					await prisma.user.update({
						where: { id: userId },
						data: { coins: { increment: prizeAmount } }
					});
					
					console.log(`Awarded ${prizeAmount} coins to winner ${userId} (total pot: ${totalPot}, rake: ${rake}, prize pool: ${prizePool})`);
				}
			}
			
			// Update stats with separate tracking for partners vs solo games
			const isSoloGame = game.gameMode === 'SOLO';
			
			if (isSoloGame) {
				// Solo game stats
				await prisma.userStats.update({
					where: { userId },
					data: {
						gamesPlayed: { increment: 1 },
						gamesWon: { increment: isWinner ? 1 : 0 },
						soloGamesPlayed: { increment: 1 },
						soloGamesWon: { increment: isWinner ? 1 : 0 },
						soloTotalBags: { increment: bags },
						soloBagsPerGame: { set: 0 }, // Will be calculated below
						totalCoinsWon: { increment: isWinner ? (game.buyIn || 0) * 2.6 : 0 }, // 1st place gets 2.6x buy-in
						totalCoinsLost: { increment: game.buyIn || 0 }, // All players lose buy-in
						netCoins: { increment: isWinner ? (game.buyIn || 0) * 1.6 : -(game.buyIn || 0) } // 1st: +1.6x, others: -1x
					}
				});
				
				// Calculate solo bags per game
				const currentStats = await prisma.userStats.findUnique({ where: { userId } });
				if (currentStats?.soloGamesPlayed && currentStats.soloTotalBags) {
					const newBagsPerGame = currentStats.soloTotalBags / currentStats.soloGamesPlayed;
					await prisma.userStats.update({
						where: { userId },
						data: { soloBagsPerGame: newBagsPerGame }
					});
				}
			} else {
				// Partners game stats
				await prisma.userStats.update({
					where: { userId },
					data: {
						gamesPlayed: { increment: 1 },
						gamesWon: { increment: isWinner ? 1 : 0 },
						partnersGamesPlayed: { increment: 1 },
						partnersGamesWon: { increment: isWinner ? 1 : 0 },
						partnersTotalBags: { increment: bags },
						partnersBagsPerGame: { set: 0 }, // Will be calculated below
						totalCoinsWon: { increment: isWinner ? Math.floor((game.buyIn || 0) * 1.8) : 0 }, // Winners split 90% of pot
						totalCoinsLost: { increment: game.buyIn || 0 }, // All players lose buy-in
						netCoins: { increment: isWinner ? Math.floor((game.buyIn || 0) * 0.8) : -(game.buyIn || 0) } // Winners: +0.8x, losers: -1x
					}
				});
				
				// Calculate partners bags per game
				const currentStats = await prisma.userStats.findUnique({ where: { userId } });
				if (currentStats?.partnersGamesPlayed && currentStats.partnersTotalBags) {
					const newBagsPerGame = currentStats.partnersTotalBags / currentStats.partnersGamesPlayed;
					await prisma.userStats.update({
						where: { userId },
						data: { partnersBagsPerGame: newBagsPerGame }
					});
				}
			}
			
			// Update overall bags per game
			const currentStats = await prisma.userStats.findUnique({ where: { userId } });
			if (currentStats?.gamesPlayed && currentStats.totalBags) {
				const newBagsPerGame = currentStats.totalBags / currentStats.gamesPlayed;
				await prisma.userStats.update({
					where: { userId },
					data: { bagsPerGame: newBagsPerGame }
				});
			}
			
			console.log(`Updated stats for user ${userId}: gamesPlayed+1, gamesWon+${isWinner ? 1 : 0}, bags+${bags}, gameType=${isSoloGame ? 'SOLO' : 'PARTNERS'}`);
		} catch (err) {
			console.error('Failed to update stats/coins for user', userId, err);
		}
	}
}

// Helper to enrich game object for client
export function enrichGameForClient(game: Game, userId?: string): Game {
  if (!game) return game;
  const hands = game.hands || [];
  const dealerIndex = game.dealerIndex;

  // Patch: Always set top-level currentPlayer for frontend
  let currentPlayer: string | undefined = undefined;
  if (game.status === 'BIDDING' && game.bidding) {
    currentPlayer = game.bidding.currentPlayer ?? '';
  } else if (game.status === 'PLAYING' && game.play) {
    currentPlayer = game.play.currentPlayer ?? '';
  }

  return {
    ...game,
    currentPlayer, // Always present for frontend
    playerScores: game.playerScores, // Added for Solo mode
    playerBags: game.playerBags,     // Added for Solo mode
    winningPlayer: game.winningPlayer, // Added for Solo mode
    forcedBid: game.forcedBid, // Added for Suicide games
    players: (game.players || []).map((p: GamePlayer | null, i: number) => {
      if (!p) return null;
      return {
        ...p,
        position: i, // <--- Always include position for seat order
        hand: userId && p.id === userId ? hands[i] || [] : undefined,
        isDealer: dealerIndex !== undefined ? i === dealerIndex : !!p.isDealer,
        tricks: p.tricks || 0, // <--- Use the already calculated trick count!
      };
    })
  };
}

// Function to handle human player timeouts in playing phase
export function handleHumanTimeout(game: Game, seatIndex: number) {
  const player = game.players[seatIndex];
  if (!player || !game.hands || !game.play) return;
  
  // Guard: Make sure it's actually this player's turn
  if (game.play.currentPlayerIndex !== seatIndex) {
    console.log('[HUMAN TIMEOUT GUARD] Player', player.username, 'at seat', seatIndex, 'tried to play but current player is', game.play.currentPlayerIndex);
    return;
  }
  
  const hand = game.hands[seatIndex]!;
  if (!hand || hand.length === 0) return;
  
  // Determine lead suit for this trick
  const leadSuit = game.play.currentTrick.length > 0 ? game.play.currentTrick[0].suit : null;
  
  // Find playable cards with special rules consideration
  let playableCards: Card[] = [];
  const specialRules = game.specialRules;
  
  console.log(`[HUMAN TIMEOUT DEBUG] Player ${player.username} at seat ${seatIndex} - specialRules:`, specialRules);
  console.log(`[HUMAN TIMEOUT DEBUG] Player ${player.username} hand:`, hand.map(c => `${c.rank}${c.suit}`));
  console.log(`[HUMAN TIMEOUT DEBUG] Player ${player.username} leadSuit:`, leadSuit);
  
  if (leadSuit) {
    // Following suit - must follow lead suit if possible
    playableCards = hand.filter(c => c.suit === leadSuit);
    if (playableCards.length === 0) {
      // Void in lead suit - can play any card, but apply special rules
      if (specialRules?.screamer) {
        // Screamer: cannot cut with spades unless only spades left
        const nonSpades = hand.filter(c => c.suit !== 'S');
        if (nonSpades.length > 0) {
          playableCards = nonSpades; // Must play non-spades if available
        } else {
          playableCards = hand; // Only spades left, can play spades
        }
      } else {
        playableCards = hand; // No special rules, can play anything
      }
    }
  } else {
    // Player is leading
    if (specialRules?.screamer) {
      // Screamer: cannot lead spades unless only spades left
      const nonSpades = hand.filter(c => c.suit !== 'S');
      if (nonSpades.length > 0) {
        playableCards = nonSpades; // Must lead non-spades if available
      } else {
        playableCards = hand; // Only spades left, can lead spades
      }
    } else {
      // Normal rules: cannot lead spades unless spades broken or only spades left
      if (game.play.spadesBroken || hand.every(c => c.suit === 'S')) {
        playableCards = hand; // Can lead any card
      } else {
        // Cannot lead spades unless only spades left
        playableCards = hand.filter(c => c.suit !== 'S');
        if (playableCards.length === 0) {
          playableCards = hand; // Only spades left, must lead spades
        }
      }
    }
  }
  
  console.log(`[HUMAN TIMEOUT DEBUG] Player ${player.username} final playableCards:`, playableCards.map(c => `${c.rank}${c.suit}`));
  
  // Apply additional special rules filtering (like Assassin)
  playableCards = applySpecialRules(playableCards, hand, game.play.currentTrick, game, seatIndex);
  
  // Smart card selection based on game type and bidding
  let card: Card;
  
  // Get player's bid and partner's bid to determine strategy
  const playerBid = game.bidding?.bids[seatIndex];
  const partnerIndex = (seatIndex + 2) % 4; // Partner is 2 seats away
  const partnerBid = game.bidding?.bids[partnerIndex];
  
  // Check if this is a Suicide game
  if (game.forcedBid === 'SUICIDE') {
    if (playerBid === 0) {
      // Player is nil - try to avoid winning tricks
      card = selectCardForNil(playableCards, game.play.currentTrick, hand);
    } else if (partnerBid === 0) {
      // Partner is nil - try to cover partner
      card = selectCardToCoverPartner(playableCards, game.play.currentTrick, hand, game.hands[partnerIndex] || [], game, seatIndex);
    } else {
      // Normal bidding - play to win
      card = selectCardToWin(playableCards, game.play.currentTrick, hand, game, seatIndex);
    }
  } else {
    // All other game types - check for nil players
    if (playerBid === 0) {
      // Player is nil - try to avoid winning tricks
      card = selectCardForNil(playableCards, game.play.currentTrick, hand);
    } else if (partnerBid === 0) {
      // Partner is nil - try to cover partner
      card = selectCardToCoverPartner(playableCards, game.play.currentTrick, hand, game.hands[partnerIndex] || [], game, seatIndex);
    } else {
      // Normal bidding - play to win
      card = selectCardToWin(playableCards, game.play.currentTrick, hand, game, seatIndex);
    }
  }
  
  if (!card) return;
  
  console.log(`[HUMAN TIMEOUT DEBUG] Player ${player.username} selected card:`, `${card.rank}${card.suit}`);
  
  // Simulate playing the card
  setTimeout(() => {
    if (!game.play) return; // Guard for undefined
    console.log(`[HUMAN TIMEOUT] Player ${player.username} is playing card:`, card);
    
    // This logic is similar to the play_card socket handler
    const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    if (cardIndex === -1) return;
    hand.splice(cardIndex, 1);
    game.play.currentTrick.push({ ...card, playerIndex: seatIndex });
    
    // Set spadesBroken if a spade is played
    if (card.suit === 'S') {
      game.play.spadesBroken = true;
    }
    
    // If trick is complete (4 cards)
    if (game.play.currentTrick.length === 4) {
      console.log('[HUMAN TIMEOUT TRICK DEBUG] Determining winner for timeout trick:', game.play.currentTrick);
      const winnerIndex = determineTrickWinner(game.play.currentTrick);
      console.log('[HUMAN TIMEOUT TRICK DEBUG] Winner determined:', winnerIndex, 'Winner player:', game.players[winnerIndex]?.username);
      if (winnerIndex === undefined) return;
      
      game.play.tricks.push({
        cards: game.play.currentTrick,
        winnerIndex,
      });
      game.play.trickNumber += 1;
      console.log('[HUMAN TIMEOUT TRICK DEBUG] Trick completed, new trickNumber:', game.play.trickNumber);
      
      // NEW: Log the completed trick to database
      trickLogger.logTrickFromGame(game, game.play.trickNumber).catch((err: Error) => {
        console.error('Failed to log trick to database:', err);
      });
      game.play.currentPlayerIndex = winnerIndex;
      game.play.currentPlayer = game.players[winnerIndex]?.id ?? '';
      console.log('[HUMAN TIMEOUT TRICK DEBUG] Set current player to winner:', winnerIndex, game.players[winnerIndex]?.username);
      
      // Update player trick counts
      if (game.players[winnerIndex]) {
        game.players[winnerIndex]!.tricks = (game.players[winnerIndex]!.tricks || 0) + 1;
        console.log('[HUMAN TIMEOUT TRICK COUNT DEBUG] Updated trick count for player', winnerIndex, game.players[winnerIndex]?.username, 'to', game.players[winnerIndex]!.tricks);
      }
      
      // Log all player trick counts
      const trickCounts = game.players.map((p, i) => `${i}: ${p?.username} = ${p?.tricks || 0}`);
      console.log('[HUMAN TIMEOUT TRICK COUNT DEBUG] All player trick counts:', trickCounts);
      
      // Check if hand is complete
      if (game.play.trickNumber === 13) {
        console.log('[HUMAN TIMEOUT HAND COMPLETION] Hand complete, calculating scores');
        // Calculate scores and determine winner
        try {
          if (game.rules?.gameType === 'SOLO') {
            calculateSoloHandScore(game);
          } else {
            calculatePartnersHandScore(game);
          }
        } catch (error) {
          console.error('[HUMAN TIMEOUT HAND COMPLETION ERROR] Error calculating scores:', error);
        }
        return;
      }
      
      // Emit game update
      io.to(game.id).emit('game_update', enrichGameForClient(game));
      io.to(game.id).emit('play_update', {
        currentPlayerIndex: winnerIndex,
        currentTrick: game.play.currentTrick,
        hands: game.hands.map((h, i) => ({
          playerId: game.players[i]?.id,
          handCount: h.length,
        })),
      });
      
      // If the next player is a bot, trigger their move with a delay
      const nextPlayer = game.players[winnerIndex];
      if (nextPlayer && nextPlayer.type === 'bot') {
        console.log('[HUMAN TIMEOUT BOT TURN DEBUG] Triggering bot', nextPlayer.username, 'at position', winnerIndex, 'to play after delay');
        setTimeout(() => {
          botPlayCard(game, winnerIndex);
        }, 800); // Reduced delay for faster bot play
      } else {
        console.log('[HUMAN TIMEOUT BOT TURN DEBUG] Next player is human', nextPlayer?.username, 'at position', winnerIndex, '- waiting for human input');
        // Start timeout for human players in playing phase using the main timeout system
        console.log('[HUMAN TIMEOUT TIMEOUT DEBUG] Starting timeout for human player in playing phase:', nextPlayer?.username);
        // Import the timeout function from index.ts
        const { startTurnTimeout } = require('../index');
        startTurnTimeout(game, winnerIndex, 'playing');
      }
    } else {
      // Trick is not complete, advance to next player
      let nextPlayerIndex = (seatIndex + 1) % 4;
      game.play.currentPlayerIndex = nextPlayerIndex;
      game.play.currentPlayer = game.players[nextPlayerIndex]?.id ?? '';
      
      // Emit play_update to notify frontend about the card being played
      io.to(game.id).emit('play_update', {
        currentPlayerIndex: nextPlayerIndex,
        currentTrick: game.play.currentTrick,
        hands: game.hands.map((h, i) => ({
          playerId: game.players[i]?.id,
          handCount: h.length,
        })),
      });
      
      // Emit game update to ensure frontend has latest state
      io.to(game.id).emit('game_update', enrichGameForClient(game));
      
      // If the next player is a bot, trigger their move with a delay
      const nextPlayer = game.players[nextPlayerIndex];
      if (nextPlayer && nextPlayer.type === 'bot') {
        console.log('[HUMAN TIMEOUT BOT TURN DEBUG] Triggering bot', nextPlayer.username, 'at position', nextPlayerIndex, 'to play after delay');
        setTimeout(() => {
          botPlayCard(game, nextPlayerIndex);
        }, 800); // Reduced delay for faster bot play
      } else {
        console.log('[HUMAN TIMEOUT BOT TURN DEBUG] Next player is human', nextPlayer?.username, 'at position', nextPlayerIndex, '- waiting for human input');
        // Start timeout for human players in playing phase using the main timeout system
        console.log('[HUMAN TIMEOUT TIMEOUT DEBUG] Starting timeout for human player in playing phase:', nextPlayer?.username);
        // Import the timeout function from index.ts
        const { startTurnTimeout } = require('../index');
        startTurnTimeout(game, nextPlayerIndex, 'playing');
      }
    }
  }, 300);
}

// NEW: Log game when it starts (not just when completed)
export async function logGameStart(game: Game) {
  console.log('Logging game start to database');
  
  try {
    // Determine if this is a rated game (4 human players)
    const humanPlayers = game.players.filter(p => p && p.type === 'human');
    const isRatedGame = humanPlayers.length === 4;
    
    // Determine game settings based on game rules
    const gameMode = game.gameMode;
    const bidType = game.rules?.bidType || 'REG';
    const specialRules = game.specialRules || {};
    
    // Determine boolean flags
    const solo = gameMode === 'SOLO';
    const whiz = bidType === 'WHIZ';
    const mirror = bidType === 'MIRROR';
    const gimmick = bidType === 'SUICIDE' || bidType === '4 OR NIL' || bidType === 'BID 3' || bidType === 'BID HEARTS' || bidType === 'CRAZY ACES';
    const screamer = specialRules.screamer === true;
    const assassin = specialRules.assassin === true;
    
    // Get creator ID from the first human player
    const creatorPlayer = humanPlayers[0];
    const creatorId = creatorPlayer?.id;
    
    if (!creatorId) {
      console.error('No creator ID found for game logging');
      return;
    }
    
    // Create initial game record in database
    const dbGame = await prisma.game.create({
      data: {
        creatorId,
        status: 'PLAYING', // Game is now in progress
        gameMode: gameMode as any, // Cast to enum
        bidType: bidType === 'WHIZ' ? 'WHIZ' : bidType === 'MIRROR' ? 'MIRRORS' : 'GIMMICK' as any, // Map to schema enum
        specialRules: Object.keys(specialRules).filter(key => specialRules[key as keyof typeof specialRules] === true) as any[],
        minPoints: game.rules?.minPoints || 0,
        maxPoints: game.rules?.maxPoints || 0,
        buyIn: game.buyIn || 0,
        solo,
        whiz,
        mirror,
        gimmick,
        screamer,
        assassin,
        // NEW: Game tracking fields
        rated: isRatedGame, // Only rated if 4 human players
        completed: false, // Game just started
        cancelled: false,
        finalScore: 0, // Will be updated when game completes
        winner: 0, // Will be updated when game completes
        gameType: bidType === 'WHIZ' ? 'WHIZ' : bidType === 'MIRROR' ? 'MIRRORS' : 'GIMMICK',
        league: (game as any).league || false, // Add league flag
        specialRulesApplied: Object.keys(specialRules).filter(key => specialRules[key as keyof typeof specialRules] === true) as any[]
      }
    });
    
    // Store the database game ID in the game object for later updates
    game.dbGameId = dbGame.id;
    
    console.log(`Logged game start ${dbGame.id} with settings: solo=${solo}, whiz=${whiz}, mirror=${mirror}, gimmick=${gimmick}, rated=${isRatedGame}`);
    
    // Create initial game player records
    for (let i = 0; i < 4; i++) {
      const player = game.players[i];
      if (!player) continue; // Skip empty seats
      
      const userId = player.type === 'human' ? player.id : 'bot';
      
      // Determine team for partners games
      let team = null;
      if (gameMode === 'PARTNERS') {
        team = (i === 0 || i === 2) ? 1 : 2;
      }
      
      await prisma.gamePlayer.create({
        data: {
          gameId: dbGame.id,
          userId, // Use 'bot' as placeholder for bot players
          position: i,
          team,
          bid: 0, // Will be updated during bidding
          bags: 0, // Will be updated during play
          points: 0, // Will be updated during play
          // NEW: Final game results (will be updated when game completes)
          finalScore: 0,
          finalBags: 0,
          finalPoints: 0,
          won: false
        }
      });
    }
    
    console.log(`Created initial game player records for game ${dbGame.id}`);
    
  } catch (err) {
    console.error('Failed to log game start:', err);
  }
}

export default router; 