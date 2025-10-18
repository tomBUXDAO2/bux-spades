/**
 * PERFORMANCE MONITORING SERVICE
 * Tracks and optimizes database query performance
 */
export class PerformanceMonitoringService {
  static queryTimes = new Map();
  static slowQueries = [];
  
  /**
   * Track query execution time
   */
  static async trackQuery(queryName, queryFn) {
    const startTime = Date.now();
    try {
      const result = await queryFn();
      const executionTime = Date.now() - startTime;
      
      // Track query time
      this.queryTimes.set(queryName, executionTime);
      
      // Log slow queries (>100ms)
      if (executionTime > 100) {
        this.slowQueries.push({
          queryName,
          executionTime,
          timestamp: new Date()
        });
        console.warn(`[PERFORMANCE] Slow query detected: ${queryName} took ${executionTime}ms`);
      }
      
      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error(`[PERFORMANCE] Query ${queryName} failed after ${executionTime}ms:`, error);
      throw error;
    }
  }
  
  /**
   * Get performance statistics
   */
  static getPerformanceStats() {
    const avgQueryTime = Array.from(this.queryTimes.values()).reduce((sum, time) => sum + time, 0) / this.queryTimes.size;
    const maxQueryTime = Math.max(...this.queryTimes.values());
    const slowQueryCount = this.slowQueries.length;
    
    return {
      totalQueries: this.queryTimes.size,
      averageQueryTime: Math.round(avgQueryTime),
      maxQueryTime,
      slowQueryCount,
      recentSlowQueries: this.slowQueries.slice(-10)
    };
  }
  
  /**
   * Clear performance data
   */
  static clearPerformanceData() {
    this.queryTimes.clear();
    this.slowQueries = [];
  }
  
  /**
   * Get query performance recommendations
   */
  static getPerformanceRecommendations() {
    const recommendations = [];
    
    // Check for N+1 query patterns
    const gameQueries = Array.from(this.queryTimes.entries())
      .filter(([name]) => name.includes('game'))
      .sort(([,a], [,b]) => b - a);
    
    if (gameQueries.length > 0) {
      const slowestGameQuery = gameQueries[0];
      if (slowestGameQuery[1] > 200) {
        recommendations.push({
          type: 'N+1_QUERY',
          query: slowestGameQuery[0],
          time: slowestGameQuery[1],
          suggestion: 'Consider using include statements to fetch related data in single query'
        });
      }
    }
    
    // Check for repeated slow queries
    const repeatedSlowQueries = this.slowQueries
      .reduce((acc, query) => {
        acc[query.queryName] = (acc[query.queryName] || 0) + 1;
        return acc;
      }, {});
    
    Object.entries(repeatedSlowQueries)
      .filter(([, count]) => count > 3)
      .forEach(([queryName, count]) => {
        recommendations.push({
          type: 'REPEATED_SLOW_QUERY',
          query: queryName,
          count,
          suggestion: 'Consider adding database indexes or query optimization'
        });
      });
    
    return recommendations;
  }
}
