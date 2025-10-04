// EMERGENCY: Disable logging in production FIRST
import './config/logging.js';

import { app, server, io, PORT } from './config/server.js';
import { gameManager } from './services/GameManager.js';
import { setupSocketHandlers } from './socket/socketHandlers.js';
import { setupRoutes } from './routes/index.js';
import { PeriodicCleanupService } from './services/PeriodicCleanupService.js';

// Setup routes
setupRoutes(app);

// Setup socket handlers
setupSocketHandlers(io);

// Load existing games on startup
gameManager.loadAllActiveGames().then(() => {
  console.log('[SERVER] Loaded existing games');
}).catch(error => {
  console.error('[SERVER] Error loading games:', error);
});

// Start periodic cleanup service (temporarily disabled for debugging)
// PeriodicCleanupService.start();

// Start server
server.listen(PORT, () => {
  console.log(`[SERVER] Server running on port ${PORT}`);
  console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[SERVER] Shutting down gracefully...');
  
  // Stop periodic cleanup service
  PeriodicCleanupService.stop();
  
  // Save all games before shutdown
  const games = gameManager.getAllGames();
  for (const game of games) {
    await gameManager.saveGame(game.id);
  }
  
  server.close(() => {
    console.log('[SERVER] Server closed');
    process.exit(0);
  });
});

export { io, gameManager };
