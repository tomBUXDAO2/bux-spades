import redisGameState from '../../../services/RedisGameStateService.js';

class ReadyHandler {
  constructor(io, socket) {
    this.io = io;
    this.socket = socket;
  }

  async handleToggleReady(data) {
    try {
      const { gameId, ready } = data;
      const userId = this.socket.userId;
      
      console.log(`[READY] User ${userId} toggled ready to ${ready} for game ${gameId}`);
      
      // Get current ready states from Redis
      let readyStates = await redisGameState.getPlayerReady(gameId) || {};
      readyStates[userId] = ready;
      
      // Save to Redis
      await redisGameState.setPlayerReady(gameId, readyStates);
      
      console.log(`[READY] Updated ready states for game ${gameId}:`, readyStates);
      
      // Emit to all players in game
      this.io.to(gameId).emit('player_ready_update', {
        gameId,
        readyStates
      });
    } catch (error) {
      console.error('[READY] Error handling toggle ready:', error);
    }
  }
}

export default ReadyHandler;

