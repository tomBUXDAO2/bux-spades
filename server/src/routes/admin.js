import express from 'express';
import { GameCleanupService } from '../services/GameCleanupService.js';
import { PeriodicCleanupService } from '../services/PeriodicCleanupService.js';

const router = express.Router();

// Get cleanup statistics
router.get('/cleanup/stats', async (req, res) => {
  try {
    const stats = await GameCleanupService.getCleanupStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('[ADMIN] Error getting cleanup stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get cleanup stats'
    });
  }
});

// Force cleanup of abandoned games
router.post('/cleanup/abandoned', async (req, res) => {
  try {
    console.log('[ADMIN] Manual cleanup of abandoned games triggered');
    const cleanedCount = await GameCleanupService.cleanupAllAbandonedUnratedGames();
    
    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} abandoned games`,
      cleanedCount
    });
  } catch (error) {
    console.error('[ADMIN] Error cleaning up abandoned games:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup abandoned games'
    });
  }
});

// Force cleanup of old completed games
router.post('/cleanup/old', async (req, res) => {
  try {
    console.log('[ADMIN] Manual cleanup of old completed games triggered');
    const cleanedCount = await GameCleanupService.cleanupOldCompletedUnratedGames();
    
    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} old completed games`,
      cleanedCount
    });
  } catch (error) {
    console.error('[ADMIN] Error cleaning up old games:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup old games'
    });
  }
});

// Force full cleanup
router.post('/cleanup/full', async (req, res) => {
  try {
    console.log('[ADMIN] Manual full cleanup triggered');
    
    const abandonedCleaned = await GameCleanupService.cleanupAllAbandonedUnratedGames();
    const oldCleaned = await GameCleanupService.cleanupOldCompletedUnratedGames();
    
    res.json({
      success: true,
      message: `Full cleanup completed`,
      abandonedCleaned,
      oldCleaned,
      totalCleaned: abandonedCleaned + oldCleaned
    });
  } catch (error) {
    console.error('[ADMIN] Error during full cleanup:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to perform full cleanup'
    });
  }
});

// Get periodic cleanup service status
router.get('/cleanup/service/status', (req, res) => {
  try {
    const status = PeriodicCleanupService.getStatus();
    res.json({
      success: true,
      status
    });
  } catch (error) {
    console.error('[ADMIN] Error getting service status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get service status'
    });
  }
});

// Start periodic cleanup service
router.post('/cleanup/service/start', (req, res) => {
  try {
    PeriodicCleanupService.start();
    res.json({
      success: true,
      message: 'Periodic cleanup service started'
    });
  } catch (error) {
    console.error('[ADMIN] Error starting service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start service'
    });
  }
});

// Stop periodic cleanup service
router.post('/cleanup/service/stop', (req, res) => {
  try {
    PeriodicCleanupService.stop();
    res.json({
      success: true,
      message: 'Periodic cleanup service stopped'
    });
  } catch (error) {
    console.error('[ADMIN] Error stopping service:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop service'
    });
  }
});

// Force run periodic cleanup
router.post('/cleanup/service/run', async (req, res) => {
  try {
    await PeriodicCleanupService.forceCleanup();
    res.json({
      success: true,
      message: 'Periodic cleanup completed'
    });
  } catch (error) {
    console.error('[ADMIN] Error running periodic cleanup:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run periodic cleanup'
    });
  }
});

export default router;
