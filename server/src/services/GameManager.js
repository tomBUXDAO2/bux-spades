import { GameService } from './GameService.js';
import { Game } from '../models/Game.js';

// In-memory game store for active games
class GameManager {
  constructor() {
    this.games = new Map(); // gameId -> Game instance
    this.socketRooms = new Map(); // gameId -> Set of socketIds
  }

  // Create/load a game instance from DB result into memory
  // Accepts an already-constructed Game instance or a plain object that GameService would return
  createGameFromDB(dbGame) {
    if (!dbGame) return null;
    
    // If it's already a Game instance, just add it
    if (dbGame instanceof Game) {
      this.addGame(dbGame);
      return dbGame;
    }
    
    // If it's a raw DB result, we need to load it properly through GameService
    // This should not happen in normal flow, but let's handle it gracefully
    console.warn('[GAME MANAGER] createGameFromDB called with raw DB result, this should not happen');
    return null;
  }

  // Add game to memory
  addGame(game) {
    console.log(`[GAME MANAGER] ADDING GAME ${game.id} TO MEMORY`);
    console.trace('[GAME MANAGER] Stack trace for addGame call');
    this.games.set(game.id, game);
    this.socketRooms.set(game.id, new Set());
    console.log(`[GAME MANAGER] Added game ${game.id} to memory`);
    console.log(`[GAME MANAGER] Total games in memory: ${this.games.size}`);
  }

  // Get game from memory
  getGame(gameId) {
    return this.games.get(gameId);
  }

  // Remove game from memory
  removeGame(gameId) {
    console.log(`[GAME MANAGER] REMOVING GAME ${gameId} FROM MEMORY`);
    console.trace('[GAME MANAGER] Stack trace for removeGame call');
    this.games.delete(gameId);
    this.socketRooms.delete(gameId);
    console.log(`[GAME MANAGER] Removed game ${gameId} from memory`);
  }

  // Get all games
  getAllGames() {
    return Array.from(this.games.values());
  }

  // Add socket to game room
  addSocketToGame(gameId, socketId) {
    if (!this.socketRooms.has(gameId)) {
      this.socketRooms.set(gameId, new Set());
    }
    this.socketRooms.get(gameId).add(socketId);
  }

  // Remove socket from game room
  removeSocketFromGame(gameId, socketId) {
    if (this.socketRooms.has(gameId)) {
      this.socketRooms.get(gameId).delete(socketId);
    }
  }

  // Get sockets in game room
  getGameSockets(gameId) {
    return this.socketRooms.get(gameId) || new Set();
  }

  // Load game from database into memory
  async loadGame(gameId) {
    try {
      const game = await GameService.getGame(gameId);
      if (game) {
        this.addGame(game);
        return game;
      }
      return null;
    } catch (error) {
      console.error(`[GAME MANAGER] Error loading game ${gameId}:`, error);
      return null;
    }
  }

  // Save game to database
  async saveGame(gameId) {
    try {
      const game = this.getGame(gameId);
      if (game) {
        await GameService.updateGame(game);
        console.log(`[GAME MANAGER] Saved game ${gameId} to database`);
      }
    } catch (error) {
      console.error(`[GAME MANAGER] Error saving game ${gameId}:`, error);
    }
  }

  // Load all active games from database
  async loadAllActiveGames() {
    try {
      const games = await GameService.getActiveGames();
      games.forEach(game => {
        this.addGame(game);
      });
      console.log(`[GAME MANAGER] Loaded ${games.length} active games`);
    } catch (error) {
      console.error('[GAME MANAGER] Error loading active games:', error);
    }
  }

  // Create new game
  async createGame(gameData) {
    try {
      const game = await GameService.createGame(gameData);
      
      // Creator is already added to the database by GameService
      console.log(`[GAME MANAGER] Game ${game.id} created with creator ${gameData.createdById} in database`);
      
      this.addGame(game);
      return game;
    } catch (error) {
      console.error('[GAME MANAGER] Error creating game:', error);
      throw error;
    }
  }

  // Delete game
  async deleteGame(gameId) {
    try {
      await GameService.deleteGame(gameId);
      this.removeGame(gameId);
      return true;
    } catch (error) {
      console.error(`[GAME MANAGER] Error deleting game ${gameId}:`, error);
      throw error;
    }
  }
}

// Singleton instance
export const gameManager = new GameManager();
export { GameManager };
