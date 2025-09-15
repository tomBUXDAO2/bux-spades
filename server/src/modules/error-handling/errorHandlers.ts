import { games } from '../../gamesStore';

export function setupErrorHandlers() {
  // EMERGENCY GLOBAL ERROR HANDLER - Prevent games from being lost
  process.on('uncaughtException', (error) => {
    console.error('[EMERGENCY] Uncaught Exception:', error);
    console.error('[EMERGENCY] Games in memory:', games.length);
    games.forEach((game, i) => {
      console.error(`[EMERGENCY] Game ${i}: ${game.id}, status: ${game.status}, players: ${game.players.filter(p => p).length}`);
    });
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('[EMERGENCY] Unhandled Rejection at:', promise, 'reason:', reason);
    console.error('[EMERGENCY] Games in memory:', games.length);
    games.forEach((game, i) => {
      console.error(`[EMERGENCY] Game ${i}: ${game.id}, status: ${game.status}, players: ${game.players.filter(p => p).length}`);
    });
  });
}
