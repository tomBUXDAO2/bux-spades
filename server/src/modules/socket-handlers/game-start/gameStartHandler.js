import { GameService } from '../../../services/GameService.js';
import { prisma } from '../../../config/database.js';
// CONSOLIDATED: GameManager removed - using GameService directly
import { BotService } from '../../../services/BotService.js';
import { SystemMessageHandler } from '../chat/systemMessageHandler.js';
import { playerTimerService } from '../../../services/PlayerTimerService.js';
// CONSOLIDATED: SmartCacheService removed - using GameService directly

// Global mutex to prevent concurrent game starts across all socket connections
const startingGames = new Set();

class GameStartHandler {
  constructor(io, socket) {
    this.io = io;
    this.socket = socket;
    // CONSOLIDATED: GameManager removed - using GameService directly
    this.botService = new BotService();
    this.systemMessageHandler = new SystemMessageHandler(io, socket);
  }

  async handleStartGame(data) {
    const { gameId, rated } = data || {};
    const userId = this.socket.userId || data?.userId;

    if (!gameId) {
      console.error('[GAME START] No gameId provided in handleStartGame data');
      this.socket.emit('error', { message: 'Game ID is missing' });
      return;
    }

    // Prevent concurrent game starts
    if (startingGames.has(gameId)) {
      console.log(`[GAME START] Game ${gameId} is already being started, ignoring duplicate request`);
      return;
    }
    
    startingGames.add(gameId);

    try {
      console.log(`[GAME START] Starting game ${gameId} (rated: ${rated})`);
      if (!userId) {
        this.socket.emit('error', { message: 'User not authenticated' });
        startingGames.delete(gameId);
        return;
      }
      console.log(`[GAME START] User ${userId} starting game ${gameId} (rated=${rated === true})`);

      // Verify game exists with retry logic for database mutex conflicts
      let dbGame = null;
      let retries = 0;
      const maxRetries = 5;
      
      while (!dbGame && retries < maxRetries) {
        dbGame = await GameService.getGame(gameId);
        if (!dbGame) {
          retries++;
          if (retries < maxRetries) {
            console.log(`[GAME START] Game not found, retrying (${retries}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, 200 * retries)); // Exponential backoff
          }
        }
      }
      
      if (!dbGame) {
        console.error(`[GAME START] Game ${gameId} not found after ${maxRetries} retries`);
        this.socket.emit('error', { message: 'Game not found' });
        startingGames.delete(gameId);
        return;
      }
      
      // Get players and validate game start conditions
      const players = await prisma.gamePlayer.findMany({ 
        where: { gameId }, 
        orderBy: { seatIndex: 'asc' },
        include: { user: true }
      });
      
      if (!players || players.length === 0) {
        this.socket.emit('error', { message: 'Cannot start game - no players' });
        startingGames.delete(gameId);
        return;
      }

      // Count empty seats and bot players
      const occupiedSeats = players.filter(p => p.userId).length;
      const emptySeats = 4 - occupiedSeats;
      const botPlayers = players.filter(p => p.user && p.user.username && p.user.username.startsWith('Bot_'));
      const humanPlayers = players.filter(p => p.user && p.user.username && !p.user.username.startsWith('Bot_'));

      console.log(`[GAME START] Players analysis: ${occupiedSeats} occupied, ${emptySeats} empty, ${botPlayers.length} bots, ${humanPlayers.length} humans`);

      // Initialize game rating status
      let gameRated = false;

      // Validation logic based on game state
      if (emptySeats > 0) {
        // Empty seats detected - this should not happen if frontend is working correctly
        console.log(`[GAME START] ERROR: Empty seats detected (${emptySeats}) - frontend should have filled these`);
        this.socket.emit('error', { 
          message: 'Cannot start game with empty seats. Please invite bots or wait for more players.',
          code: 'EMPTY_SEATS'
        });
        startingGames.delete(gameId);
        return;
      }

      // Determine rating status
      if (botPlayers.length > 0) {
        // Has bots - game is unrated
        gameRated = false;
        console.log(`[GAME START] Bot players detected (${botPlayers.length}), game will be unrated`);
      } else if (humanPlayers.length === 4) {
        // All humans - game is rated
        gameRated = true;
        console.log(`[GAME START] All human players detected, game will be rated`);
      }

      // Override with explicit rated flag if provided
      if (typeof rated === 'boolean') {
        gameRated = rated;
        console.log(`[GAME START] Rated flag explicitly set to: ${gameRated}`);
      }

      // Update game with final rated status
      await GameService.updateGame(gameId, { isRated: gameRated });

      // Start the game in DB-first mode
      await GameService.startGame(gameId);
      
      // Game state has changed - no caching to avoid stale data

      // Deal initial hands and set current bidder/currentPlayer
      console.log(`[GAME START] About to deal initial hands for game ${gameId}`);
      await GameService.dealInitialHands(gameId);
      console.log(`[GAME START] Successfully dealt initial hands for game ${gameId}`);

      // System message
      this.systemMessageHandler.sendSystemMessage(gameId, '🟢 Game started');

      // Emit started and updated state to clients (DB-first)
      const gameState = await GameService.getFullGameStateFromDatabase(gameId);
      this.io.to(gameId).emit('game_started', { gameId, gameState });
      
      // CRITICAL FIX: Send personalized game state to each player
      const room = this.io.sockets.adapter.rooms.get(gameId);
      if (room) {
        for (const socketId of room) {
          const socket = this.io.sockets.sockets.get(socketId);
          if (socket && socket.userId) {
            const personalizedState = GameService.sanitizeGameStateForUser(gameState, socket.userId);
            socket.emit('game_update', {
              gameId,
              gameState: personalizedState
            });
          }
        }
      }

      // CRITICAL: Remove from starting games set IMMEDIATELY after successful completion
      startingGames.delete(gameId);

      // Wait for cards to be rendered before starting bidding
      // Bot bidding is handled by BiddingHandler - no duplicate triggering here
      console.log(`[GAME START] Game started - bot bidding will be handled by BiddingHandler`);
    } catch (error) {
      console.error('[GAME START] Error in handleStartGame:', error);
      console.error('[GAME START] Error stack:', error.stack);
      this.socket.emit('error', { message: 'Failed to start game' });
      
      // Remove from starting games set on error too
      startingGames.delete(gameId);
    }
  }

}

export { GameStartHandler };
