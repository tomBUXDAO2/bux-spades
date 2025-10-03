import { DatabaseGameJoinHandler } from '../modules/socket-handlers/game-join/databaseGameJoinHandler.js';
import { DatabaseCardPlayHandler } from '../modules/socket-handlers/card-play/databaseCardPlayHandler.js';
import { GameChatHandler } from '../modules/socket-handlers/chat/gameChatHandler.js';
import { LobbyChatHandler } from '../modules/socket-handlers/lobby/lobbyChatHandler.js';
import { FriendBlockHandler } from '../modules/socket-handlers/friends/friendBlockHandler.js';
import { DatabaseGameService } from '../services/DatabaseGameService.js';
import { DatabaseGameEngine } from '../services/DatabaseGameEngine.js';
import jwt from 'jsonwebtoken';

/**
 * DATABASE-FIRST SOCKET HANDLERS
 * No in-memory game management
 */
export function setupDatabaseSocketHandlers(io) {
  // Global lobby chat handler
  const lobbyChatHandler = new LobbyChatHandler(io, null);

  io.on('connection', (socket) => {
    console.log(`[DB SOCKET] Client connected: ${socket.id}`);

    // Authenticate socket with JWT token
    socket.on('authenticate', (data) => {
      try {
        const { token } = data;
        if (!token) {
          socket.emit('auth_error', { message: 'No token provided' });
          return;
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
        socket.userId = decoded.userId;
        socket.authenticated = true;
        
        console.log(`[DB SOCKET] User authenticated: ${decoded.userId}`);
        socket.emit('authenticated', { userId: decoded.userId });

        // Handle user coming online for lobby
        lobbyChatHandler.socket = socket;
        lobbyChatHandler.handleUserOnline();
      } catch (error) {
        console.error('[DB SOCKET] Authentication error:', error);
        socket.emit('auth_error', { message: 'Invalid token' });
      }
    });

    // Initialize database-first handlers
    const gameJoinHandler = new DatabaseGameJoinHandler(io, socket);
    const cardPlayHandler = new DatabaseCardPlayHandler(io, null);
    const gameChatHandler = new GameChatHandler(io, socket);
    const friendBlockHandler = new FriendBlockHandler(io, socket);

    // Game management events
    socket.on('join_game', (data) => {
      if (!socket.authenticated) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      gameJoinHandler.handleJoinGame(data);
    });

    socket.on('leave_game', (data) => {
      if (!socket.authenticated) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      gameJoinHandler.handleLeaveGame(data);
    });

    socket.on('invite_bot', (data) => {
      console.log('[SOCKET] Received invite_bot event:', data);
      if (!socket.authenticated) {
        console.log('[SOCKET] User not authenticated for invite_bot');
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      console.log('[SOCKET] Calling handleInviteBot with data:', data);
      gameJoinHandler.handleInviteBot(data);
    });

    socket.on('start_game', (data) => {
      if (!socket.authenticated) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      gameJoinHandler.handleStartGame(data);
    });

    socket.on('get_game_state', async (data) => {
      try {
        if (!socket.authenticated) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        const { gameId } = data;
        const gameState = await DatabaseGameEngine.getGameState(gameId);
        
        socket.emit('game_state', {
          gameId,
          gameState
        });
      } catch (error) {
        console.error('[DB SOCKET] Error getting game state:', error);
        socket.emit('error', { message: 'Failed to get game state' });
      }
    });

    socket.on('get_active_games', async () => {
      try {
        if (!socket.authenticated) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        const games = await DatabaseGameService.getActiveGames();
        socket.emit('active_games', { games });
      } catch (error) {
        console.error('[DB SOCKET] Error getting active games:', error);
        socket.emit('error', { message: 'Failed to get active games' });
      }
    });

    // Card play events - handled by main socketHandlers.js
    // socket.on('play_card', (data) => {
    //   if (!socket.authenticated) {
    //     socket.emit('error', { message: 'Not authenticated' });
    //     return;
    //   }
    //   cardPlayHandler.handleCardPlay(socket, data);
    // });

    // Chat events
    socket.on('game_chat_message', (data) => {
      if (!socket.authenticated) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      gameChatHandler.handleGameChat(data);
    });

    socket.on('lobby_chat_message', (data) => {
      if (!socket.authenticated) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      lobbyChatHandler.handleLobbyChat(data);
    });

    // Friend/block events
    socket.on('add_friend', (data) => {
      if (!socket.authenticated) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      friendBlockHandler.handleAddFriend(data);
    });

    socket.on('remove_friend', (data) => {
      if (!socket.authenticated) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      friendBlockHandler.handleRemoveFriend(data);
    });

    socket.on('block_user', (data) => {
      if (!socket.authenticated) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      friendBlockHandler.handleBlockUser(data);
    });

    socket.on('unblock_user', (data) => {
      if (!socket.authenticated) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      friendBlockHandler.handleUnblockUser(data);
    });

    // Disconnect handler
    socket.on('disconnect', () => {
      console.log(`[DB SOCKET] Client disconnected: ${socket.id}`);
      
      if (socket.userId) {
        lobbyChatHandler.handleUserOffline();
      }
    });

    // Error handler
    socket.on('error', (error) => {
      console.error(`[DB SOCKET] Socket error for ${socket.id}:`, error);
    });
  });

  console.log('[DB SOCKET] Database-first socket handlers initialized');
}
