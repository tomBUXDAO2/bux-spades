/**
 * GAME STATE CACHE
 * Reduces database calls by caching game state for short periods
 */
export class GameStateCache {
  static cache = new Map();
  static CACHE_TTL = 2000; // 2 seconds cache

  /**
   * Get cached game state or fetch from database
   */
  static async getGameState(gameId, fetchFunction) {
    const cacheKey = `game_${gameId}`;
    const cached = this.cache.get(cacheKey);
    
    // Return cached if still valid
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      return cached.data;
    }
    
    // Fetch fresh data
    const freshData = await fetchFunction();
    
    // Cache the result
    this.cache.set(cacheKey, {
      data: freshData,
      timestamp: Date.now()
    });
    
    return freshData;
  }

  /**
   * Invalidate cache for a game
   */
  static invalidateGame(gameId) {
    const cacheKey = `game_${gameId}`;
    this.cache.delete(cacheKey);
  }

  /**
   * Clear all cache
   */
  static clear() {
    this.cache.clear();
  }
}
