import { games } from '../../gamesStore';
import { restoreAllActiveGames, startGameStateAutoSave, checkForStuckGames } from '../../lib/gameStatePersistence';
import { gameCleanupManager } from "../../lib/game-cleanup";
import type { Server } from 'socket.io';

export function initializeServer(httpServer: any, PORT: number, io?: Server) {
  httpServer.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server is running on port ${PORT}`);
    console.log('Server configuration:', {
      port: PORT,
      env: process.env.NODE_ENV,
      cors: {
        allowedOrigins: [
          'http://localhost:5173',
          'http://localhost:3000',
          'https://bux-spades.vercel.app',
          'https://bux-spades-git-main-tombuxdao.vercel.app'
        ],
        credentials: true
      },
      socket: {
        path: '/socket.io',
        transports: ['polling', 'websocket']
      }
    });
    
    // Set the io instance in the game cleanup manager
    if (io) {
      gameCleanupManager.setIo(io);
      console.log('🔌 Socket.IO instance set in game cleanup manager');
    }
    
    // REMOVE legacy in-memory restore and auto-save
    // Stuck game checker (DB-based)
    setInterval(() => {
      checkForStuckGames();
    }, 60000); // Check every minute
    console.log('🔍 Stuck game checker enabled (every minute)');
    
    // Start comprehensive game cleanup system (operates against current in-memory list and DB)
    gameCleanupManager.startCleanup(games);
    console.log('🧹 Game cleanup system enabled (every 30 seconds)');
  });
}
