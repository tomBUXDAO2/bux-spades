import redisGameState from './RedisGameStateService.js';
import { GameService } from './GameService.js';

/**
 * FAST GAME STATE SERVICE
 * Always uses Redis cache first, falls back to database only when necessary
 */
export class FastGameStateService {
  /**
   * Get game state - Redis first, database fallback
   * @param {string} gameId
   * @param {boolean} useCache - Whether to use cache (default: true)
   * @returns {Promise<object|null>}
   */
  static async getGameState(gameId, useCache = true) {
    if (useCache) {
      // Try Redis cache first
      const cached = await redisGameState.getGameState(gameId);
      if (cached) {
        return cached;
      }
    }
    
    // Fallback to database
    const gameState = await GameService.getGameStateForClient(gameId);
    if (gameState) {
      // Cache the result for next time
      await redisGameState.setGameState(gameId, gameState);
    }
    return gameState;
  }

  /**
   * Update game state in Redis cache
   * @param {string} gameId
   * @param {object} updates - Partial updates to apply
   */
  static async updateGameState(gameId, updates) {
    let current = await redisGameState.getGameState(gameId);
    if (!current) {
      // If no cached state, get from database first
      current = await GameService.getGameStateForClient(gameId);
      if (!current) {
        console.warn(`[FAST GAME STATE] No state found for game ${gameId}`);
        return;
      }
    }
    
    // Apply updates
    const updated = { ...current, ...updates };
    await redisGameState.setGameState(gameId, updated);
    return updated;
  }

  /**
   * Update current player in cache
   * @param {string} gameId
   * @param {string} currentPlayerId
   */
  static async updateCurrentPlayer(gameId, currentPlayerId) {
    return await this.updateGameState(gameId, { currentPlayer: currentPlayerId });
  }

  /**
   * Update game status in cache
   * @param {string} gameId
   * @param {string} status
   */
  static async updateGameStatus(gameId, status) {
    return await this.updateGameState(gameId, { status });
  }

  /**
   * Update current trick in cache
   * @param {string} gameId
   * @param {number} currentTrick
   */
  static async updateCurrentTrick(gameId, currentTrick) {
    return await this.updateGameState(gameId, { currentTrick });
  }

  /**
   * Update player hands in cache
   * @param {string} gameId
   * @param {Array} hands
   */
  static async updatePlayerHands(gameId, hands) {
    await redisGameState.setPlayerHands(gameId, hands);
    return await this.updateGameState(gameId, { hands, playerHands: hands });
  }

  /**
   * Update player bids in cache
   * @param {string} gameId
   * @param {Array} bids
   */
  static async updatePlayerBids(gameId, bids) {
    await redisGameState.setPlayerBids(gameId, bids);
    return await this.updateGameState(gameId, { 
      bidding: { 
        bids, 
        currentBidderIndex: 0, 
        currentPlayer: null 
      },
      playerBids: bids 
    });
  }

  /**
   * Clear game state from cache (when game ends)
   * @param {string} gameId
   */
  static async clearGameState(gameId) {
    await redisGameState.clearGameState(gameId);
    await redisGameState.clearPlayerHands(gameId);
    await redisGameState.clearPlayerBids(gameId);
  }
}
