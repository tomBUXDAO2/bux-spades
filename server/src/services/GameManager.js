import { GameService } from './GameService.js';

// In-memory game store for active games
class GameManager {
  constructor() {
    this.games = new Map(); // gameId -> Game instance
    this.socketRooms = new Map(); // gameId -> Set of socketIds
  }

  // Add game to memory
  addGame(game) {
    this.games.set(game.id, game);
    this.socketRooms.set(game.id, new Set());
    console.log(`[GAME MANAGER] Added game ${game.id} to memory`);
  }

  // Get game from memory
  getGame(gameId) {
    return this.games.get(gameId);
  }

  // Remove game from memory
  removeGame(gameId) {
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
