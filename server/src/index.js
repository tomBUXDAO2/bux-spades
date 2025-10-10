// EMERGENCY: Disable logging in production FIRST
import './config/logging.js';

import { app, server, io, PORT } from './config/server.js';
import { gameManager } from './services/GameManager.js';
import { setupSocketHandlers } from './socket/socketHandlers.js';
import { setupRoutes } from './routes/index.js';
import { PeriodicCleanupService } from './services/PeriodicCleanupService.js';
import { startDiscordBot } from './discord/bot.js';
import { playerTimerService } from './services/PlayerTimerService.js';

// Setup routes
setupRoutes(app);

// Setup socket handlers
setupSocketHandlers(io);

// Initialize player timer service with Socket.IO instance
playerTimerService.setIO(io);

// Load existing games on startup
gameManager.loadAllActiveGames().then(() => {
  console.log('[SERVER] Loaded existing games');
}).catch(error => {
  console.error('[SERVER] Error loading games:', error);
});

// Start periodic cleanup service
PeriodicCleanupService.start();

// Start Discord bot
if (process.env.DISCORD_BOT_TOKEN) {
  startDiscordBot().catch(error => {
    console.error('[SERVER] Error starting Discord bot:', error);
  });
} else {
  console.log('[SERVER] Discord bot disabled (no DISCORD_BOT_TOKEN)');
}

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] Server running on port ${PORT}`);
  console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[SERVER] Shutting down gracefully...');
  
  // Stop periodic cleanup service
  PeriodicCleanupService.stop();
  
  // Clear all player timers
  playerTimerService.clearAllTimers();
  
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
