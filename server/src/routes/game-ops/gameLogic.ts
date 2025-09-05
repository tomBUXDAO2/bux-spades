import { Router } from 'express';
import type { Game, GamePlayer, Card, Suit, Rank } from '../../types/game';
import { io } from '../../server';
import { games } from '../../gamesStore';
import { trickLogger } from '../../lib/trickLogger';
import prisma from '../../lib/prisma';
import { requireAuth } from '../../middleware/auth.middleware';
import { rateLimit } from '../../middleware/rateLimit.middleware';

const router = Router();

// Helper function to filter out null values
function isNonNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

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
    
    // This rated game will be logged by the game creation logic above
  } else if (!isRated) {
    console.log('[GAME START DEBUG] Unrated game (has bots) - not logging to database. Human players:', humanPlayers);
  }
  
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
  
  game.status = 'PLAYING';
  
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
    console.log('[BOT BIDDING] First bidder is bot, triggering bot bid');
    setTimeout(() => {
      botMakeMove(game, firstBidderIndex);
    }, 1000);
  }

  res.json({ message: 'Game started successfully' });
});

// Join game
router.post('/:id/join', requireAuth, async (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status !== 'WAITING') return res.status(400).json({ error: 'Game already started' });
  
  const userId = (req as any).user.id;
  const username = (req as any).user.username;
  const avatar = (req as any).user.avatar;
  
  // Check if user is already in the game
  const existingPlayerIndex = game.players.findIndex(p => p && p.id === userId);
  if (existingPlayerIndex !== -1) {
    return res.status(400).json({ error: 'Already in game' });
  }
  
  // Find empty seat
  const emptySeatIndex = game.players.findIndex(p => p === null);
  if (emptySeatIndex === -1) {
    return res.status(400).json({ error: 'Game is full' });
  }
  
  // Add player to game
  game.players[emptySeatIndex] = {
    id: userId,
    username,
    avatar,
    type: 'human',
    score: 0,
    bid: 0,
    tricks: 0,
    nil: false,
    blindNil: false
  };
  
  // Emit games updated
  io.emit('games_updated', games);
  io.to(game.id).emit('player_joined', {
    player: game.players[emptySeatIndex],
    seatIndex: emptySeatIndex
  });
  
  res.json({ message: 'Joined game successfully' });
});

// Leave game
router.post('/:id/leave', requireAuth, async (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  
  const userId = (req as any).user.id;
  const playerIndex = game.players.findIndex(p => p && p.id === userId);
  
  if (playerIndex === -1) {
    return res.status(400).json({ error: 'Not in game' });
  }
  
  // Remove player from game
  game.players[playerIndex] = null;
  
  // Emit games updated
  io.emit('games_updated', games);
  io.to(game.id).emit('player_left', {
    playerId: userId,
    seatIndex: playerIndex
  });
  
  res.json({ message: 'Left game successfully' });
});

// Helper functions
export function assignDealer(players: (GamePlayer | null)[], currentDealerIndex: number): number {
  // Find next available player to be dealer
  let nextDealer = (currentDealerIndex + 1) % 4;
  while (players[nextDealer] === null && nextDealer !== currentDealerIndex) {
    nextDealer = (nextDealer + 1) % 4;
  }
  return nextDealer;
}

export function dealCards(players: (GamePlayer | null)[], dealerIndex: number): Card[][] {
  // Create deck
  const suits: Suit[] = ['S', 'H', 'D', 'C'];
  const ranks: Rank[] = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
  const deck: Card[] = [];
  
  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  
  // Shuffle deck
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  
  // Deal cards
  const hands: Card[][] = [[], [], [], []];
  let cardIndex = 0;
  
  for (let round = 0; round < 13; round++) {
    for (let player = 0; player < 4; player++) {
      const playerIndex = (dealerIndex + 1 + player) % 4;
      if (players[playerIndex]) {
        hands[playerIndex].push(deck[cardIndex]);
        cardIndex++;
      }
    }
  }
  
  return hands;
}

export function botMakeMove(game: Game, seatIndex: number) {
  const bot = game.players[seatIndex];
  if (!bot || bot.type !== 'bot') return;
  
  if (game.status === 'PLAYING' && game.bidding) {
    // Bot bidding logic
    setTimeout(() => {
      if (!game.bidding || !game.bidding.bids) return;
      
      const currentBidderIndex = game.bidding.currentBidderIndex;
      if (currentBidderIndex === seatIndex && game.bidding.bids[seatIndex] === null) {
        // Simple bot bidding - random bid between 0 and 4
        const bid = Math.floor(Math.random() * 5);
        game.bidding.bids[seatIndex] = bid;
        
        // Find next player who hasn't bid
        let next = (seatIndex + 1) % 4;
        while (game.bidding.bids[next] !== null && next !== seatIndex) {
          next = (next + 1) % 4;
        }
        
        if (game.bidding.bids.every(b => b !== null)) {
          // All bids in, move to play phase
          // This logic would be handled by the main game flow
        } else {
          game.bidding.currentBidderIndex = next;
          game.bidding.currentPlayer = game.players[next]?.id ?? '';
          io.to(game.id).emit('bidding_update', {
            currentBidderIndex: next,
            bids: game.bidding.bids,
          });
          
          // If next is a bot, trigger their move
          if (game.players[next] && game.players[next].type === 'bot') {
            botMakeMove(game, next);
          }
        }
      }
    }, 600);
  }
}

export function botPlayCard(game: Game, seatIndex: number) {
  const bot = game.players[seatIndex];
  if (!bot || bot.type !== 'bot') return;
  
  if (game.status === 'PLAYING' && game.play && game.hands) {
    // Bot card playing logic
    setTimeout(() => {
      if (!game.play || !game.hands) return;
      
      const currentPlayerIndex = game.play.currentPlayerIndex;
      if (currentPlayerIndex === seatIndex) {
        const hand = game.hands[seatIndex];
        if (hand && hand.length > 0) {
          // Simple bot logic - play first card
          const card = hand[0];
          game.play.currentTrick.push({
            card,
            playerIndex: seatIndex,
            playerId: bot.id
          });
          
          // Remove card from hand
          hand.splice(0, 1);
          
          // Move to next player
          const nextPlayerIndex = (seatIndex + 1) % 4;
          game.play.currentPlayerIndex = nextPlayerIndex;
          game.play.currentPlayer = game.players[nextPlayerIndex]?.id ?? '';
          
          // Emit card played
          io.to(game.id).emit('card_played', {
            card,
            playerIndex: seatIndex,
            playerId: bot.id,
            currentTrick: game.play.currentTrick
          });
          
          // Check if trick is complete
          if (game.play.currentTrick.length === 4) {
            // Trick complete logic would be handled by main game flow
          } else {
            // If next player is bot, trigger their move
            if (game.players[nextPlayerIndex] && game.players[nextPlayerIndex].type === 'bot') {
              botPlayCard(game, nextPlayerIndex);
            }
          }
        }
      }
    }, 1000);
  }
}

export function determineTrickWinner(trick: any[], trickNumber: number): number {
  // Simple trick winner determination
  // This would need to be implemented based on spades rules
  return 0; // Placeholder
}

export function calculateSoloHandScore(game: Game): number[] {
  // Simple hand score calculation
  // This would need to be implemented based on spades rules
  return [0, 0, 0, 0]; // Placeholder
}

export default router;
