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
      // Always use the full GameService to ensure complete, correct data
      // The caching was causing stale/incomplete data issues
      const { GameService } = await import('./GameService.js');
      const gameState = await GameService.getGameStateForClient(gameId);
      
      return gameState;
      
    } catch (error) {
      console.error('[FAST GAME STATE] Error:', error);
      throw error;
    }
  }
  
  /**
   * Get complete game data - always fresh from database
   */
  static async getGame(gameId) {
    try {
      // Always use the full GameService to ensure complete, correct data
      const { GameService } = await import('./GameService.js');
      const game = await GameService.getGame(gameId);
      
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
