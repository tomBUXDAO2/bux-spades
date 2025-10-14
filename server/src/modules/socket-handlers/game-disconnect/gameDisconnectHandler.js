import { GameService } from '../../../services/GameService.js';
import { PlayerTimerService } from '../../../services/PlayerTimerService.js';
import { gameManager } from '../../../services/GameManager.js';
import redisGameState from '../../../services/RedisGameStateService.js';

class GameDisconnectHandler {
  constructor(io, socket) {
    this.io = io;
    this.socket = socket;
    this.playerTimerService = new PlayerTimerService();
    this.playerTimerService.setIO(this.io);
  }

  /**
   * Handle when a player disconnects from an active game
   * @param {string} gameId - The game ID
   * @param {string} userId - The user ID who disconnected
   */
  async handlePlayerDisconnect(gameId, userId) {
    try {
      console.log(`[GAME DISCONNECT] Handling disconnect for user ${userId} from game ${gameId}`);
      
      // Get current game state
      const game = await GameService.getGame(gameId);
      if (!game) {
        console.log(`[GAME DISCONNECT] Game ${gameId} not found`);
        return;
      }

      // Get player info
      const player = await GameService.getPlayerInGame(gameId, userId);
      if (!player) {
        console.log(`[GAME DISCONNECT] Player ${userId} not found in game ${gameId}`);
        return;
      }

      console.log(`[GAME DISCONNECT] Player ${userId} (seat ${player.seatIndex}) disconnected from game ${gameId}, status: ${game.status}`);

      // Mark player as disconnected in database
      await GameService.markPlayerDisconnected(gameId, userId);
      console.log(`[GAME DISCONNECT] Marked player ${userId} as disconnected in database`);

      // Update Redis cache to reflect disconnected state
      await this.updateRedisGameState(gameId);

      // Handle different game phases
      if (game.status === 'PLAYING' && game.currentPlayer === userId) {
        console.log(`[GAME DISCONNECT] Player ${userId} is current player, starting auto-play timer`);
        // Start timer for auto-play if it's their turn
        this.playerTimerService.startPlayerTimer(gameId, userId, player.seatIndex, 'playing');
      } else if (game.status === 'BIDDING' && game.currentPlayer === userId) {
        console.log(`[GAME DISCONNECT] Player ${userId} is current player, starting auto-bid timer`);
        // Start timer for auto-bid if it's their turn to bid
        this.playerTimerService.startPlayerTimer(gameId, userId, player.seatIndex, 'bidding');
      }

      // Emit player disconnected event to other players
      this.io.to(gameId).emit('player_disconnected', {
        gameId,
        userId,
        seatIndex: player.seatIndex,
        message: 'Player disconnected and will auto-play'
      });

      // Send system message
      try {
        const { SystemMessageHandler } = await import('../chat/systemMessageHandler.js');
        const systemHandler = new SystemMessageHandler(this.io, this.socket);
        systemHandler.handlePlayerDisconnected(gameId, player.user?.username || 'Player');
      } catch (err) {
        console.error('[GAME DISCONNECT] Error sending system message:', err);
      }

      console.log(`[GAME DISCONNECT] Successfully handled disconnect for user ${userId} from game ${gameId}`);
    } catch (error) {
      console.error('[GAME DISCONNECT] Error handling player disconnect:', error);
    }
  }

  /**
   * Update Redis game state to reflect disconnected player
   */
  async updateRedisGameState(gameId) {
    try {
      const freshGameState = await GameService.getFullGameStateFromDatabase(gameId);
      if (freshGameState) {
        await redisGameState.setGameState(gameId, freshGameState);
        console.log(`[GAME DISCONNECT] Updated Redis cache for game ${gameId}`);
      }
    } catch (error) {
      console.error('[GAME DISCONNECT] Error updating Redis cache:', error);
    }
  }
}

export { GameDisconnectHandler };
