// EMERGENCY: Disable logging in production FIRST
import './config/logging.js';

import { app, server, io, PORT, HOST } from './config/server.js';

// Bind the port before loading routes, sockets, and Discord so Fly's listener probe sees :3000 quickly.
// Full API/socket setup runs in the listening callback (dynamic imports).
server.listen(PORT, HOST, async () => {
  console.log(`[SERVER] Listening on http://${HOST}:${PORT}`);

  try {
    const { setupRoutes } = await import('./routes/index.js');
    setupRoutes(app);

    const { setupSocketHandlers } = await import('./socket/socketHandlers.js');
    setupSocketHandlers(io);

    const { playerTimerService } = await import('./services/PlayerTimerService.js');
    playerTimerService.setIO(io);

    console.log('[SERVER] Loaded existing games');

    const { PeriodicCleanupService } = await import('./services/PeriodicCleanupService.js');
    PeriodicCleanupService.start();

    if (process.env.DISCORD_BOT_TOKEN) {
      const { startDiscordBot } = await import('./discord/bot.js');
      startDiscordBot().catch((error) => {
        console.error('[SERVER] Error starting Discord bot:', error);
      });
    } else {
      console.log('[SERVER] Discord bot disabled (no DISCORD_BOT_TOKEN)');
    }

    console.log(`[SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
  } catch (err) {
    console.error('[SERVER] Post-listen bootstrap failed:', err);
    process.exit(1);
  }
});

server.on('error', (err) => {
  console.error('[SERVER] server.listen error:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[SERVER] Shutting down gracefully...');

  try {
    const { PeriodicCleanupService } = await import('./services/PeriodicCleanupService.js');
    PeriodicCleanupService.stop();
    const { playerTimerService } = await import('./services/PlayerTimerService.js');
    playerTimerService.clearAllTimers();
  } catch (e) {
    console.error('[SERVER] Shutdown cleanup error:', e);
  }

  console.log('[SERVER] Shutdown complete');

  server.close(() => {
    console.log('[SERVER] Server closed');
    process.exit(0);
  });
});

export { io };
