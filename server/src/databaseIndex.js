import { app, server, io, PORT } from './config/server.js';
import { setupDatabaseSocketHandlers } from './socket/databaseSocketHandlers.js';
import { setupDatabaseRoutes } from './routes/databaseIndex.js';
import { DatabaseGameService } from './services/DatabaseGameService.js';
import { DatabaseGameEngine } from './services/DatabaseGameEngine.js';

/**
 * DATABASE-FIRST SERVER ENTRY POINT
 * No in-memory game management
 */

// Setup database-first routes
setupDatabaseRoutes(app);

// Setup database-first socket handlers
setupDatabaseSocketHandlers(io);

// No need to load games on startup - everything is in database
console.log('[DB SERVER] Database-first server starting...');

// Start server
server.listen(PORT, () => {
  console.log(`[DB SERVER] Server running on port ${PORT}`);
  console.log(`[DB SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[DB SERVER] Database-first architecture enabled`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[DB SERVER] Shutting down gracefully...');
  
  // No games to save - everything is in database
  server.close(() => {
    console.log('[DB SERVER] Server closed');
    process.exit(0);
  });
});

export { io };
