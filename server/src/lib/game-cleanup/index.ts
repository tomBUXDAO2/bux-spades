// Core Game Cleanup Manager
export { GameCleanupManager } from "./core/gameCleanupManager";

// Memory Cleanup
export { cleanupFinishedGamesInMemory } from './memory/memoryCleanup';

// Database Cleanup
export { cleanupStuckDatabaseGames, cleanupOrphanedGames, forceCleanupGame } from './database/databaseCleanup';

// Abandoned Game Cleanup
export { cleanupAbandonedGames } from './abandoned/abandonedGameCleanup';

// Singleton instance
import { GameCleanupManager } from "./core/gameCleanupManager";
export const gameCleanupManager = GameCleanupManager.getInstance();
