// EMERGENCY: Disable logging in production FIRST
import './config/logging.js';

import { app, server, io, PORT, HOST } from './config/server.js';
// CONSOLIDATED: GameManager removed - using GameService directly
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
// CONSOLIDATED: GameManager removed - using GameService directly
console.log('[SERVER] Loaded existing games');

// Bind HTTP immediately so Fly's post-start socket check sees the internal port (cleanup/Discord can follow).
server.listen(PORT, HOST, () => {
  console.log(`[SERVER] Listening on http://${HOST}:${PORT}`);
  console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);

  PeriodicCleanupService.start();

  if (process.env.DISCORD_BOT_TOKEN) {
    startDiscordBot().catch(error => {
      console.error('[SERVER] Error starting Discord bot:', error);
    });
  } else {
    console.log('[SERVER] Discord bot disabled (no DISCORD_BOT_TOKEN)');
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[SERVER] Shutting down gracefully...');
  
  // Stop periodic cleanup service
  PeriodicCleanupService.stop();
  
  // Clear all player timers
  playerTimerService.clearAllTimers();
  
  // Save all games before shutdown
  // CONSOLIDATED: GameManager removed - using GameService directly
  console.log('[SERVER] Shutdown complete');
  
  server.close(() => {
    console.log('[SERVER] Server closed');
    process.exit(0);
  });
});

export { io };
