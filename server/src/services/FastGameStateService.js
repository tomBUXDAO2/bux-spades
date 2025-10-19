/**
 * FAST GAME STATE SERVICE
 * Ultra-optimized game state retrieval with minimal database calls
 */

import { prisma } from '../config/database.js';
import redisGameState from './RedisGameStateService.js';

export class FastGameStateService {
  
  /**
   * Get complete game state for client - fast with caching
   */
  static async getGameStateForClient(gameId) {
    try {
      // Try Redis first (fastest)
      const cached = await redisGameState.getGameState(gameId);
      if (cached) {
        return cached;
      }
      
      // Fallback to complete database query (but optimized)
      const { GameService } = await import('./GameService.js');
      const gameState = await GameService.getGameStateForClient(gameId);
      
      // Cache the result in Redis for next time
      try {
        await redisGameState.setGameState(gameId, gameState);
      } catch (error) {
        console.log('[FAST GAME STATE] Failed to cache in Redis:', error.message);
      }
      
      return gameState;
      
    } catch (error) {
      console.error('[FAST GAME STATE] Error:', error);
      throw error;
    }
  }
  
  /**
   * Get complete game data - fast with caching
   */
  static async getGame(gameId) {
    try {
      // Try Redis first
      const cached = await redisGameState.getGameState(gameId);
      if (cached) {
        return cached;
      }
      
      // Fallback to complete database query
      const { GameService } = await import('./GameService.js');
      const game = await GameService.getGame(gameId);
      
      // Cache the result in Redis for next time
      try {
        await redisGameState.setGameState(gameId, game);
      } catch (error) {
        console.log('[FAST GAME STATE] Failed to cache game in Redis:', error.message);
      }
      
      return game;
      
    } catch (error) {
      console.error('[FAST GAME STATE] Error:', error);
      throw error;
    }
  }
  
  /**
   * Invalidate cache when game state changes
   */
  static async invalidateGame(gameId) {
    try {
      await redisGameState.deleteGameState(gameId);
      console.log(`[FAST GAME STATE] Cache invalidated for game ${gameId}`);
    } catch (error) {
      console.log(`[FAST GAME STATE] Failed to invalidate cache:`, error.message);
    }
  }
}
