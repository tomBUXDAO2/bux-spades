import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Game, GamePlayer, Card, Suit, Rank, BiddingOption, GamePlayOption } from '../types/game';
import { io } from '../index';
import { PrismaClient } from '@prisma/client';
import type { AuthenticatedSocket } from '../index';

const router = Router();
const prisma = new PrismaClient();

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
    const newGame: Game = {
      id: uuidv4(),
      gameMode: settings.gameMode,
      maxPoints: settings.maxPoints,
      minPoints: settings.minPoints,
      buyIn: settings.buyIn,
      forcedBid: (settings.specialRules?.screamer ? 'SUICIDE' : 'NONE') as 'SUICIDE' | 'NONE',
      specialRules: settings.specialRules || {},
      players: [creatorPlayer, null, null, null],
      spectators: [],
      status: 'WAITING' as Game['status'],
      completedTricks: [],
      rules: {
        gameType: settings.gameMode,
        allowNil: true,
        allowBlindNil: false,
        coinAmount: settings.buyIn,
        maxPoints: settings.maxPoints,
        minPoints: settings.minPoints,
        bidType: 'REG' as BiddingOption,
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
function calculateBotBid(hand: Card[]): number {
  if (!hand) return 1;
  let bid = 0;
  let spades = hand.filter(c => c.suit === 'S');
  let nonSpades = hand.filter(c => c.suit !== 'S');
  // Spades logic
  if (spades.some(c => c.rank === 'A')) bid += 1;
  if (spades.some(c => c.rank === 'K') && spades.length >= 2) bid += 1;
  if (spades.some(c => c.rank === 'Q') && spades.length >= 3) bid += 1;
  if (spades.some(c => c.rank === 'J') && spades.length >= 4) bid += 1;
  // +1 for every spade more than 4
  if (spades.length > 4) bid += spades.length - 4;
  // Non-spades logic
  for (const suit of ['H', 'D', 'C']) {
    if (nonSpades.some(c => c.suit === suit && c.rank === 'A')) bid += 1;
    if (nonSpades.some(c => c.suit === suit && c.rank === 'K')) bid += 1;
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
      // Calculate bid for REGULAR games
      let bid = 1;
      if (game.rules && game.rules.bidType === 'REG' && game.hands && game.hands[seatIndex]) {
        bid = calculateBotBid(game.hands[seatIndex]);
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
          trickNumber: 0
        };
        // Emit game_update for client sync
        io.to(game.id).emit('game_update', enrichGameForClient(game));
        io.to(game.id).emit('bidding_complete', { currentBidderIndex: null, bids: game.bidding.bids });
        io.to(game.id).emit('play_start', {
          currentPlayerIndex: game.play.currentPlayerIndex,
          currentTrick: game.play.currentTrick,
          trickNumber: game.play.trickNumber,
        });
        // If first player is a bot, trigger bot card play
        if (firstPlayer.type === 'bot') {
          console.log('[BOT DEBUG] (ROUTES) About to call botPlayCard for seat', (game.dealerIndex + 1) % 4, 'bot:', firstPlayer.username);
          botPlayCard(game, (game.dealerIndex + 1) % 4);
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

// --- Bot Card Play Logic ---
export function botPlayCard(game: Game, seatIndex: number) {
  const bot = game.players[seatIndex];
  if (!bot || bot.type !== 'bot' || !game.hands || !game.play) return;
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
    playableCards = hand; // Bot is leading, can play anything
  }
  // Simple bot: pick a random playable card
  const card = playableCards[Math.floor(Math.random() * playableCards.length)];
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
      game.play.currentPlayerIndex = winnerIndex;
      game.play.currentPlayer = game.players[winnerIndex]?.id ?? '';
      console.log('[BOT TRICK DEBUG] Set current player to winner:', winnerIndex, game.players[winnerIndex]?.username);
      // Update player trick counts
      if (game.players[winnerIndex]) {
        game.players[winnerIndex]!.tricks = (game.players[winnerIndex]!.tricks || 0) + 1;
      }
      // Emit trick complete with the current trick before clearing it
      io.to(game.id).emit('trick_complete', {
        trick: {
          cards: game.play.currentTrick,
          winnerIndex: winnerIndex,
        },
        trickNumber: game.play.trickNumber,
      });
      // Emit immediate game update with updated trick counts
      const enrichedGame = enrichGameForClient(game);
      console.log('[BOT TRICK DEBUG] Emitting game_update with currentPlayer:', enrichedGame.play?.currentPlayer, 'currentPlayerIndex:', enrichedGame.play?.currentPlayerIndex);
      io.to(game.id).emit('game_update', enrichedGame);
      // Delay clearing the trick to allow frontend animation
      setTimeout(() => {
        if (!game.play) return; // Guard for undefined
        game.play!.currentTrick = [];
        // Do NOT emit game_update here
      }, 2000); // 2 second delay to match frontend animation
      // If all tricks played, move to hand summary/scoring
      if (game.play.trickNumber === 13) {
        // --- Hand summary and scoring ---
        const handSummary = calculatePartnersHandScore(game);
        // Update running totals
        game.team1TotalScore = (game.team1TotalScore || 0) + handSummary.team1Score;
        game.team2TotalScore = (game.team2TotalScore || 0) + handSummary.team2Score;
        game.team1Bags = (game.team1Bags || 0) + handSummary.team1Bags;
        game.team2Bags = (game.team2Bags || 0) + handSummary.team2Bags;
        io.to(game.id).emit('hand_completed', {
          ...handSummary,
          team1TotalScore: game.team1TotalScore,
          team2TotalScore: game.team2TotalScore,
          team1Bags: game.team1Bags,
          team2Bags: game.team2Bags,
        });
        // --- Game over check ---
        const winThreshold = 500, lossThreshold = -150;
        if (
          game.team1TotalScore >= winThreshold || game.team2TotalScore >= winThreshold ||
          game.team1TotalScore <= lossThreshold || game.team2TotalScore <= lossThreshold
        ) {
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
        // Add a small delay to allow the trick completion animation
        setTimeout(() => {
          botPlayCard(game, winnerIndex);
        }, 2500); // 2.5 second delay to allow trick completion animation
      }
      return;
    } else {
      // Advance to the next player
      let nextPlayerIndex = (game.play.currentPlayerIndex + 1) % 4;
      game.play.currentPlayerIndex = nextPlayerIndex;
      game.play.currentPlayer = game.players[nextPlayerIndex]?.id ?? '';
      // If the next player is a bot, trigger their move
      const nextPlayer = game.players[nextPlayerIndex];
      if (nextPlayer && nextPlayer.type === 'bot') {
        setTimeout(() => {
          botPlayCard(game, nextPlayerIndex);
        }, 1000);
      }
    }
  }, 1000);
}

// --- Bidding socket event ---
import { io as ioInstance } from '../index';
if (ioInstance) {
  ioInstance.on('connection', (socket: AuthenticatedSocket) => {
    socket.on('make_bid', ({ gameId, userId, bid }) => {
      const game = games.find(g => g.id === gameId);
      if (!game || !game.bidding) return;
      
      const playerIndex = game.players.findIndex(p => p && p.id === userId);
      console.log('[BID DEBUG] make_bid received:', { gameId, userId, bid, playerIndex, currentBidderIndex: game.bidding.currentBidderIndex, bids: game.bidding.bids });
      if (playerIndex === -1) {
        console.log('[BID DEBUG] Bid rejected: player not found');
        return;
      }
      
      if (playerIndex !== game.bidding.currentBidderIndex) {
        console.log('[BID DEBUG] Bid rejected: not player turn', { playerIndex, currentBidderIndex: game.bidding.currentBidderIndex });
        return; // Not their turn
      }
      if (game.bidding.bids[playerIndex] !== null) {
        console.log('[BID DEBUG] Bid rejected: already bid', { playerIndex });
        return; // Already bid
      }
      
      // Store the bid
      game.bidding.bids[playerIndex] = bid;
      
      // Find next player who hasn't bid
      let next = (playerIndex + 1) % 4;
      while (game.bidding.bids[next] !== null && next !== playerIndex) {
        next = (next + 1) % 4;
      }
      
      if (game.bidding.bids.every(b => b !== null)) {
        // All bids in, move to play phase
        if (!game.dealerIndex) {
          socket.emit('error', { message: 'Invalid game state: no dealer assigned' });
          return;
        }
        const firstPlayer = game.players[(game.dealerIndex + 1) % 4];
        if (!firstPlayer) {
          socket.emit('error', { message: 'Invalid game state' });
          return;
        }
        
        // --- Play phase state ---
        game.play = {
          currentPlayer: firstPlayer.id,
          currentPlayerIndex: (game.dealerIndex + 1) % 4,
          currentTrick: [],
          tricks: [],
          trickNumber: 0
        };
        
        ioInstance.to(game.id).emit('bidding_complete', { bids: game.bidding.bids });
        ioInstance.to(game.id).emit('play_start', {
          currentPlayerIndex: game.play.currentPlayerIndex,
          currentTrick: game.play.currentTrick,
          trickNumber: game.play.trickNumber,
        });
      } else {
        game.bidding.currentBidderIndex = next;
        game.bidding.currentPlayer = game.players[next]?.id ?? '';
        ioInstance.to(game.id).emit('bidding_update', {
          currentBidderIndex: next,
          bids: game.bidding.bids,
        });
        // If next is a bot, trigger their move
        if (game.players[next] && game.players[next].type === 'bot') {
          botMakeMove(game, next);
        }
      }
    });

    // --- Play phase: play_card event ---
    socket.on('play_card', ({ gameId, userId, card }) => {
      const game = games.find(g => g.id === gameId);
      if (!game || !game.play || !game.hands || !game.bidding) {
        socket.emit('error', { message: 'Invalid game state' });
        return;
      }
      
      const playerIndex = game.players.findIndex(p => p && p.id === userId);
      if (playerIndex === -1) {
        socket.emit('error', { message: 'Player not found in game' });
        return;
      }
      
      if (playerIndex !== game.play.currentPlayerIndex) {
        socket.emit('error', { message: 'Not your turn' });
        return;
      }
      
      // Validate card is in player's hand
      // @ts-ignore
      const hand = game.hands[playerIndex]!;
      if (!hand) {
        socket.emit('error', { message: 'Invalid hand state' });
        return;
      }
      
      const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
      if (cardIndex === -1) {
        socket.emit('error', { message: 'Card not in hand' });
        return;
      }
      
      // Remove card from hand and add to current trick
      hand.splice(cardIndex, 1);
      game.play.currentTrick.push({ ...card, playerIndex });
      
      // If trick is complete (4 cards)
      if (game.play.currentTrick.length === 4) {
        // Determine winner of the trick
        console.log('[TRICK DEBUG] Determining winner for trick:', game.play.currentTrick);
        const winnerIndex = determineTrickWinner(game.play.currentTrick);
        console.log('[TRICK DEBUG] Winner determined:', winnerIndex, 'Winner player:', game.players[winnerIndex]?.username);
        if (winnerIndex === undefined) {
          socket.emit('error', { message: 'Invalid trick state' });
          return;
        }
        game.play.tricks.push({
          cards: game.play.currentTrick,
          winnerIndex,
        });
        game.play.trickNumber += 1;
        game.play.currentPlayerIndex = winnerIndex;
        game.play.currentPlayer = game.players[winnerIndex]?.id ?? '';
        console.log('[TRICK DEBUG] Set current player to winner:', winnerIndex, game.players[winnerIndex]?.username);
        
        // Update player trick counts
        if (game.players[winnerIndex]) {
          game.players[winnerIndex].tricks = (game.players[winnerIndex].tricks || 0) + 1;
        }
        
        // Emit trick complete with the current trick before clearing it
        ioInstance.to(game.id).emit('trick_complete', {
          trick: {
            cards: game.play.currentTrick,
            winnerIndex: winnerIndex,
          },
          trickNumber: game.play.trickNumber,
        });
        
        // Emit immediate game update with updated trick counts
        const enrichedGame = enrichGameForClient(game);
        console.log('[TRICK DEBUG] Emitting game_update with currentPlayer:', enrichedGame.play?.currentPlayer, 'currentPlayerIndex:', enrichedGame.play?.currentPlayerIndex);
        ioInstance.to(game.id).emit('game_update', enrichedGame);
        
        // Delay clearing the trick to allow frontend animation
        setTimeout(() => {
          game.play!.currentTrick = [];
          // Do NOT emit game_update here
        }, 2000); // 2 second delay to match frontend animation
        
        // If all tricks played, move to hand summary/scoring
        if (game.play.trickNumber === 13) {
          // --- Hand summary and scoring ---
          const handSummary = calculatePartnersHandScore(game);
          // Update running totals
          game.team1TotalScore = (game.team1TotalScore || 0) + handSummary.team1Score;
          game.team2TotalScore = (game.team2TotalScore || 0) + handSummary.team2Score;
          game.team1Bags = (game.team1Bags || 0) + handSummary.team1Bags;
          game.team2Bags = (game.team2Bags || 0) + handSummary.team2Bags;
          
          ioInstance.to(game.id).emit('hand_completed', {
            ...handSummary,
            team1TotalScore: game.team1TotalScore,
            team2TotalScore: game.team2TotalScore,
            team1Bags: game.team1Bags,
            team2Bags: game.team2Bags,
          });
          
          // --- Game over check ---
          const winThreshold = 500, lossThreshold = -150;
          if (
            game.team1TotalScore >= winThreshold || game.team2TotalScore >= winThreshold ||
            game.team1TotalScore <= lossThreshold || game.team2TotalScore <= lossThreshold
          ) {
            game.status = 'COMPLETED';
            const winningTeam = game.team1TotalScore > game.team2TotalScore ? 1 : 2;
            ioInstance.to(game.id).emit('game_over', {
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
        
        // If next player is a bot, trigger their move
        if (game.players[game.play.currentPlayerIndex] && game.players[game.play.currentPlayerIndex]!.type === 'bot') {
          botPlayCard(game, game.play.currentPlayerIndex);
        }
      } else {
        // Don't advance to next player - the current player should continue leading
        // Only trigger next bot move if the current player is a bot
        if (game.players[game.play.currentPlayerIndex] && game.players[game.play.currentPlayerIndex]!.type === 'bot') {
          botPlayCard(game, game.play.currentPlayerIndex);
        }
      }
      
      // Emit play update
      const playUpdate = {
        currentPlayerIndex: game.play.currentPlayerIndex,
        currentTrick: game.play.currentTrick,
        hands: game.hands.map((h, i) => ({
          playerId: game.players[i]?.id,
          handCount: h.length,
        })),
      };
      console.log('[PLAY DEBUG] Emitting play_update with currentPlayerIndex:', playUpdate.currentPlayerIndex);
      ioInstance.to(game.id).emit('play_update', playUpdate);
      ioInstance.to(game.id).emit('game_update', enrichGameForClient(game));
    });

    socket.on('leave_game', ({ gameId, userId }) => {
      if (!socket.isAuthenticated || !socket.userId || socket.userId !== userId) {
        console.log('Unauthorized leave_game attempt');
        socket.emit('error', { message: 'Not authorized' });
        return;
      }

      try {
        const game = games.find((g: Game) => g.id === gameId);
        if (!game) {
          console.log(`Game ${gameId} not found`);
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        // Remove the player from the game
        const playerIdx = game.players.findIndex((p: GamePlayer | null) => p && p.id === userId);
        if (playerIdx !== -1) {
          game.players[playerIdx] = null;
          socket.leave(gameId);
          // Emit game_update to the game room for real-time sync
          io.to(gameId).emit('game_update', enrichGameForClient(game));
          io.emit('games_updated', games);
          console.log(`User ${userId} left game ${gameId}`);
        }

        // Check if there are any human players left
        const hasHumanPlayers = game.players.some((p: GamePlayer | null) => p && p.type === 'human');
        
        // If no human players remain, remove the game
        if (!hasHumanPlayers) {
          const gameIdx = games.findIndex((g: Game) => g.id === gameId);
          if (gameIdx !== -1) {
            games.splice(gameIdx, 1);
            io.emit('games_updated', games);
            console.log(`Game ${gameId} removed (no human players left)`);
          }
        }
      } catch (error) {
        console.error('Error in leave_game:', error);
        socket.emit('error', { message: 'Internal server error' });
      }
    });
  });
}

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
  // Count tricks per player
  const tricksPerPlayer = [0, 0, 0, 0];
  for (const trick of game.play.tricks) {
    tricksPerPlayer[trick.winnerIndex]++;
  }
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
  return {
    team1Score,
    team2Score,
    team1Bags,
    team2Bags,
    tricksPerPlayer,
  };
}

// --- Stats and coins update helper ---
async function updateStatsAndCoins(game: Game, winningTeam: number) {
  for (let i = 0; i < 4; i++) {
    const player = game.players[i];
    if (!player || player.type !== 'human') continue;
    const userId = player.id;
    if (!userId) continue; // Skip if no user ID
    const isWinner = (winningTeam === 1 && (i === 0 || i === 2)) || (winningTeam === 2 && (i === 1 || i === 3));
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

  // --- Patch: Recalculate tricks per player from play.tricks ---
  let tricksPerPlayer: number[] = [0, 0, 0, 0];
  if (game.play && Array.isArray(game.play.tricks)) {
    for (const trick of game.play.tricks) {
      if (typeof trick.winnerIndex === 'number' && trick.winnerIndex >= 0 && trick.winnerIndex < 4) {
        tricksPerPlayer[trick.winnerIndex]++;
      }
    }
  }

  return {
    ...game,
    currentPlayer, // Always present for frontend
    players: (game.players || []).map((p: GamePlayer | null, i: number) => {
      if (!p) return null;
      return {
        ...p,
        position: i, // <--- Always include position for seat order
        hand: userId && p.id === userId ? hands[i] || [] : undefined,
        isDealer: dealerIndex !== undefined ? i === dealerIndex : !!p.isDealer,
        tricks: tricksPerPlayer[i], // <--- Always recalculate tricks!
      };
    })
  };
}

export default router; 