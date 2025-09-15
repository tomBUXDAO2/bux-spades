// Core Game Cleanup Manager
export { GameCleanupManager } from './game-cleanup/core/gameCleanupManager';

// Memory Cleanup
export { cleanupFinishedGamesInMemory } from './game-cleanup/memory/memoryCleanup';

// Database Cleanup
export { cleanupStuckDatabaseGames, cleanupOrphanedGames, forceCleanupGame } from './game-cleanup/database/databaseCleanup';

// Abandoned Game Cleanup
export { cleanupAbandonedGames } from './game-cleanup/abandoned/abandonedGameCleanup';

// Singleton instance
import { GameCleanupManager } from './game-cleanup/core/gameCleanupManager';
export const gameCleanupManager = GameCleanupManager.getInstance();
