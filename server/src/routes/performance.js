import express from 'express';
import { PerformanceMiddleware } from '../middleware/PerformanceMiddleware.js';

const router = express.Router();

/**
 * Get real-time performance metrics
 */
router.get('/metrics', (req, res) => {
  try {
    const report = PerformanceMiddleware.getPerformanceReport();
    
    // Sort by average time (slowest first)
    const sortedReport = Object.entries(report)
      .sort(([,a], [,b]) => b.avgTime - a.avgTime)
      .reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {});
    
    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      metrics: sortedReport,
      summary: {
        totalOperations: Object.values(report).reduce((sum, op) => sum + op.count, 0),
        slowestOperation: Object.entries(report).reduce((max, [key, value]) => 
          value.avgTime > max.avgTime ? { key, ...value } : max, 
          { key: 'none', avgTime: 0 }
        )
      }
    });
  } catch (error) {
    console.error('Error getting performance metrics:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Clear performance data
 */
router.post('/clear', (req, res) => {
  try {
    PerformanceMiddleware.timings.clear();
    PerformanceMiddleware.operationCounts.clear();
    res.json({ success: true, message: 'Performance data cleared' });
  } catch (error) {
    console.error('Error clearing performance data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
