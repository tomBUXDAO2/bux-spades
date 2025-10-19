import { GameService } from './GameService.js';
import redisGameState from './RedisGameStateService.js';
import { BotService } from './BotService.js';

/**
 * Service to manage turn timers for human players
 * - 10 second grace period (no visual)
 * - 10 second countdown (visual timer on avatar)
 * - Auto-action after 20 seconds total
 */
class PlayerTimerService {
  constructor() {
    this.io = null;
    this.activeTimers = new Map(); // gameId -> { graceTimeout, actionTimeout, playerId, phase }
  }

  /**
   * Set the Socket.IO instance
   */
  setIO(io) {
    this.io = io;
  }

  /**
   * Start timer for current player
   * @param {string} gameId - Game ID
   * @param {string} playerId - Player user ID
   * @param {number} playerIndex - Player seat index
   * @param {string} phase - 'bidding' or 'playing'
   */
  startPlayerTimer(gameId, playerId, playerIndex, phase) {
    if (!this.io) {
      console.error('[PLAYER TIMER] Socket.IO not initialized');
      return;
    }

    console.log(`[PLAYER TIMER] Starting timer for player ${playerId} (seat ${playerIndex}) in ${phase} phase`);

    // Clear any existing timer for this game
    this.clearTimer(gameId);

    // Phase 1: 10 second grace period (no visual)
    const graceTimeout = setTimeout(() => {
      console.log(`[PLAYER TIMER] Grace period ended, starting countdown for player ${playerId}`);
      
      // Emit countdown_start to show visual timer
      this.io.to(gameId).emit('countdown_start', {
        playerId,
        playerIndex,
        timeLeft: 10
      });
    }, 10000);

    // Phase 2: Auto-action after 20 seconds total
    const actionTimeout = setTimeout(async () => {
      console.log(`[PLAYER TIMER] Timer expired for player ${playerId}, triggering auto-action`);
      await this.handleTimeout(gameId, playerId, phase);
    }, 20000);

    this.activeTimers.set(gameId, {
      graceTimeout,
      actionTimeout,
      playerId,
      phase
    });
  }

  /**
   * Handle timer expiration - trigger auto-action
   */
  async handleTimeout(gameId, playerId, phase) {
    try {
      console.log(`[PLAYER TIMER] ⏰ TIMEOUT TRIGGERED for game ${gameId}, player ${playerId}, phase ${phase}`);

      // Get game state
      const game = await GameService.getGame(gameId);
      if (!game) {
        console.log(`[PLAYER TIMER] ❌ Game ${gameId} not found`);
        this.clearTimer(gameId);
        return;
      }

      // Verify player is still current player
      if (game.currentPlayer !== playerId) {
        console.log(`[PLAYER TIMER] ❌ Player ${playerId} is no longer current player (current: ${game.currentPlayer}), canceling auto-action`);
        this.clearTimer(gameId);
        return;
      }

      console.log(`[PLAYER TIMER] ✅ Player ${playerId} is still current player, proceeding with auto-action`);

      // Trigger auto-action based on phase
      if (phase === 'bidding') {
        console.log(`[PLAYER TIMER] 🎯 Triggering auto-bid for player ${playerId}`);
        await this.autoBid(game, playerId);
      } else if (phase === 'playing') {
        console.log(`[PLAYER TIMER] 🃏 Triggering auto-play for player ${playerId}`);
        await this.autoPlay(game, playerId);
      } else {
        console.error(`[PLAYER TIMER] ❌ Unknown phase: ${phase}`);
      }

      this.clearTimer(gameId);
      console.log(`[PLAYER TIMER] ✅ Auto-action completed for player ${playerId}`);
    } catch (error) {
      console.error('[PLAYER TIMER] ❌ Error handling timeout:', error);
      this.clearTimer(gameId);
    }
  }

  /**
   * Auto-bid for player using bot logic
   */
  async autoBid(game, playerId) {
    try {
      console.log(`[PLAYER TIMER] 🎯 AUTO-BID STARTING for player ${playerId}`);

      const player = game.players.find(p => p.userId === playerId);
      if (!player) {
        console.error(`[PLAYER TIMER] ❌ Player ${playerId} not found in game`);
        return;
      }

      const seatIndex = player.seatIndex;
      console.log(`[PLAYER TIMER] Player found at seat ${seatIndex}:`, player.username || player.user?.username);

      // Get player's hand from Redis
      const hands = await redisGameState.getPlayerHands(game.id);
      if (!hands || !hands[seatIndex]) {
        console.error(`[PLAYER TIMER] ❌ No hand found for player at seat ${seatIndex}`);
        return;
      }

      const hand = hands[seatIndex];
      console.log(`[PLAYER TIMER] Player hand for bidding:`, hand);
      const numSpades = hand.filter(card => card.suit === 'SPADES').length;

      // Use simple bot logic for timeout bidding
      const botBid = numSpades > 0 ? numSpades : 2;
      
      console.log(`[PLAYER TIMER] 🎯 Auto-bid calculated: ${botBid} for player ${player.username || player.user?.username} (${numSpades} spades)`);

      // Import BiddingHandler dynamically to avoid circular dependency
      const { BiddingHandler } = await import('../modules/socket-handlers/bidding/biddingHandler.js');
      const biddingHandler = new BiddingHandler(this.io, null);
      
      console.log(`[PLAYER TIMER] 🎯 Calling processBid with bid: ${botBid}`);
      // Process bid (this will advance to next player)
      await biddingHandler.processBid(game.id, playerId, botBid, botBid === 0, false);
      console.log(`[PLAYER TIMER] ✅ processBid completed successfully`);

      console.log(`[PLAYER TIMER] ✅ Auto-bid completed for player ${playerId}`);
    } catch (error) {
      console.error('[PLAYER TIMER] ❌ Error in autoBid:', error);
    }
  }

  /**
   * Auto-play card for player using bot logic
   */
  async autoPlay(game, playerId) {
    try {
      console.log(`[PLAYER TIMER] 🃏 AUTO-PLAY STARTING for player ${playerId}`);

      const player = game.players.find(p => p.userId === playerId);
      if (!player) {
        console.error(`[PLAYER TIMER] ❌ Player ${playerId} not found in game`);
        return;
      }

      const seatIndex = player.seatIndex;
      console.log(`[PLAYER TIMER] Player found at seat ${seatIndex}:`, player.username || player.user?.username);

      // Get player's hand from Redis
      const hands = await redisGameState.getPlayerHands(game.id);
      if (!hands || !hands[seatIndex]) {
        console.error(`[PLAYER TIMER] ❌ No hand found for player at seat ${seatIndex}`);
        return;
      }

      const hand = hands[seatIndex];
      console.log(`[PLAYER TIMER] Player hand:`, hand);

      // Use simple card selection logic for timeout
      // Play the first valid card (simple logic)
      const card = hand[0];
      if (!card) {
        console.error(`[PLAYER TIMER] ❌ No cards available for player at seat ${seatIndex}`);
        return;
      }

      console.log(`[PLAYER TIMER] 🃏 Auto-play calculated: ${card.rank}${card.suit} for player ${player.username || player.user?.username}`);

      // Import CardPlayHandler dynamically to avoid circular dependency
      const { CardPlayHandler } = await import('../modules/socket-handlers/card-play/cardPlayHandler.js');
      const cardPlayHandler = new CardPlayHandler(this.io, null);
      
      console.log(`[PLAYER TIMER] 🃏 Calling processCardPlay with card:`, card);
      // Process card play (this will advance to next player)
      await cardPlayHandler.processCardPlay(game.id, playerId, card, false);
      console.log(`[PLAYER TIMER] ✅ processCardPlay completed successfully`);

      console.log(`[PLAYER TIMER] ✅ Auto-play completed for player ${playerId}`);
    } catch (error) {
      console.error('[PLAYER TIMER] ❌ Error in autoPlay:', error);
    }
  }

  /**
   * Clear timer for a game
   */
  clearTimer(gameId) {
    const timers = this.activeTimers.get(gameId);
    if (timers) {
      console.log(`[PLAYER TIMER] Clearing timer for game ${gameId}`);
      clearTimeout(timers.graceTimeout);
      clearTimeout(timers.actionTimeout);
      this.activeTimers.delete(gameId);
    }
  }

  /**
   * Clear all timers (for cleanup)
   */
  clearAllTimers() {
    console.log(`[PLAYER TIMER] Clearing all timers (${this.activeTimers.size} active)`);
    for (const [gameId, timers] of this.activeTimers.entries()) {
      clearTimeout(timers.graceTimeout);
      clearTimeout(timers.actionTimeout);
    }
    this.activeTimers.clear();
  }
}

// Export singleton instance
export const playerTimerService = new PlayerTimerService();

