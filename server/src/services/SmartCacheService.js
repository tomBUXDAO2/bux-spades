/**
 * SMART CACHE SERVICE
 * Adds intelligent caching to expensive operations without changing game logic
 */

import redisGameState from './RedisGameStateService.js';

export class SmartCacheService {
  static cache = new Map();
  static cacheTimestamps = new Map();
  static CACHE_DURATION = 5000; // 5 seconds cache
  
  /**
   * Get cached game state or fetch fresh
   */
  static async getGameStateForClient(gameId, forceRefresh = false) {
    const cacheKey = `gameState_${gameId}`;
    const now = Date.now();
    
    // Check if we have valid cached data
    if (!forceRefresh && this.cache.has(cacheKey)) {
      const timestamp = this.cacheTimestamps.get(cacheKey);
      if (now - timestamp < this.CACHE_DURATION) {
        console.log(`[SMART CACHE] Using cached gameState for ${gameId}`);
        return this.cache.get(cacheKey);
      }
    }
    
    // Fetch fresh data
    console.log(`[SMART CACHE] Fetching fresh gameState for ${gameId}`);
    const { GameService } = await import('./GameService.js');
    const gameState = await GameService.getGameStateForClient(gameId);
    
    // Cache the result
    this.cache.set(cacheKey, gameState);
    this.cacheTimestamps.set(cacheKey, now);
    
    return gameState;
  }
  
  /**
   * Get cached game or fetch fresh
   */
  static async getGame(gameId, forceRefresh = false) {
    const cacheKey = `game_${gameId}`;
    const now = Date.now();
    
    // Check if we have valid cached data
    if (!forceRefresh && this.cache.has(cacheKey)) {
      const timestamp = this.cacheTimestamps.get(cacheKey);
      if (now - timestamp < this.CACHE_DURATION) {
        console.log(`[SMART CACHE] Using cached game for ${gameId}`);
        return this.cache.get(cacheKey);
      }
    }
    
    // Fetch fresh data
    console.log(`[SMART CACHE] Fetching fresh game for ${gameId}`);
    const { GameService } = await import('./GameService.js');
    const game = await GameService.getGame(gameId);
    
    // Cache the result
    this.cache.set(cacheKey, game);
    this.cacheTimestamps.set(cacheKey, now);
    
    return game;
  }
  
  /**
   * Invalidate cache for a game (when game state changes)
   */
  static invalidateGame(gameId) {
    console.log(`[SMART CACHE] Invalidating cache for game ${gameId}`);
    this.cache.delete(`gameState_${gameId}`);
    this.cache.delete(`game_${gameId}`);
    this.cacheTimestamps.delete(`gameState_${gameId}`);
    this.cacheTimestamps.delete(`game_${gameId}`);
  }
  
  /**
   * Clear old cache entries to prevent memory leaks
   */
  static cleanup() {
    const now = Date.now();
    for (const [key, timestamp] of this.cacheTimestamps) {
      if (now - timestamp > this.CACHE_DURATION * 2) {
        this.cache.delete(key);
        this.cacheTimestamps.delete(key);
      }
    }
  }
}

// Cleanup old cache every 30 seconds
setInterval(() => {
  SmartCacheService.cleanup();
}, 30000);
