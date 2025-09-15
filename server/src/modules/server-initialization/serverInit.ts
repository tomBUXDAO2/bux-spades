import { games } from '../../gamesStore';
import { restoreAllActiveGames, startGameStateAutoSave, checkForStuckGames } from '../../lib/gameStatePersistence';
import { gameCleanupManager } from '../../lib/gameCleanup';

export function initializeServer(httpServer: any, PORT: number) {
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
    
    // Restore active games from database after server restart
    console.log('🔄 Server restarted - restoring active games from database...');
    try {
      const restoredGames = await restoreAllActiveGames();
      restoredGames.forEach(game => {
        games.push(game);
        console.log(`✅ Restored game ${game.id} - Round ${game.currentRound}, Trick ${game.currentTrick}`);
      });
      console.log(`✅ Restored ${restoredGames.length} active games`);
    } catch (error) {
      console.error('❌ Failed to restore active games:', error);
    }
    
    // Start auto-saving game state
    startGameStateAutoSave(games);
    console.log('💾 Game state auto-save enabled (every 30 seconds)');
    
    // Start stuck game checker
    setInterval(() => {
      checkForStuckGames();
    }, 60000); // Check every minute
    console.log('🔍 Stuck game checker enabled (every minute)');
    
    // Start comprehensive game cleanup system
    gameCleanupManager.startCleanup(games);
    console.log('🧹 Game cleanup system enabled (every 30 seconds)');
  });
}
