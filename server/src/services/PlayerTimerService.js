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
      console.error('[PLAYER TIMER] ❌ Socket.IO not initialized');
      return;
    }

    console.log(`[PLAYER TIMER] 🕐 STARTING TIMER for player ${playerId} (seat ${playerIndex}) in ${phase} phase`);

    // Clear any existing timer for this game
    this.clearTimer(gameId);

    // Phase 1: 10 second grace period (no visual)
    const graceTimeout = setTimeout(() => {
      console.log(`[PLAYER TIMER] ⏰ Grace period ended, starting countdown for player ${playerId}`);
      
      // Emit countdown_start to show visual timer
      this.io.to(gameId).emit('countdown_start', {
        playerId,
        playerIndex,
        timeLeft: 10
      });
    }, 10000);

    // Phase 2: Auto-action after 20 seconds total
    const actionTimeout = setTimeout(async () => {
      console.log(`[PLAYER TIMER] ⏰ TIMER EXPIRED for player ${playerId}, triggering auto-action`);
      await this.handleTimeout(gameId, playerId, phase);
    }, 20000);

    this.activeTimers.set(gameId, {
      graceTimeout,
      actionTimeout,
      playerId,
      phase
    });
    
    console.log(`[PLAYER TIMER] ✅ Timer set successfully for player ${playerId} - will trigger in 20 seconds`);
    console.log(`[PLAYER TIMER] Active timers count: ${this.activeTimers.size}`);
    console.log(`[PLAYER TIMER] Current active timers:`, Array.from(this.activeTimers.keys()));
  }

  /**
   * Force immediate timeout (used when player disconnects while on turn)
   */
  forceTimeout(gameId, playerId, playerIndex, phase) {
    if (!this.io) {
      console.error('[PLAYER TIMER] ❌ Socket.IO not initialized, cannot force timeout');
      return;
    }

    console.log(`[PLAYER TIMER] ⚡ Forcing immediate timeout for player ${playerId} (seat ${playerIndex}) in ${phase} phase`);
    this.clearTimer(gameId);
    this.activeTimers.set(gameId, {
      graceTimeout: null,
      actionTimeout: null,
      playerId,
      phase
    });

    this.handleTimeout(gameId, playerId, phase, { skipPresenceTracking: true })
      .catch(error => {
        console.error('[PLAYER TIMER] ❌ Error during forced timeout:', error);
        this.clearTimer(gameId);
      });
  }

  /**
   * Handle timer expiration - trigger auto-action
   * @param {{ skipPresenceTracking?: boolean }} options - set for forced timeout (disconnect path uses normal timer)
   */
  async handleTimeout(gameId, playerId, phase, options = {}) {
    const { skipPresenceTracking = false } = options;
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

      if (!skipPresenceTracking) {
        const { gamePresenceService } = await import('./GamePresenceService.js');
        const { newlyAway } = await gamePresenceService.recordTimeout(gameId, playerId);
        if (newlyAway && this.io) {
          const awayUserIds = await gamePresenceService.getAwayUserIds(gameId);
          this.io.to(gameId).emit('game_presence_update', { gameId, awayUserIds });
        }
      }

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
   * Autoplay immediately (AWAY humans) without incrementing timeout streak.
   */
  async runAutoActionImmediate(gameId, playerId, phase) {
    try {
      const game = await GameService.getGame(gameId);
      if (!game) {
        this.clearTimer(gameId);
        return;
      }
      if (game.currentPlayer !== playerId) {
        this.clearTimer(gameId);
        return;
      }
      if (phase === 'bidding') {
        await this.autoBid(game, playerId);
      } else if (phase === 'playing') {
        await this.autoPlay(game, playerId);
      }
      this.clearTimer(gameId);
    } catch (error) {
      console.error('[PLAYER TIMER] ❌ runAutoActionImmediate error:', error);
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

      // Use simple bot logic for timeout bidding
      const hands = await redisGameState.getPlayerHands(game.id);
      if (!hands || !hands[seatIndex]) {
        console.error(`[PLAYER TIMER] ❌ No hand found for player at seat ${seatIndex}`);
        return;
      }

      const hand = hands[seatIndex];
      // Handle forced variants first
      const forcedBid = game.gimmickVariant || game.formatForced;
      let botBid;
      if (forcedBid === 'BIDHEARTS' || forcedBid === 'BID HEARTS') {
        const numHearts = hand.filter(card => card.suit === 'HEARTS' || card.suit === 'H' || card.suit === '♥').length;
        botBid = numHearts;
      } else if (forcedBid === 'BID3' || forcedBid === 'BID 3') {
        botBid = 3;
      } else if (forcedBid === 'BID4NIL' || forcedBid === '4 OR NIL') {
        botBid = 4; // default to 4 (server accepts 0 or 4)
      } else if (forcedBid === 'CRAZY ACES' || forcedBid === 'CRAZY_ACES') {
        const numAces = hand.filter(card => card.rank === 'A').length;
        botBid = numAces * 3;
      } else {
        const numSpades = hand.filter(card => card.suit === 'SPADES').length;
        botBid = numSpades > 0 ? numSpades : 2;
      }
      
      console.log(`[PLAYER TIMER] 🎯 Auto-bid calculated: ${botBid} for player ${player.username || player.user?.username}`);

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

      // Use the same bot logic that already works for both bots and humans
      const botService = new BotService();
      const card = await botService.selectCardForAutoPlay(game, seatIndex);
      
      if (!card) {
        console.error(`[PLAYER TIMER] ❌ Auto-play logic returned no card for player at seat ${seatIndex}`);
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
      console.log(`[PLAYER TIMER] 🗑️ CLEARING TIMER for game ${gameId} - player ${timers.playerId}, phase ${timers.phase}`);
      clearTimeout(timers.graceTimeout);
      clearTimeout(timers.actionTimeout);
      this.activeTimers.delete(gameId);
    } else {
      console.log(`[PLAYER TIMER] No timer found to clear for game ${gameId}`);
    }
  }

  /**
   * Clear timer only if it's set for the specified player
   */
  clearTimerForPlayer(gameId, playerId) {
    const timers = this.activeTimers.get(gameId);
    if (timers && timers.playerId === playerId) {
      console.log(`[PLAYER TIMER] 🗑️ CLEARING TIMER for game ${gameId} (player ${playerId}) due to reconnection`);
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

