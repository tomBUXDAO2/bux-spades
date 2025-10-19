/**
 * PERFORMANCE MIDDLEWARE
 * Adds timing to all major operations without changing game logic
 */

export class PerformanceMiddleware {
  static timings = new Map();
  static operationCounts = new Map();
  
  /**
   * Wrap any function with performance timing
   */
  static async timeOperation(operationName, fn) {
    const startTime = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      
      // Track timing
      if (!this.timings.has(operationName)) {
        this.timings.set(operationName, []);
      }
      this.timings.get(operationName).push(duration);
      
      // Track counts
      this.operationCounts.set(operationName, (this.operationCounts.get(operationName) || 0) + 1);
      
      // Log slow operations
      if (duration > 200) {
        console.warn(`[PERFORMANCE] Slow operation: ${operationName} took ${duration}ms`);
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`[PERFORMANCE] Operation ${operationName} failed after ${duration}ms:`, error);
      throw error;
    }
  }
  
  /**
   * Get performance report
   */
  static getPerformanceReport() {
    const report = {};
    
    for (const [operation, times] of this.timings) {
      const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
      const maxTime = Math.max(...times);
      const minTime = Math.min(...times);
      const count = this.operationCounts.get(operation) || 0;
      
      report[operation] = {
        count,
        avgTime: Math.round(avgTime),
        maxTime,
        minTime,
        totalTime: times.reduce((sum, time) => sum + time, 0)
      };
    }
    
    return report;
  }
  
  /**
   * Clear old data to prevent memory leaks
   */
  static clearOldData() {
    // Keep only last 1000 operations per type
    for (const [operation, times] of this.timings) {
      if (times.length > 1000) {
        this.timings.set(operation, times.slice(-1000));
      }
    }
  }
}

// Clear old data every 5 minutes
setInterval(() => {
  PerformanceMiddleware.clearOldData();
}, 5 * 60 * 1000);
