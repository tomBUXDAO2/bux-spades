import { GameService } from '../../../services/GameService.js';
import { BotService } from '../../../services/BotService.js';

/**
 * DATABASE-FIRST GAME JOIN HANDLER
 * No in-memory state management - database is single source of truth
 */
class GameJoinHandler {
  constructor(io, socket) {
    this.io = io;
    this.socket = socket;
    this.botService = new BotService();
  }

  async handleRemoveBot(data) {
    try {
      const { gameId, seatIndex } = data;
      const userId = this.socket.userId || data.userId;

      console.log(`[REMOVE BOT] User ${userId} attempting to remove bot from seat ${seatIndex} in game ${gameId}`);

      if (!userId) {
        this.socket.emit('error', { message: 'User not authenticated' });
        return;
      }

      // Get current game state from DB
      const gameState = await GameService.getGameStateForClient(gameId);
      if (!gameState) {
        this.socket.emit('error', { message: 'Game not found' });
        return;
      }

      // Ensure requesting user is a player in game
      const requester = (gameState.players || []).find(p => p && (p.id === userId || p.userId === userId));
      if (!requester) {
        this.socket.emit('error', { message: 'You are not in this game' });
        return;
      }

      // Validate target seat has a bot (match by seatIndex, not array index)
      const target = (gameState.players || []).find(p => p && p.seatIndex === seatIndex);
      if (!target) {
        this.socket.emit('error', { message: 'No player in this seat' });
        return;
      }
      if (target.type !== 'bot') {
        this.socket.emit('error', { message: 'This seat is occupied by a human player' });
        return;
      }

      // Remove GamePlayer row and delete the bot user in DB
      const { prisma } = await import('../../../config/database.js');
      await prisma.$transaction(async (tx) => {
        await tx.gamePlayer.deleteMany({
          where: { gameId, userId: target.id }
        });
        await tx.user.deleteMany({ where: { id: target.id } });
      });

      // Fetch updated state and broadcast
      const updatedGameState = await GameService.getGameStateForClient(gameId);
      try {
        const { SystemMessageHandler } = await import('../chat/systemMessageHandler.js');
        const system = new SystemMessageHandler(this.io, this.socket);
        system.handleBotRemoved(gameId, target.username);
      } catch {}
      this.io.to(gameId).emit('game_update', {
        gameId,
        gameState: updatedGameState
      });

      // Clean any orphaned bot users
      try {
        const { GameCleanupService } = await import('../../../services/GameCleanupService.js');
        await GameCleanupService.deleteOrphanBotUsers();
      } catch {}

      console.log(`[REMOVE BOT] Bot removed from seat ${seatIndex} in game ${gameId}`);
    } catch (error) {
      console.error('[REMOVE BOT] Error in handleRemoveBot:', error);
      this.socket.emit('error', { message: 'Failed to remove bot' });
    }
  }

  async handleJoinGame(data) {
    try {
      const { gameId } = data;
      const userId = this.socket.userId || data.userId;
      
      console.log(`[GAME JOIN] User ${userId} attempting to join game ${gameId}`);
      
      if (!userId) {
        this.socket.emit('error', { message: 'User not authenticated' });
        return;
      }
      
      // Get game state from database (single source of truth)
      const gameState = await GameService.getGameStateForClient(gameId);
      if (!gameState) {
        this.socket.emit('error', { message: 'Game not found' });
        return;
      }

      // Check if player is in the game
      const player = gameState.players.find(p => p.id === userId);
      if (!player) {
        this.socket.emit('error', { message: 'You are not in this game. Please join via the lobby first.' });
        return;
      }

      // Join the socket room
      this.socket.join(gameId);
      console.log(`[GAME JOIN] User ${userId} joined room for game ${gameId}`);

      // Emit game_joined event with current database state
      this.socket.emit('game_joined', {
        gameId,
        gameState
      });
      
      // Also emit to the room for other players
      this.io.to(gameId).emit('game_joined', {
        gameId,
        gameState
      });
      
      console.log(`[GAME JOIN] User ${userId} successfully joined game ${gameId}`);
      
    } catch (error) {
      console.error('[GAME JOIN] Error in handleJoinGame:', error);
      this.socket.emit('error', { message: 'Failed to join game' });
    }
  }

  async handleInviteBot(data) {
    try {
      const { gameId, seatIndex } = data;
      const userId = this.socket.userId || data.userId;
      
      console.log(`[INVITE BOT] User ${userId} attempting to invite bot to seat ${seatIndex} in game ${gameId}`);
      
      if (!userId) {
        this.socket.emit('error', { message: 'User not authenticated' });
        return;
      }
      
      // Get current game state
      const gameState = await GameService.getGameStateForClient(gameId);
      if (!gameState) {
        this.socket.emit('error', { message: 'Game not found' });
        return;
      }
      
      // Check if user is in the game OR is the game creator
      const player = gameState.players.find(p => p.id === userId);
      const isCreator = gameState.createdById === userId;
      if (!player && !isCreator) {
        this.socket.emit('error', { message: 'You are not in this game' });
        return;
      }
      
      // Check if seat is already occupied
      if (gameState.players[seatIndex]) {
        this.socket.emit('error', { message: 'Seat is already occupied' });
        return;
      }
      
      // Create bot player
      const botPlayer = await this.botService.createBotPlayer(gameId, seatIndex);
      console.log(`[INVITE BOT] Created bot player for seat ${seatIndex}:`, botPlayer);
      
      // CRITICAL: Update Redis cache with full game state (don't clear it!)
      const redisGameState = await import('../../../services/RedisGameStateService.js');
      const updatedGameState = await GameService.getFullGameStateFromDatabase(gameId);
      if (updatedGameState) {
        await redisGameState.default.setGameState(gameId, updatedGameState);
        console.log(`[INVITE BOT] Updated Redis cache with full game state`);
      }
      console.log(`[INVITE BOT] Updated game state after bot creation:`, {
        gameId,
        players: updatedGameState?.players || [],
        seatIndex,
        botPlayer: botPlayer
      });
      
      // Emit system message and game update to all players
      try {
        const { SystemMessageHandler } = await import('../chat/systemMessageHandler.js');
        const system = new SystemMessageHandler(this.io, this.socket);
        system.handleBotAdded(gameId, botPlayer.username, seatIndex);
      } catch {}
      
      if (updatedGameState) {
        this.io.to(gameId).emit('game_update', {
          gameId,
          gameState: updatedGameState
        });
      }
      
      console.log(`[INVITE BOT] Bot successfully added to seat ${seatIndex} in game ${gameId}`);
      
    } catch (error) {
      console.error('[INVITE BOT] Error in handleInviteBot:', error);
      this.socket.emit('error', { message: 'Failed to invite bot' });
    }
  }

  async handleLeaveGame(data) {
    try {
      const { gameId } = data;
      const userId = this.socket.userId || data.userId;
      
      console.log(`[GAME LEAVE] User ${userId} attempting to leave game ${gameId}`);
      
      if (!userId) {
        this.socket.emit('error', { message: 'User not authenticated' });
        return;
      }
      
      // Import services
      const { GameService } = await import('../../../services/GameService.js');
      const { GameCleanupService } = await import('../../../services/GameCleanupService.js');
      
      // Remove player from database
      await GameService.leaveGame(gameId, userId);
      console.log(`[GAME LEAVE] User ${userId} removed from database for game ${gameId}`);
      
      // Check if game should be cleaned up (unrated games with no human players)
      // Use DB-only check to avoid depending on derived state
      console.log(`[GAME LEAVE] Checking if game ${gameId} should be cleaned up...`);
      const shouldCleanup = await GameCleanupService.checkAndCleanupGame(gameId, null);
      console.log(`[GAME LEAVE] Cleanup result for game ${gameId}: ${shouldCleanup}`);
      
      if (shouldCleanup) {
        console.log(`[GAME LEAVE] Game ${gameId} was cleaned up due to no human players`);
        // Emit game deleted event to all players
        this.io.to(gameId).emit('game_deleted', { gameId });
        // Clean up any remaining orphaned bot users
        try {
          await GameCleanupService.deleteOrphanBotUsers();
        } catch (error) {
          console.error('[GAME LEAVE] Error cleaning up orphaned bot users:', error);
        }
        return;
      } else {
        console.log(`[GAME LEAVE] Game ${gameId} was NOT cleaned up - either rated or has human players remaining`);
      }

      // Leave the socket room
      this.socket.leave(gameId);
      console.log(`[GAME LEAVE] User ${userId} left room for game ${gameId}`);

      // Emit to other players in the room and broadcast updated state
      const updatedState = await GameService.getGameStateForClient(gameId);
      this.io.to(gameId).emit('player_left', { gameId, userId });
      if (updatedState) {
        this.io.to(gameId).emit('game_update', { gameId, gameState: updatedState });
      }

      // Clean any orphaned bot users
      try {
        const { GameCleanupService } = await import('../../../services/GameCleanupService.js');
        await GameCleanupService.deleteOrphanBotUsers();
      } catch {}
      
    } catch (error) {
      console.error('[GAME LEAVE] Error in handleLeaveGame:', error);
      this.socket.emit('error', { message: 'Failed to leave game' });
    }
  }
}

export { GameJoinHandler };