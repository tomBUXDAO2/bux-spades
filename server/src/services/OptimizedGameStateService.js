import { prisma } from '../config/database.js';
import redisGameState from './RedisGameStateService.js';
import { GameService } from './GameService.js';

/**
 * OPTIMIZED GAME STATE SERVICE
 * Implements incremental updates and smart caching to prevent performance degradation
 */
export class OptimizedGameStateService {
  // Cache for expensive query results
  static queryCache = new Map();
  static CACHE_TTL = 30000; // 30 seconds

  /**
   * Get game state with smart caching and incremental updates
   */
  static async getGameState(gameId, useCache = true) {
    try {
      if (useCache) {
        const cached = await redisGameState.getGameState(gameId);
        if (cached && this.isCacheValid(cached)) {
          console.log(`[OPTIMIZED GAME STATE] Using cached state for game ${gameId}`);
          return cached;
        }
      }

      console.log(`[OPTIMIZED GAME STATE] Building fresh state for game ${gameId}`);
      return await this.buildOptimizedGameState(gameId);
    } catch (error) {
      console.error('[OPTIMIZED GAME STATE] Error getting game state:', error);
      throw error;
    }
  }

  /**
   * Update game state incrementally instead of full rebuild
   */
  static async updateGameStateIncrementally(gameId, updates) {
    try {
      const current = await redisGameState.getGameState(gameId);
      if (!current) {
        console.log(`[OPTIMIZED GAME STATE] No cached state found, building fresh state for game ${gameId}`);
        return await this.buildOptimizedGameState(gameId);
      }

      const updated = { ...current, ...updates };
      await redisGameState.setGameState(gameId, updated);
      console.log(`[OPTIMIZED GAME STATE] Updated game state incrementally for game ${gameId}`);
      return updated;
    } catch (error) {
      console.error('[OPTIMIZED GAME STATE] Error updating game state incrementally:', error);
      throw error;
    }
  }

  /**
   * Build optimized game state with minimal queries
   */
  static async buildOptimizedGameState(gameId) {
    const cacheKey = `game_state_${gameId}`;
    const cached = this.queryCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log(`[OPTIMIZED GAME STATE] Using query cache for game ${gameId}`);
      return cached.data;
    }

    // Use optimized single query instead of multiple queries
    const gameState = await this.getGameStateOptimized(gameId);
    
    // Cache the result
    this.queryCache.set(cacheKey, { data: gameState, timestamp: Date.now() });
    
    // Also cache in Redis
    await redisGameState.setGameState(gameId, gameState);
    
    return gameState;
  }

  /**
   * Get game state with optimized single query
   */
  static async getGameStateOptimized(gameId) {
    try {
      // CRITICAL: Use GameService.getGameStateForClient to ensure proper formatting
      // This ensures player data is properly formatted with usernames and avatars
      return await GameService.getGameStateForClient(gameId);
    } catch (error) {
      console.error('[OPTIMIZED GAME STATE] Error in optimized query:', error);
      throw error;
    }
  }

  /**
   * Get current round data only (for active games)
   */
  static async getCurrentRoundData(gameId) {
    try {
      const currentRound = await prisma.round.findFirst({
        where: { gameId },
        orderBy: { roundNumber: 'desc' },
        include: {
          tricks: {
            include: {
              cards: {
                orderBy: { playOrder: 'asc' }
              }
            },
            orderBy: { trickNumber: 'asc' }
          },
          playerStats: true,
          RoundScore: true
        }
      });

      return currentRound;
    } catch (error) {
      console.error('[OPTIMIZED GAME STATE] Error getting current round data:', error);
      throw error;
    }
  }

  /**
   * Check if cached data is still valid
   */
  static isCacheValid(cachedData) {
    if (!cachedData || !cachedData.timestamp) {
      return false;
    }

    const age = Date.now() - cachedData.timestamp;
    return age < this.CACHE_TTL;
  }

  /**
   * Clear cache for a specific game
   */
  static clearGameCache(gameId) {
    const cacheKey = `game_state_${gameId}`;
    this.queryCache.delete(cacheKey);
    console.log(`[OPTIMIZED GAME STATE] Cleared cache for game ${gameId}`);
  }

  /**
   * Clear all caches
   */
  static clearAllCaches() {
    this.queryCache.clear();
    console.log('[OPTIMIZED GAME STATE] Cleared all caches');
  }

  /**
   * Update trick completion incrementally
   */
  static async updateTrickCompletion(gameId, trickData) {
    try {
      const current = await redisGameState.getGameState(gameId);
      if (!current) {
        return await this.buildOptimizedGameState(gameId);
      }

      // Update only the specific trick data
      const updated = {
        ...current,
        play: {
          ...current.play,
          currentTrick: trickData.currentTrick || [],
          spadesBroken: trickData.spadesBroken || current.play?.spadesBroken || false
        }
      };

      await redisGameState.setGameState(gameId, updated);
      return updated;
    } catch (error) {
      console.error('[OPTIMIZED GAME STATE] Error updating trick completion:', error);
      throw error;
    }
  }

  /**
   * Update bidding state incrementally
   */
  static async updateBiddingState(gameId, biddingData) {
    try {
      const current = await redisGameState.getGameState(gameId);
      if (!current) {
        return await this.buildOptimizedGameState(gameId);
      }

      // Update only the bidding data
      const updated = {
        ...current,
        bidding: {
          ...current.bidding,
          ...biddingData
        }
      };

      await redisGameState.setGameState(gameId, updated);
      return updated;
    } catch (error) {
      console.error('[OPTIMIZED GAME STATE] Error updating bidding state:', error);
      throw error;
    }
  }
}
