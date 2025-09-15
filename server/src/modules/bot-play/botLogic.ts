import type { Game, GamePlayer, Card, Suit, Rank } from '../../types/game';
import { io } from '../../index';
import { enrichGameForClient } from '../../routes/games/shared/gameUtils';

/**
 * Main bot move handler - determines if bot should bid or play card
 */
export function botMakeMove(game: Game, seatIndex: number): void {
  const bot = game.players[seatIndex];
  console.log('[BOT DEBUG] botMakeMove called for seat', seatIndex, 'bot:', bot && bot.username, 'game.status:', game.status);
  
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
    setTimeout(async () => {
      if (!game.bidding || !game.bidding.bids) return;
      
      console.log('[BOT DEBUG] Bot', bot.username, 'is making a bid...');
      
      // Calculate bid based on game type
      let bid = 1;
      if (game.rules && game.hands && game.hands[seatIndex]) {
        bid = calculateBotBid(game.hands[seatIndex], game, seatIndex);
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
        handleBiddingComplete(game);
        return;
      } else {
        // Continue bidding
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
    }, 600);
  } else {
    console.log('[BOT DEBUG] Conditions not met for bot to bid. Status:', game.status, 'currentBidderIndex:', game.bidding?.currentBidderIndex, 'seatIndex:', seatIndex);
  }
}

/**
 * Handles bot card playing during the play phase
 */
export function botPlayCard(game: Game, seatIndex: number): void {
  const bot = game.players[seatIndex];
  if (!bot || !game.play || !game.hands || !game.hands[seatIndex]) {
    console.log('[BOT DEBUG] Cannot play card - missing data');
    return;
  }
  
  console.log('[BOT DEBUG] Bot', bot.username, 'is playing a card...');
  
  setTimeout(() => {
    const hand = game.hands[seatIndex];
    const currentTrick = game.play.currentTrick || [];
    
    // Select best card to play
    const cardToPlay = selectBestCard(hand, currentTrick, game, seatIndex);
    
    if (cardToPlay) {
      // Remove card from hand
      const cardIndex = hand.findIndex(c => c.suit === cardToPlay.suit && c.rank === cardToPlay.rank);
      if (cardIndex !== -1) {
        hand.splice(cardIndex, 1);
      }
      
      // Add to current trick
      game.play.currentTrick.push(cardToPlay);
      
      console.log('[BOT DEBUG] Bot', bot.username, 'played', cardToPlay.suit, cardToPlay.rank);
      
      // Emit card played event
      io.to(game.id).emit('card_played', {
        gameId: game.id,
        playerId: bot.id,
        card: cardToPlay,
        trickNumber: game.play.trickNumber
      });
      
      // Check if trick is complete
      if (game.play.currentTrick.length === 4) {
        handleTrickComplete(game);
      } else {
        // Move to next player
        const nextPlayerIndex = (seatIndex + 1) % 4;
        game.play.currentPlayerIndex = nextPlayerIndex;
        game.play.currentPlayer = game.players[nextPlayerIndex]?.id ?? '';
        
        io.to(game.id).emit('game_update', enrichGameForClient(game));
        
        // If next player is bot, trigger their move
        if (game.players[nextPlayerIndex] && game.players[nextPlayerIndex].type === 'bot') {
          botPlayCard(game, nextPlayerIndex);
        }
      }
    }
  }, 500);
}

/**
 * Calculates bot bid based on hand and game rules
 */
function calculateBotBid(hand: Card[], game: Game, seatIndex: number): number {
  // Basic bidding logic - can be enhanced
  const spades = hand.filter(c => c.suit === 'SPADES').length;
  const highCards = hand.filter(c => getCardValue(c.rank) >= 10).length;
  
  let bid = Math.max(1, Math.min(13, spades + Math.floor(highCards / 2)));
  
  // Adjust based on game rules
  if (game.rules?.bidType === 'MIRROR') {
    bid = spades; // Mirror: bid number of spades
  } else if (game.forcedBid === 'BID 3') {
    bid = 3; // Must bid 3
  } else if (game.forcedBid === 'BID HEARTS') {
    bid = hand.filter(c => c.suit === 'HEARTS').length; // Bid number of hearts
  }
  
  return bid;
}

/**
 * Selects the best card for bot to play
 */
function selectBestCard(hand: Card[], currentTrick: Card[], game: Game, seatIndex: number): Card | null {
  if (hand.length === 0) return null;
  
  // If no cards played yet, play lowest card
  if (currentTrick.length === 0) {
    return hand.reduce((lowest, card) => 
      getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
    );
  }
  
  // Follow suit if possible
  const leadSuit = currentTrick[0].suit;
  const followSuitCards = hand.filter(c => c.suit === leadSuit);
  
  if (followSuitCards.length > 0) {
    // Play lowest card of lead suit
    return followSuitCards.reduce((lowest, card) => 
      getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
    );
  }
  
  // Can't follow suit, play lowest card
  return hand.reduce((lowest, card) => 
    getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
  );
}

/**
 * Gets numeric value of card rank
 */
function getCardValue(rank: Rank): number {
  const values: { [key in Rank]: number } = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return values[rank];
}

/**
 * Handles bidding completion and transition to play phase
 */
function handleBiddingComplete(game: Game): void {
  if (typeof game.dealerIndex !== 'number') {
    io.to(game.id).emit('error', { message: 'Invalid game state: no dealer assigned' });
    return;
  }
  
  const firstPlayer = game.players[(game.dealerIndex + 1) % 4];
  if (!firstPlayer) {
    io.to(game.id).emit('error', { message: 'Invalid game state' });
    return;
  }
  
  // Update game status
  game.status = 'PLAYING';
  game.play = {
    currentPlayer: firstPlayer.id ?? '',
    currentPlayerIndex: (game.dealerIndex + 1) % 4,
    currentTrick: [],
    tricks: [],
    trickNumber: 0,
    spadesBroken: false
  };
  
  console.log('[BIDDING COMPLETE - BOT] Moving to play phase, first player:', firstPlayer.username);
  
  // Emit events
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
    setTimeout(() => {
      botPlayCard(game, (game.dealerIndex + 1) % 4);
    }, 500);
  }
}

/**
 * Handles trick completion
 */
function handleTrickComplete(game: Game): void {
  // This would be implemented with the trick completion logic
  console.log('[BOT DEBUG] Trick complete, determining winner...');
  // Implementation would go here
}
