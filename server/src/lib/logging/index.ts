// Logging Module
// This file exports all logging functions for easy importing

// Game event logging
export { logCompletedGameToDbAndDiscord } from './game-events';

// Database operations
export { 
  retryOperation, 
  updateGameRecord, 
  createGameRecord, 
  upsertGamePlayer, 
  createGameResult 
} from './database-operations';

// Player actions (placeholder for future expansion)
export * from './player-actions';
