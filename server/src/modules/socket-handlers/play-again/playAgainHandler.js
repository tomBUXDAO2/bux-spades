import { GameService } from '../../../services/GameService.js';
import { GameCreationService } from '../../../services/GameCreationService.js';
import { emitPersonalizedGameEvent } from '../../../services/SocketGameBroadcastService.js';
import { prisma } from '../../../config/database.js';

// Track play_again responses per game
const playAgainResponses = new Map(); // gameId -> Map<userId, {seatIndex, timestamp}>
const playAgainTimers = new Map(); // gameId -> NodeJS.Timeout

class PlayAgainHandler {
  constructor(io, socket) {
    this.io = io;
    this.socket = socket;
  }

  /**
   * Handle play_again event from client
   */
  async handlePlayAgain(data) {
    try {
      const { gameId } = data;
      const userId = this.socket.userId;

      if (!gameId || !userId) {
        this.socket.emit('error', { message: 'Missing gameId or userId' });
        return;
      }

      console.log(`[PLAY AGAIN] User ${userId} wants to play again in game ${gameId}`);

      // Get current game state to find player's seat
      const gameState = await GameService.getGame(gameId);
      if (!gameState) {
        this.socket.emit('error', { message: 'Game not found' });
        return;
      }

      // Find player's seat index - only check human players
      const player = await prisma.gamePlayer.findFirst({
        where: { gameId, userId, isHuman: true },
        select: { seatIndex: true }
      });

      if (!player) {
        console.log(`[PLAY AGAIN] User ${userId} not found as human player in game ${gameId}`);
        this.socket.emit('error', { message: 'Player not found in game' });
        return;
      }

      // Initialize responses map for this game if needed
      if (!playAgainResponses.has(gameId)) {
        playAgainResponses.set(gameId, new Map());
        console.log(`[PLAY AGAIN] Initialized tracking for game ${gameId}`);
      }

      const responses = playAgainResponses.get(gameId);
      
      // Record this player's response
      responses.set(userId, {
        seatIndex: player.seatIndex,
        timestamp: Date.now()
      });

      console.log(`[PLAY AGAIN] Recorded response from user ${userId} at seat ${player.seatIndex}`);

      // Emit confirmation to the player
      this.socket.emit('play_again_confirmed', { gameId });

      // Check if we should start the timer (first response)
      if (responses.size === 1) {
        this.startPlayAgainTimer(gameId);
      }

      // Broadcast updated play_again status to all players
      this.broadcastPlayAgainStatus(gameId);

    } catch (error) {
      console.error('[PLAY AGAIN] Error handling play_again:', error);
      this.socket.emit('error', { message: 'Failed to process play again request' });
    }
  }

  /**
   * Start 30-second timer for play again responses
   */
  startPlayAgainTimer(gameId) {
    // Clear any existing timer
    if (playAgainTimers.has(gameId)) {
      clearTimeout(playAgainTimers.get(gameId));
    }

    console.log(`[PLAY AGAIN] Starting 30-second timer for game ${gameId}`);

    const timer = setTimeout(async () => {
      await this.processPlayAgainResponses(gameId);
    }, 30000); // 30 seconds

    playAgainTimers.set(gameId, timer);
  }

  /**
   * Process play again responses after timer expires
   */
  async processPlayAgainResponses(gameId) {
    try {
      console.log(`[PLAY AGAIN] Processing responses for game ${gameId}`);

      const responses = playAgainResponses.get(gameId);
      if (!responses || responses.size === 0) {
        console.log(`[PLAY AGAIN] No responses for game ${gameId}, cleaning up`);
        this.cleanup(gameId);
        return;
      }

      // Get original game state
      const originalGame = await GameService.getGame(gameId);
      if (!originalGame) {
        console.error(`[PLAY AGAIN] Original game ${gameId} not found`);
        this.cleanup(gameId);
        return;
      }

      // Get all human players from original game (only those who haven't left)
      const originalPlayers = await prisma.gamePlayer.findMany({
        where: { 
          gameId, 
          isHuman: true,
          leftAt: null // Only players who haven't left
        },
        include: { user: true },
        orderBy: { seatIndex: 'asc' }
      });

      // Create new game with same settings
      const newGameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const newGameData = {
        id: newGameId,
        createdById: originalGame.createdById,
        mode: originalGame.mode,
        format: originalGame.format,
        gimmickVariant: originalGame.gimmickVariant,
        isRated: originalGame.isRated,
        maxPoints: originalGame.maxPoints,
        minPoints: originalGame.minPoints,
        buyIn: originalGame.buyIn,
        nilAllowed: originalGame.nilAllowed,
        blindNilAllowed: originalGame.blindNilAllowed,
        specialRules: originalGame.specialRules,
        eventId: originalGame.eventId,
        isLeague: originalGame.isLeague
      };

      // Create the new game
      const newGame = await GameService.createGame(newGameData);
      console.log(`[PLAY AGAIN] Created new game ${newGameId}`);

      // Seat players who responded in their original seats
      const respondingPlayers = [];
      for (const [userId, response] of responses.entries()) {
        const originalPlayer = originalPlayers.find(p => p.userId === userId);
        if (originalPlayer) {
          try {
            await GameService.joinGame(newGameId, userId, response.seatIndex);
            respondingPlayers.push({
              userId,
              seatIndex: response.seatIndex,
              username: originalPlayer.user?.username || 'Player'
            });
            console.log(`[PLAY AGAIN] Seated user ${userId} at seat ${response.seatIndex} in new game`);
          } catch (error) {
            console.error(`[PLAY AGAIN] Error seating user ${userId}:`, error);
          }
        }
      }

      // Update Redis cache
      const redisGameState = (await import('../../../services/RedisGameStateService.js')).default;
      const freshGameState = await GameService.getFullGameStateFromDatabase(newGameId);
      if (freshGameState) {
        await redisGameState.setGameState(newGameId, freshGameState);
      }

      // Emit new_game_created event to all players who responded
      for (const player of respondingPlayers) {
        const socket = Array.from(this.io.sockets.sockets.values()).find(
          s => s.userId === player.userId
        );
        if (socket) {
          socket.emit('new_game_created', {
            oldGameId: gameId,
            newGameId: newGameId,
            seatIndex: player.seatIndex
          });
          console.log(`[PLAY AGAIN] Emitted new_game_created to user ${player.userId}`);
        }
      }

      // Also emit to the game room for any remaining players
      this.io.to(gameId).emit('new_game_created', {
        oldGameId: gameId,
        newGameId: newGameId
      });

      // Clean up old game tracking
      this.cleanup(gameId);

      console.log(`[PLAY AGAIN] Successfully created new game ${newGameId} with ${respondingPlayers.length} players`);

    } catch (error) {
      console.error('[PLAY AGAIN] Error processing responses:', error);
      this.cleanup(gameId);
    }
  }

  /**
   * Broadcast play again status to all players in the game
   */
  async broadcastPlayAgainStatus(gameId) {
    try {
      const responses = playAgainResponses.get(gameId);
      if (!responses) return;

      // Get all human players
      const players = await prisma.gamePlayer.findMany({
        where: { gameId, isHuman: true },
        select: { userId: true, seatIndex: true }
      });

      const status = {
        gameId,
        responded: Array.from(responses.keys()),
        totalPlayers: players.length,
        respondedCount: responses.size
      };

      this.io.to(gameId).emit('play_again_status', status);
    } catch (error) {
      console.error('[PLAY AGAIN] Error broadcasting status:', error);
    }
  }

  /**
   * Clean up tracking for a game
   */
  cleanup(gameId) {
    if (playAgainTimers.has(gameId)) {
      clearTimeout(playAgainTimers.get(gameId));
      playAgainTimers.delete(gameId);
    }
    playAgainResponses.delete(gameId);
    console.log(`[PLAY AGAIN] Cleaned up tracking for game ${gameId}`);
  }

  /**
   * Handle player leaving during play again wait
   */
  async handlePlayerLeft(gameId, userId) {
    const responses = playAgainResponses.get(gameId);
    if (responses) {
      responses.delete(userId);
      console.log(`[PLAY AGAIN] Removed user ${userId} from responses for game ${gameId}`);
      
      // If no responses left, clean up
      if (responses.size === 0) {
        this.cleanup(gameId);
      } else {
        this.broadcastPlayAgainStatus(gameId);
      }
    }
  }
}

export { PlayAgainHandler };

