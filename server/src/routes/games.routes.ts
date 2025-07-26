import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Game, GamePlayer, Card, Suit, Rank, BiddingOption, GamePlayOption } from '../types/game';
import { io } from '../index';
import { PrismaClient } from '@prisma/client';
import type { AuthenticatedSocket } from '../index';

const router = Router();
const prisma = new PrismaClient();

// Helper function to filter out null values
function isNonNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

// In-memory games store
export const games: Game[] = [];

// Create a new game
router.post('/', (req, res) => {
  try {
    const settings = req.body;
    const creatorPlayer = {
      id: settings.creatorId,
      username: settings.creatorName,
      avatar: settings.creatorImage || null,
      type: 'human' as const,
    };
    // Determine forcedBid based on bidding option
    let forcedBid: 'SUICIDE' | 'BID4NIL' | 'BID3' | 'BIDHEARTS' | 'NONE' = 'NONE';
    
    if (settings.biddingOption === 'SUICIDE') {
      forcedBid = 'SUICIDE';
    } else if (settings.biddingOption === '4 OR NIL') {
      forcedBid = 'BID4NIL';
    } else if (settings.biddingOption === 'BID 3') {
      forcedBid = 'BID3';
    } else if (settings.biddingOption === 'BID HEARTS') {
      forcedBid = 'BIDHEARTS';
    }
    
    console.log('[GAME CREATION DEBUG] Creating game with settings:', {
      gameMode: settings.gameMode,
      biddingOption: settings.biddingOption,
      specialRules: settings.specialRules,
      forcedBid,
      finalGameType: (settings.biddingOption === 'SUICIDE' || settings.biddingOption === '4 OR NIL' || settings.biddingOption === 'BID 3' || settings.biddingOption === 'BID HEARTS') ? 'REG' : (settings.biddingOption || 'REG')
    });
    
    const newGame: Game = {
      id: uuidv4(),
      gameMode: settings.gameMode,
      maxPoints: settings.maxPoints,
      minPoints: settings.minPoints,
      buyIn: settings.buyIn,
      forcedBid,
      specialRules: settings.specialRules || {},
      players: [creatorPlayer, null, null, null],
      spectators: [],
      status: 'WAITING' as Game['status'],
      completedTricks: [],
      rules: {
        // For gimmick games (SUICIDE, 4 OR NIL, BID 3, BID HEARTS), set gameType to 'REG'
        // and use forcedBid to distinguish between them
        gameType: (settings.biddingOption === 'SUICIDE' || settings.biddingOption === '4 OR NIL' || settings.biddingOption === 'BID 3' || settings.biddingOption === 'BID HEARTS') ? 'REG' : (settings.biddingOption || 'REG'),
        allowNil: settings.specialRules?.allowNil ?? true,
        allowBlindNil: settings.specialRules?.allowBlindNil ?? false,
        coinAmount: settings.buyIn,
        maxPoints: settings.maxPoints,
        minPoints: settings.minPoints,
        bidType: settings.biddingOption || 'REG' as BiddingOption,
        gimmickType: 'REG' as GamePlayOption
      },
      isBotGame: false,
    };
    games.push(newGame);
    io.emit('games_updated', games);
    res.status(201).json(newGame);
  } catch (err) {
    console.error('Error creating game:', err);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

// List all games
router.get('/', (_req, res) => {
  res.json(games);
});

// Get game details
router.get('/:id', (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
});

// Join a game
router.post('/:id/join', async (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  // Use requested seat if provided and available
  const requestedSeat = typeof req.body.seat === 'number' ? req.body.seat : null;
  const playerId = req.body.id;
  const player = {
    id: playerId,
    username: req.body.username || 'Unknown',
    avatar: req.body.avatar || '/default-pfp.jpg',
    type: 'human' as const,
    position: requestedSeat
  };

  // Prevent duplicate join
  if (game.players.some(p => p && p.id === player.id)) {
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

  // Use requested seat if provided and available
  if (
    requestedSeat !== null &&
    requestedSeat >= 0 &&
    requestedSeat < 4
  ) {
    if (game.players[requestedSeat] !== null) {
      return res.status(400).json({ error: 'Seat is already taken' });
    }
    game.players[requestedSeat] = player;
  } else {
    return res.status(400).json({ error: 'Invalid seat selection' });
  }

  res.json(game);
  io.emit('games_updated', games);
  // Emit game_update to the game room for real-time sync
  io.to(game.id).emit('game_update', enrichGameForClient(game));
});

// Invite a bot to an empty seat (host only, pre-game)
router.post('/:id/invite-bot', (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status !== 'WAITING') return res.status(400).json({ error: 'Game already started' });
  const { seatIndex, requesterId } = req.body;
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
router.post('/:id/invite-bot-midgame', (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status === 'WAITING') return res.status(400).json({ error: 'Game has not started' });
  const { seatIndex, requesterId } = req.body;
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
router.post('/:id/spectate', async (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const userId = req.body.id;
  if (!userId) return res.status(400).json({ error: 'Missing user id' });
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
router.post('/:id/leave', (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  const userId = req.body.id;
  // Remove from players
  const playerIdx = game.players.findIndex(p => p && p.id === userId);
  if (playerIdx !== -1) {
    game.players[playerIdx] = null;
  }
  // Remove from spectators
  const specIdx = game.spectators.findIndex(s => s.id === userId);
  if (specIdx !== -1) {
    game.spectators.splice(specIdx, 1);
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
router.post('/:id/start', async (req, res) => {
  console.log('[DEBUG] /start route CALLED for game', req.params.id);
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status !== 'WAITING') return res.status(400).json({ error: 'Game already started' });
  
  // If any seat is a bot, set isBotGame true
  game.isBotGame = game.players.some(p => p && p.type === 'bot');
  
  if (!game.isBotGame) {
    // Debit buy-in from each human player's coin balance
    try {
      for (const player of game.players) {
        if (player && player.type === 'human') {
          await prisma.user.update({
            where: { id: player.id },
            data: { coins: { decrement: game.buyIn } }
          });
        }
      }
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
router.post('/:id/remove-bot', (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status !== 'WAITING') return res.status(400).json({ error: 'Game already started' });
  const { seatIndex, requesterId } = req.body;
  // Only host can remove bots
  if (game.players[0]?.id !== requesterId) return res.status(403).json({ error: 'Only host can remove bots' });
  if (seatIndex < 0 || seatIndex > 3 || !game.players[seatIndex] || game.players[seatIndex].type !== 'bot') return res.status(400).json({ error: 'Invalid seat or not a bot' });
  game.players[seatIndex] = null;
  io.emit('games_updated', games);
  io.to(game.id).emit('game_update', enrichGameForClient(game));
  res.json(game);
});

// Remove a bot from a seat mid-game (partner only)
router.post('/:id/remove-bot-midgame', (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status === 'WAITING') return res.status(400).json({ error: 'Game has not started' });
  const { seatIndex, requesterId } = req.body;
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
function calculateBotBid(hand: Card[], gameType?: string, partnerBid?: number, forcedBid?: string, allowNil?: boolean, allowBlindNil?: boolean): number {
  if (!hand) return 1;
  
  // For SUICIDE games, implement smart suicide bidding logic
  if (forcedBid === 'SUICIDE') {
    const spades = hand.filter(c => c.suit === 'S');
    const hasAceSpades = spades.some(c => c.rank === 'A');
    const hasQueenKingSpades = spades.some(c => c.rank === 'Q') && spades.some(c => c.rank === 'K');
    
    // Check for lone aces in other suits
    const hasLoneAce = ['H', 'D', 'C'].some(suit => {
      const suitCards = hand.filter(c => c.suit === suit);
      return suitCards.length === 1 && suitCards[0].rank === 'A';
    });
    
    // If partner hasn't bid yet (first partner)
    if (partnerBid === undefined) {
      // Don't nil if we have strong spades or lone aces
      if (hasAceSpades || hasQueenKingSpades || spades.length > 3 || hasLoneAce) {
        // Calculate a smart bid based on hand strength
        let bid = 0;
        
        // Spades logic
        if (hasAceSpades) bid += 1;
        if (hasQueenKingSpades) bid += 1;
        if (spades.length >= 3) bid += 1;
        if (spades.length >= 5) bid += 1;
        
        // Non-spades logic
        for (const suit of ['H', 'D', 'C']) {
          const suitCards = hand.filter(c => c.suit === suit);
          if (suitCards.some(c => c.rank === 'A')) bid += 1;
          if (suitCards.some(c => c.rank === 'K') && suitCards.length >= 2) bid += 1;
          if (suitCards.some(c => c.rank === 'Q') && suitCards.length >= 3) bid += 1;
        }
        
        // Adjust bid based on hand strength
        if (bid >= 6) return Math.min(bid, 8); // Strong hand: 6-8
        if (bid >= 4) return Math.min(bid, 5); // Good hand: 4-5
        return Math.max(2, bid); // Weak hand: 2-3
      } else {
        // Weak hand, consider nil
        return Math.random() < 0.6 ? 0 : Math.max(2, spades.length);
      }
    }
    
    // If partner already bid (second partner)
    if (partnerBid === 0) {
      // Partner bid nil, so we can bid normally
      // Don't nil if we have strong spades
      if (hasAceSpades || hasQueenKingSpades || spades.length > 3) {
        let bid = 0;
        if (hasAceSpades) bid += 1;
        if (hasQueenKingSpades) bid += 1;
        if (spades.length >= 3) bid += 1;
        if (spades.length >= 5) bid += 1;
        
        for (const suit of ['H', 'D', 'C']) {
          const suitCards = hand.filter(c => c.suit === suit);
          if (suitCards.some(c => c.rank === 'A')) bid += 1;
          if (suitCards.some(c => c.rank === 'K') && suitCards.length >= 2) bid += 1;
        }
        
        return Math.max(2, Math.min(bid, 6));
      } else {
        // Weak hand, likely nil
        return Math.random() < 0.7 ? 0 : Math.max(2, spades.length);
      }
    } else {
      // Partner bid something, so we must bid nil
      return 0;
    }
  }
  
  // For 4 OR NIL games, players must bid 4 or nil
  if (forcedBid === 'BID4NIL') {
    // 50% chance to bid 4, 50% chance to nil
    return Math.random() < 0.5 ? 4 : 0;
  }
  
  // For BID 3 games, players must bid exactly 3
  if (forcedBid === 'BID3') {
    return 3;
  }
  
  // For BID HEARTS games, players must bid the number of hearts in their hand
  if (forcedBid === 'BIDHEARTS') {
    const hearts = hand.filter(c => c.suit === 'H');
    return hearts.length;
  }
  
  // For WHIZ games, use simplified bidding logic
  if (gameType === 'WHIZ') {
    const spades = hand.filter(c => c.suit === 'S');
    const hasAceSpades = spades.some(c => c.rank === 'A');
    
    // If no spades, must bid nil (unless nil is disabled)
    if (spades.length === 0) {
      return allowNil ? 0 : 1; // If nil disabled, bid 1 instead
    }
    
    // If has Ace of Spades, cannot bid nil
    if (hasAceSpades) {
      return spades.length;
    }
    
    // Smart partner bidding logic
    if (partnerBid !== undefined) {
      // If partner already bid nil, try to bid spades count
      if (partnerBid === 0) {
        return spades.length;
      }
      // If partner bid spades count, consider nil if no ace spades
      if (partnerBid > 0 && !hasAceSpades) {
        // 70% chance to bid nil, 30% chance to bid spades count
        return Math.random() < 0.7 ? 0 : spades.length;
      }
    }
    
    // Default: bid spades count
    return spades.length;
  }
  
  // For regular games, use smart bidding logic with nil consideration
  let bid = 0;
  let spades = hand.filter(c => c.suit === 'S');
  let nonSpades = hand.filter(c => c.suit !== 'S');
  const hasAceSpades = spades.some(c => c.rank === 'A');
  const hasQueenKingSpades = spades.some(c => c.rank === 'Q') && spades.some(c => c.rank === 'K');
  
  // Check for lone aces in other suits
  const hasLoneAce = ['H', 'D', 'C'].some(suit => {
    const suitCards = hand.filter(c => c.suit === suit);
    return suitCards.length === 1 && suitCards[0].rank === 'A';
  });
  
  // Spades logic
  if (hasAceSpades) bid += 1;
  if (hasQueenKingSpades) bid += 1;
  if (spades.length >= 3) bid += 1;
  if (spades.length >= 5) bid += 1;
  
  // Non-spades logic
  for (const suit of ['H', 'D', 'C']) {
    const suitCards = hand.filter(c => c.suit === suit);
    if (suitCards.some(c => c.rank === 'A')) bid += 1;
    if (suitCards.some(c => c.rank === 'K') && suitCards.length >= 2) bid += 1;
    if (suitCards.some(c => c.rank === 'Q') && suitCards.length >= 3) bid += 1;
  }
  
  // Smart nil consideration for regular games (only if nil is allowed)
  if (allowNil && partnerBid !== undefined) {
    // If partner already bid nil, consider nil if we have a weak hand
    if (partnerBid === 0) {
      if (bid <= 2 && !hasAceSpades && !hasLoneAce) {
        // Weak hand, consider nil
        return Math.random() < 0.6 ? 0 : Math.max(1, bid);
      }
    }
    // If partner bid something, consider nil if we have a very weak hand
    else if (partnerBid > 0 && bid <= 1 && !hasAceSpades && !hasLoneAce) {
      return Math.random() < 0.7 ? 0 : Math.max(1, bid);
    }
  }
  
  return Math.max(1, bid); // Always bid at least 1
}

// --- Basic Bot Engine ---
export function botMakeMove(game: Game, seatIndex: number) {
  const bot = game.players[seatIndex];
  console.log('[BOT DEBUG] botMakeMove called for seat', seatIndex, 'bot:', bot && bot.username, 'game.status:', game.status, 'bidding:', !!game.bidding, 'currentBidderIndex:', game.bidding?.currentBidderIndex, 'bids:', game.bidding?.bids);
  if (!bot || bot.type !== 'bot') {
    console.log('[BOT DEBUG] Not a bot or no player at seat', seatIndex);
    return;
  }
  // Only act if it's the bot's turn to bid
  if (game.status === 'BIDDING' && game.bidding && game.bidding.currentBidderIndex === seatIndex && game.bidding.bids && game.bidding.bids[seatIndex] === null) {
    setTimeout(() => {
      if (!game.bidding || !game.bidding.bids) return; // Guard for undefined
      console.log('[BOT DEBUG] Bot', bot.username, 'is making a bid...');
      // Calculate bid based on game type
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
            bid = calculateBotBid(game.hands[seatIndex], 'WHIZ', partnerBid, undefined, game.rules.allowNil, game.rules.allowBlindNil);
            console.log('[BOT DEBUG] Whiz game - Bot', bot.username, 'has', game.hands[seatIndex].filter(c => c.suit === 'S').length, 'spades, partner bid:', partnerBid, 'bidding', bid);
          } else if (game.forcedBid === 'SUICIDE') {
            // Suicide games: implement suicide bidding logic
            bid = calculateBotBid(game.hands[seatIndex], 'REG', partnerBid, 'SUICIDE', game.rules.allowNil, game.rules.allowBlindNil);
            console.log('[BOT DEBUG] Suicide game - Bot', bot.username, 'has', game.hands[seatIndex].filter(c => c.suit === 'S').length, 'spades, partner bid:', partnerBid, 'bidding', bid);
          } else if (game.forcedBid === 'BID4NIL') {
            // 4 OR NIL games: bot must bid 4 or nil
            bid = calculateBotBid(game.hands[seatIndex], 'REG', partnerBid, 'BID4NIL', game.rules.allowNil, game.rules.allowBlindNil);
            console.log('[BOT DEBUG] 4 OR NIL game - Bot', bot.username, 'bidding', bid);
          } else if (game.forcedBid === 'BID3') {
            // BID 3 games: bot must bid exactly 3
            bid = calculateBotBid(game.hands[seatIndex], 'REG', partnerBid, 'BID3', game.rules.allowNil, game.rules.allowBlindNil);
            console.log('[BOT DEBUG] BID 3 game - Bot', bot.username, 'bidding', bid);
          } else if (game.forcedBid === 'BIDHEARTS') {
            // BID HEARTS games: bot must bid number of hearts
            bid = calculateBotBid(game.hands[seatIndex], 'REG', partnerBid, 'BIDHEARTS', game.rules.allowNil, game.rules.allowBlindNil);
            console.log('[BOT DEBUG] BID HEARTS game - Bot', bot.username, 'has', game.hands[seatIndex].filter(c => c.suit === 'H').length, 'hearts, bidding', bid);
          } else if (game.rules.bidType === 'REG') {
            // Regular games: use complex bidding logic
            bid = calculateBotBid(game.hands[seatIndex], 'REG', partnerBid, undefined, game.rules.allowNil, game.rules.allowBlindNil);
          } else {
            // Default fallback
            bid = calculateBotBid(game.hands[seatIndex], 'REG', partnerBid, undefined, game.rules.allowNil, game.rules.allowBlindNil);
          }
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
        // All bids in, move to play phase (let existing logic handle this)
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
        game.status = 'PLAYING';
        game.play = {
          currentPlayer: firstPlayer.id ?? '',
          currentPlayerIndex: (game.dealerIndex + 1) % 4,
          currentTrick: [],
          tricks: [],
          trickNumber: 0,
          spadesBroken: false
        };
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
        }
      }
    }, 1000);
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

// --- Smart Card Selection Functions for Suicide Games ---
function selectCardForNil(playableCards: Card[], currentTrick: Card[], hand: Card[]): Card {
  // Nil player should try to avoid winning tricks
  if (currentTrick.length === 0) {
    // Leading - play lowest card possible
    return playableCards.reduce((lowest, card) => {
      return getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest;
    });
  }
  
  // Following - try to play highest card under the current highest
  const leadSuit = currentTrick[0].suit;
  const highestOnTable = currentTrick.reduce((highest, card) => {
    return getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest;
  });
  
  const cardsOfLeadSuit = playableCards.filter(c => c.suit === leadSuit);
  if (cardsOfLeadSuit.length > 0) {
    // Must follow suit - play highest card under the highest on table
    const cardsUnderHighest = cardsOfLeadSuit.filter(c => 
      getCardValue(c.rank) < getCardValue(highestOnTable.rank)
    );
    
    if (cardsUnderHighest.length > 0) {
      // Play highest card under the highest on table
      return cardsUnderHighest.reduce((highest, card) => {
        return getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest;
      });
    } else {
      // All cards are higher - play the lowest
      return cardsOfLeadSuit.reduce((lowest, card) => {
        return getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest;
      });
    }
  } else {
    // Void in lead suit - discard highest cards in other suits (not spades)
    const nonSpades = playableCards.filter(c => c.suit !== 'S');
    if (nonSpades.length > 0) {
      // Discard highest non-spade
      return nonSpades.reduce((highest, card) => {
        return getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest;
      });
    } else {
      // Only spades left - play lowest spade
      return playableCards.reduce((lowest, card) => {
        return getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest;
      });
    }
  }
}

function selectCardToCoverPartner(playableCards: Card[], currentTrick: Card[], hand: Card[], partnerHand: Card[]): Card {
  // Partner is nil - try to cover by leading high cards and suits partner is void in
  if (currentTrick.length === 0) {
    // Leading - lead highest cards first, especially in suits partner is void
    const partnerVoidSuits = ['H', 'D', 'C', 'S'].filter(suit => 
      !partnerHand.some(c => c.suit === suit)
    );
    
    // Prioritize leading in suits partner is void
    for (const suit of partnerVoidSuits) {
      const suitCards = playableCards.filter(c => c.suit === suit);
      if (suitCards.length > 0) {
        // Lead highest card in this suit
        return suitCards.reduce((highest, card) => {
          return getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest;
        });
      }
    }
    
    // If no void suits available, lead highest card
    return playableCards.reduce((highest, card) => {
      return getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest;
    });
  }
  
  // Following - play to win if possible, otherwise play high
  const leadSuit = currentTrick[0].suit;
  const highestOnTable = currentTrick.reduce((highest, card) => {
    return getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest;
  });
  
  const cardsOfLeadSuit = playableCards.filter(c => c.suit === leadSuit);
  if (cardsOfLeadSuit.length > 0) {
    // Can beat the highest on table
    const winningCards = cardsOfLeadSuit.filter(c => 
      getCardValue(c.rank) > getCardValue(highestOnTable.rank)
    );
    
    if (winningCards.length > 0) {
      // Play lowest winning card
      return winningCards.reduce((lowest, card) => {
        return getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest;
      });
    } else {
      // Can't win - play highest card
      return cardsOfLeadSuit.reduce((highest, card) => {
        return getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest;
      });
    }
  } else {
    // Void in lead suit - play highest spade if possible
    const spades = playableCards.filter(c => c.suit === 'S');
    if (spades.length > 0) {
      return spades.reduce((highest, card) => {
        return getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest;
      });
    } else {
      // No spades - play highest card
      return playableCards.reduce((highest, card) => {
        return getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest;
      });
    }
  }
}

function selectCardToWin(playableCards: Card[], currentTrick: Card[], hand: Card[]): Card {
  // Normal bidding - try to win the trick
  if (currentTrick.length === 0) {
    // Leading - lead highest card
    return playableCards.reduce((highest, card) => {
      return getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest;
    });
  }
  
  // Following - try to win if possible
  const leadSuit = currentTrick[0].suit;
  const highestOnTable = currentTrick.reduce((highest, card) => {
    return getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest;
  });
  
  const cardsOfLeadSuit = playableCards.filter(c => c.suit === leadSuit);
  if (cardsOfLeadSuit.length > 0) {
    // Can beat the highest on table
    const winningCards = cardsOfLeadSuit.filter(c => 
      getCardValue(c.rank) > getCardValue(highestOnTable.rank)
    );
    
    if (winningCards.length > 0) {
      // Play lowest winning card
      return winningCards.reduce((lowest, card) => {
        return getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest;
      });
    } else {
      // Can't win - play lowest card
      return cardsOfLeadSuit.reduce((lowest, card) => {
        return getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest;
      });
    }
  } else {
    // Void in lead suit - play highest spade if possible
    const spades = playableCards.filter(c => c.suit === 'S');
    if (spades.length > 0) {
      return spades.reduce((highest, card) => {
        return getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest;
      });
    } else {
      // No spades - play lowest card
      return playableCards.reduce((lowest, card) => {
        return getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest;
      });
    }
  }
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
  // Find playable cards
  let playableCards: Card[] = [];
  if (leadSuit) {
    playableCards = hand.filter(c => c.suit === leadSuit);
    if (playableCards.length === 0) {
      playableCards = hand; // No cards of lead suit, can play anything
    }
  } else {
    // Bot is leading
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
      card = selectCardToCoverPartner(playableCards, game.play.currentTrick, hand, game.hands[partnerIndex] || []);
    } else {
      // Normal bidding - play to win
      card = selectCardToWin(playableCards, game.play.currentTrick, hand);
    }
  } else {
    // All other game types - check for nil players
    if (botBid === 0) {
      // Bot is nil - try to avoid winning tricks
      card = selectCardForNil(playableCards, game.play.currentTrick, hand);
    } else if (partnerBid === 0) {
      // Partner is nil - try to cover partner
      card = selectCardToCoverPartner(playableCards, game.play.currentTrick, hand, game.hands[partnerIndex] || []);
    } else {
      // Normal bidding - play to win
      card = selectCardToWin(playableCards, game.play.currentTrick, hand);
    }
  }
  if (!card) return;
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
        const enrichedGame = enrichGameForClient(game);
        console.log('[BOT TRICK DEBUG] Emitting game_update with currentPlayer:', enrichedGame.play?.currentPlayer, 'currentPlayerIndex:', enrichedGame.play?.currentPlayerIndex);
        io.to(game.id).emit('game_update', enrichedGame);
        
        // Emit trick complete with the stored trick data for animation
        io.to(game.id).emit('trick_complete', {
          trick: {
            cards: completedTrick,
            winnerIndex: winnerIndex,
          },
          trickNumber: game.play.trickNumber,
        });
        
        // Emit clear trick event after animation delay
        setTimeout(() => {
          io.to(game.id).emit('clear_trick');
        }, 2000); // 2 second delay to match frontend animation
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
            game.status = 'COMPLETED';
            
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
          
          if (
            game.team1TotalScore >= maxPoints || game.team2TotalScore >= maxPoints ||
            game.team1TotalScore <= minPoints || game.team2TotalScore <= minPoints
          ) {
            console.log('[GAME OVER] Game ended! Team 1:', game.team1TotalScore, 'Team 2:', game.team2TotalScore);
            game.status = 'COMPLETED';
            const winningTeam = game.team1TotalScore > game.team2TotalScore ? 1 : 2;
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
        
        if (
          game.team1TotalScore >= maxPoints || game.team2TotalScore >= maxPoints ||
          game.team1TotalScore <= minPoints || game.team2TotalScore <= minPoints
        ) {
          console.log('[GAME OVER] Game ended! Team 1:', game.team1TotalScore, 'Team 2:', game.team2TotalScore);
          game.status = 'COMPLETED';
          const winningTeam = game.team1TotalScore > game.team2TotalScore ? 1 : 2;
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
        }, 1500); // 1.5 second delay
      } else {
        console.log('[BOT TURN DEBUG] Next player is human', nextPlayer?.username, 'at position', nextPlayerIndex, '- waiting for human input');
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

function getCardValue(rank: Rank): number {
  const rankMap: Record<Rank, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return rankMap[rank];
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
  
  // Calculate team bids and tricks
  for (const i of team1) {
    const bid = game.bidding.bids[i] ?? 0; // Default to 0 if bid is null
    team1Bid += bid;
    team1Tricks += tricksPerPlayer[i];
  }
  for (const i of team2) {
    const bid = game.bidding.bids[i] ?? 0; // Default to 0 if bid is null
    team2Bid += bid;
    team2Tricks += tricksPerPlayer[i];
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
    team1Bags = 0;
  }
  // Team 2 scoring
  if (team2Tricks >= team2Bid) {
    team2Score += team2Bid * 10;
    team2Bags = team2Tricks - team2Bid;
    team2Score += team2Bags;
  } else {
    team2Score -= team2Bid * 10;
    team2Bags = 0;
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
function calculateSoloHandScore(game: Game) {
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

// --- Stats and coins update helper ---
async function updateStatsAndCoins(game: Game, winningTeamOrPlayer: number) {
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
    
    try {
      // Update overall stats
      const stats = await prisma.userStats.update({
        where: { userId },
        data: {
          gamesPlayed: { increment: 1 },
          gamesWon: { increment: isWinner ? 1 : 0 }
        }
      });
    } catch (err) {
      console.error('Failed to update stats/coins for user', userId, err);
    }
  }
}

// Helper to enrich game object for client
function enrichGameForClient(game: Game, userId?: string): Game {
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

export default router; 