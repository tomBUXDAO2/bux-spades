import { GameService } from '../../../services/GameService.js';
import { gameManager } from '../../../services/GameManager.js';
import { prisma } from '../../../config/database.js';

class GameChatHandler {
  constructor(io, socket) {
    this.io = io;
    this.socket = socket;
    this.gameManager = gameManager;
  }

  async handleGameMessage(data) {
    try {
      console.log(`[GAME CHAT] handleGameMessage called with data:`, data);
      const { gameId, message } = data;
      const userId = this.socket.userId || data.userId;
      
      console.log(`[GAME CHAT] Extracted gameId: ${gameId}, userId: ${userId}`);
      
      if (!userId) {
        console.log(`[GAME CHAT] ERROR: No userId found`);
        this.socket.emit('error', { message: 'User not authenticated' });
        return;
      }

      // Extract the actual message text from the message object
      const messageText = message.message || message;
      if (!messageText || messageText.trim().length === 0) {
        this.socket.emit('error', { message: 'Message cannot be empty' });
        return;
      }

      console.log(`[GAME CHAT] User ${userId} sending message to game ${gameId}: ${messageText}`);
      
      // Verify user is in the game by checking database state
      const gameState = await GameService.getGameStateForClient(gameId);
      if (!gameState) {
        console.log(`[GAME CHAT] ERROR: Game not found in database`);
        this.socket.emit('error', { message: 'Game not found' });
        return;
      }

      // Check if game.players exists and is an array
      if (!gameState.players || !Array.isArray(gameState.players)) {
        console.log(`[GAME CHAT] ERROR: Game players is not an array:`, gameState.players);
        this.socket.emit('error', { message: 'Invalid game state' });
        return;
      }

      const player = gameState.players.find(p => p && p.userId === userId);
      console.log(`[GAME CHAT] Player found:`, !!player);
      if (!player) {
        console.log(`[GAME CHAT] ERROR: Player not found in game`);
        this.socket.emit('error', { message: 'You are not in this game' });
        return;
      }

      // Check if this is a system message
      if (message.userId === 'system') {
        // Handle system messages differently
        const chatMessage = {
          id: message.id || `sys_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          userId: 'system',
          userName: 'System',
          userAvatar: null,
          message: messageText.trim(),
          timestamp: new Date().toISOString(),
          gameId: gameId,
          isGameMessage: true,
          isSystemMessage: true
        };

        // Broadcast system message to all players in the game
        this.io.to(gameId).emit('game_message', {
          gameId,
          message: chatMessage
        });

        console.log(`[GAME CHAT] Broadcasted system message to game ${gameId}`);
        return;
      }

      // Get user info from database for regular messages
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, avatarUrl: true }
      });

      if (!user) {
        this.socket.emit('error', { message: 'User not found' });
        return;
      }

      // Create chat message object
      const chatMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: user.id,
        userName: user.username,
        userAvatar: user.avatarUrl,
        message: messageText.trim(),
        timestamp: new Date().toISOString(),
        gameId: gameId,
        isGameMessage: true
      };

      // Chat messages are kept in-memory only (no database persistence)
      console.log(`[GAME CHAT] Created in-memory message: ${chatMessage.id}`);

      // Broadcast message to all players in the game
      this.io.to(gameId).emit('game_message', {
        gameId,
        message: chatMessage
      });

      console.log(`[GAME CHAT] Broadcasted message to game ${gameId}`);
      
    } catch (error) {
      console.error('[GAME CHAT] Error:', error);
      this.socket.emit('error', { message: 'Failed to send message' });
    }
  }

  async handleGetGameMessages(data) {
    try {
      const { gameId, limit = 50 } = data;
      const userId = this.socket.userId || data.userId;
      
      if (!userId) {
        this.socket.emit('error', { message: 'User not authenticated' });
        return;
      }

      console.log(`[GAME CHAT] User ${userId} requesting messages for game ${gameId}`);
      
      // Verify user is in the game
      const game = this.gameManager.getGame(gameId);
      if (!game) {
        this.socket.emit('error', { message: 'Game not found' });
        return;
      }

      const player = game.players.find(p => p && p.userId === userId);
      if (!player) {
        this.socket.emit('error', { message: 'You are not in this game' });
        return;
      }

      // Chat messages are in-memory only, so return empty array
      const formattedMessages = [];

      this.socket.emit('game_messages', {
        gameId,
        messages: formattedMessages
      });

      console.log(`[GAME CHAT] Sent ${formattedMessages.length} messages to user ${userId} (in-memory only)`);
      
    } catch (error) {
      console.error('[GAME CHAT] Error:', error);
      this.socket.emit('error', { message: 'Failed to get messages' });
    }
  }
}

export { GameChatHandler };
