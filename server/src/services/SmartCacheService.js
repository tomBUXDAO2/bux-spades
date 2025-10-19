/**
 * SMART CACHE SERVICE
 * Adds intelligent caching to expensive operations without changing game logic
 */

import redisGameState from './RedisGameStateService.js';

export class SmartCacheService {
  static cache = new Map();
  static cacheTimestamps = new Map();
  static CACHE_DURATION = 5000; // 5 seconds cache - reduced to prevent stale data
  
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
    
    // Try Redis cache first (even more aggressive)
    try {
      const redisCachedState = await redisGameState.getGameState(gameId);
      if (redisCachedState && !forceRefresh) {
        console.log(`[SMART CACHE] Using Redis cached gameState for ${gameId}`);
        // Also cache in memory
        this.cache.set(cacheKey, redisCachedState);
        this.cacheTimestamps.set(cacheKey, now);
        return redisCachedState;
      }
    } catch (error) {
      console.log(`[SMART CACHE] Redis cache miss for ${gameId}:`, error.message);
    }
    
    // Fetch fresh data
    console.log(`[SMART CACHE] Fetching fresh gameState for ${gameId}`);
    const { GameService } = await import('./GameService.js');
    const gameState = await GameService.getGameStateForClient(gameId);
    
    // Cache the result in both memory and Redis
    this.cache.set(cacheKey, gameState);
    this.cacheTimestamps.set(cacheKey, now);
    
    // Also cache in Redis for even longer
    try {
      await redisGameState.setGameState(gameId, gameState);
      console.log(`[SMART CACHE] Cached gameState in Redis for ${gameId}`);
    } catch (error) {
      console.log(`[SMART CACHE] Failed to cache in Redis:`, error.message);
    }
    
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
    
    // Try Redis cache first (even more aggressive)
    try {
      const redisCachedGame = await redisGameState.getGameState(gameId);
      if (redisCachedGame && !forceRefresh) {
        console.log(`[SMART CACHE] Using Redis cached game for ${gameId}`);
        // Also cache in memory
        this.cache.set(cacheKey, redisCachedGame);
        this.cacheTimestamps.set(cacheKey, now);
        return redisCachedGame;
      }
    } catch (error) {
      console.log(`[SMART CACHE] Redis cache miss for game ${gameId}:`, error.message);
    }
    
    // Fetch fresh data
    console.log(`[SMART CACHE] Fetching fresh game for ${gameId}`);
    const { GameService } = await import('./GameService.js');
    const game = await GameService.getGame(gameId);
    
    // Cache the result in both memory and Redis
    this.cache.set(cacheKey, game);
    this.cacheTimestamps.set(cacheKey, now);
    
    // Also cache in Redis for even longer
    try {
      await redisGameState.setGameState(gameId, game);
      console.log(`[SMART CACHE] Cached game in Redis for ${gameId}`);
    } catch (error) {
      console.log(`[SMART CACHE] Failed to cache game in Redis:`, error.message);
    }
    
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
    
    // Also clear Redis cache to prevent stale data
    try {
      redisGameState.deleteGameState(gameId);
      console.log(`[SMART CACHE] Cleared Redis cache for game ${gameId}`);
    } catch (error) {
      console.log(`[SMART CACHE] Failed to clear Redis cache:`, error.message);
    }
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
