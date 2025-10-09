import { GameService } from './GameService.js';
import { BotService } from './BotService.js';
import redisGameState from './RedisGameStateService.js';

/**
 * Service for managing turn timers for human players
 * - Starts a timer when it's a human player's turn
 * - Shows countdown overlay after 10 seconds
 * - Auto-plays after 20 seconds total
 */
class TurnTimerService {
  constructor() {
    this.activeTimers = new Map(); // gameId -> { timeout, countdownTimeout, playerId }
  }

  /**
   * Start turn timer for a human player
   * @param {Object} io - Socket.IO instance
   * @param {string} gameId - Game ID
   * @param {string} playerId - Player user ID
   * @param {number} playerIndex - Player seat index
   * @param {string} phase - 'BIDDING' or 'PLAYING'
   */
  async startTimer(io, gameId, playerId, playerIndex, phase) {
    try {
      // Clear any existing timer for this game
      this.clearTimer(gameId);

      console.log(`[TURN TIMER] Starting ${phase} timer for player ${playerId} (seat ${playerIndex}) in game ${gameId}`);

      // Start countdown overlay after 10 seconds
      const countdownTimeout = setTimeout(() => {
        console.log(`[TURN TIMER] Starting countdown overlay for player ${playerId}`);
        io.to(gameId).emit('countdown_start', {
          playerId,
          playerIndex,
          timeLeft: 10 // 10 second countdown
        });
      }, 10 * 1000); // 10 seconds

      // Auto-play after 20 seconds total
      const autoPlayTimeout = setTimeout(async () => {
        console.log(`[TURN TIMER] Time expired for player ${playerId}, auto-playing`);
        
        try {
          if (phase === 'BIDDING') {
            await this.autoPlayBid(io, gameId, playerId, playerIndex);
          } else if (phase === 'PLAYING') {
            await this.autoPlayCard(io, gameId, playerId, playerIndex);
          }
        } catch (error) {
          console.error(`[TURN TIMER] Error auto-playing for player ${playerId}:`, error);
        }
        
        this.clearTimer(gameId);
      }, 20 * 1000); // 20 seconds total

      // Store timer references
      this.activeTimers.set(gameId, {
        countdownTimeout,
        autoPlayTimeout,
        playerId,
        playerIndex,
        phase
      });

    } catch (error) {
      console.error('[TURN TIMER] Error starting timer:', error);
    }
  }

  /**
   * Clear timer for a game
   */
  clearTimer(gameId) {
    const timer = this.activeTimers.get(gameId);
    if (timer) {
      clearTimeout(timer.countdownTimeout);
      clearTimeout(timer.autoPlayTimeout);
      this.activeTimers.delete(gameId);
      console.log(`[TURN TIMER] Cleared timer for game ${gameId}`);
    }
  }

  /**
   * Auto-play a bid for a player
   */
  async autoPlayBid(io, gameId, playerId, playerIndex) {
    try {
      console.log(`[TURN TIMER] Auto-bidding for player ${playerId} (seat ${playerIndex})`);
      
      // Get player's hand from Redis
      const hands = await redisGameState.getPlayerHands(gameId);
      if (!hands || !hands[playerIndex]) {
        console.error(`[TURN TIMER] No hand found for player at seat ${playerIndex}`);
        return;
      }

      const hand = hands[playerIndex];
      
      // Simple auto-bid: count spades and bid that number (safe bid)
      const spadeCount = hand.filter(card => card.suit === 'SPADES').length;
      const autoBid = Math.max(1, Math.min(spadeCount, 13)); // Bid between 1-13

      console.log(`[TURN TIMER] Auto-bid calculated: ${autoBid} (${spadeCount} spades in hand)`);

      // Import and use BiddingHandler to process the bid
      const { BiddingHandler } = await import('../modules/socket-handlers/bidding/biddingHandler.js');
      const biddingHandler = new BiddingHandler(io, null);
      
      // Call processBid directly (no socket needed)
      await biddingHandler.processBid(gameId, playerId, autoBid, false, false);

      console.log(`[TURN TIMER] Auto-bid ${autoBid} processed for player ${playerId}`);

    } catch (error) {
      console.error('[TURN TIMER] Error auto-playing bid:', error);
    }
  }

  /**
   * Auto-play a card for a player
   */
  async autoPlayCard(io, gameId, playerId, playerIndex) {
    try {
      console.log(`[TURN TIMER] Auto-playing card for player ${playerId} (seat ${playerIndex})`);
      
      // Get player's hand from Redis
      const hands = await redisGameState.getPlayerHands(gameId);
      if (!hands || !hands[playerIndex]) {
        console.error(`[TURN TIMER] No hand found for player at seat ${playerIndex}`);
        return;
      }

      const hand = hands[playerIndex];
      if (hand.length === 0) {
        console.error(`[TURN TIMER] Player has no cards in hand`);
        return;
      }

      // Get current trick to determine if following suit
      const currentTrick = await redisGameState.getCurrentTrick(gameId);
      const gameState = await GameService.getGameStateForClient(gameId);
      
      let cardToPlay;
      
      if (currentTrick && currentTrick.length > 0) {
        // Following suit - play lowest card of lead suit, or lowest card if void
        const leadSuit = currentTrick[0].suit;
        const suitCards = hand.filter(card => card.suit === leadSuit);
        
        if (suitCards.length > 0) {
          // Play lowest card of lead suit
          cardToPlay = suitCards.sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank))[0];
        } else {
          // Void in lead suit - play lowest card overall
          cardToPlay = hand.sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank))[0];
        }
      } else {
        // Leading - play lowest non-spade if possible (unless spades broken or only have spades)
        const spadesBroken = gameState?.play?.spadesBroken || false;
        const nonSpades = hand.filter(card => card.suit !== 'SPADES');
        
        if (nonSpades.length > 0) {
          cardToPlay = nonSpades.sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank))[0];
        } else {
          // Only have spades or spades are broken
          cardToPlay = hand.sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank))[0];
        }
      }

      console.log(`[TURN TIMER] Auto-playing card: ${cardToPlay.suit} ${cardToPlay.rank}`);

      // Import and use CardPlayHandler to process the card
      const { CardPlayHandler } = await import('../modules/socket-handlers/card-play/cardPlayHandler.js');
      const cardPlayHandler = new CardPlayHandler(io, null);
      
      await cardPlayHandler.processCardPlay(gameId, playerId, cardToPlay, false);

      console.log(`[TURN TIMER] Auto-played ${cardToPlay.suit} ${cardToPlay.rank} for player ${playerId}`);

    } catch (error) {
      console.error('[TURN TIMER] Error auto-playing card:', error);
    }
  }

  /**
   * Get card value for sorting (2=2, 3=3, ..., J=11, Q=12, K=13, A=14)
   */
  getCardValue(rank) {
    const values = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
      'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };
    return values[rank] || 0;
  }

  /**
   * Clear all timers (for cleanup)
   */
  clearAllTimers() {
    for (const [gameId, timer] of this.activeTimers.entries()) {
      clearTimeout(timer.countdownTimeout);
      clearTimeout(timer.autoPlayTimeout);
    }
    this.activeTimers.clear();
    console.log('[TURN TIMER] Cleared all timers');
  }
}

export default new TurnTimerService();

