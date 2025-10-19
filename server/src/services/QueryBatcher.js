/**
 * QUERY BATCHER
 * Batches similar database queries to reduce database load
 */

export class QueryBatcher {
  static pendingQueries = new Map();
  static batchTimeout = 50; // 50ms batch window
  
  /**
   * Batch a query with others of the same type
   */
  static async batchQuery(queryType, queryFn, key) {
    const batchKey = `${queryType}_${key}`;
    
    // If there's already a pending query for this key, wait for it
    if (this.pendingQueries.has(batchKey)) {
      return this.pendingQueries.get(batchKey);
    }
    
    // Create a new promise for this query
    const queryPromise = this.executeQuery(queryFn);
    this.pendingQueries.set(batchKey, queryPromise);
    
    // Clear the promise after execution
    queryPromise.finally(() => {
      this.pendingQueries.delete(batchKey);
    });
    
    return queryPromise;
  }
  
  /**
   * Execute the actual query
   */
  static async executeQuery(queryFn) {
    try {
      const result = await queryFn();
      return result;
    } catch (error) {
      console.error('[QUERY BATCHER] Query failed:', error);
      throw error;
    }
  }
  
  /**
   * Get game state with batching
   */
  static async getGameStateForClient(gameId) {
    return this.batchQuery('getGameStateForClient', async () => {
      const { GameService } = await import('./GameService.js');
      return GameService.getGameStateForClient(gameId);
    }, gameId);
  }
  
  /**
   * Get game with batching
   */
  static async getGame(gameId) {
    return this.batchQuery('getGame', async () => {
      const { GameService } = await import('./GameService.js');
      return GameService.getGame(gameId);
    }, gameId);
  }
}
