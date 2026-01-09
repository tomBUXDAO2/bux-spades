// CONSOLIDATED: GameManager removed - using GameService directly
import { GameJoinHandler } from '../modules/socket-handlers/game-join/gameJoinHandler.js';
import { GameStartHandler } from '../modules/socket-handlers/game-start/gameStartHandler.js';
import { BiddingHandler } from '../modules/socket-handlers/bidding/biddingHandler.js';
import { CardPlayHandler } from '../modules/socket-handlers/card-play/cardPlayHandler.js';
import { GameChatHandler } from '../modules/socket-handlers/chat/gameChatHandler.js';
import { BotManagementHandler } from '../modules/socket-handlers/bot-management/botManagementHandler.js';
import ReadyHandler from '../modules/socket-handlers/ready/readyHandler.js';
import { LobbyChatHandler } from '../modules/socket-handlers/lobby/lobbyChatHandler.js';
import { FriendBlockHandler } from '../modules/socket-handlers/friends/friendBlockHandler.js';
import { PlayAgainHandler } from '../modules/socket-handlers/play-again/playAgainHandler.js';
import redisSessionService from '../services/RedisSessionService.js';
import { playerTimerService } from '../services/PlayerTimerService.js';
import jwt from 'jsonwebtoken';

export function setupSocketHandlers(io) {
  // Global lobby chat handler to track online users
  const lobbyChatHandler = new LobbyChatHandler(io, null);

  io.on('connection', (socket) => {
      // NUCLEAR: No logging for performance
    // NUCLEAR: No logging for performance

    // Authenticate socket with JWT token
    socket.on('authenticate', async (data) => {
      try {
        const { token } = data;
        if (!token) {
          socket.emit('auth_error', { message: 'No token provided' });
          return;
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
        const userId = decoded.userId;
        
        // Check for existing session (single device login enforcement)
        const previousSession = await redisSessionService.getUserSession(userId);
        
        if (previousSession && previousSession.socketId !== socket.id) {
          console.log(`[SESSION] User ${userId} logging in from new device. Force logging out previous session ${previousSession.socketId}`);
          
          // Find and disconnect the old socket
          const oldSocket = io.sockets.sockets.get(previousSession.socketId);
          if (oldSocket) {
            // Emit force logout event to old device
            oldSocket.emit('force_logout', { 
              reason: 'multiple_logins',
              message: 'You have been logged out because you logged in from another device.'
            });
            // Disconnect old socket
            oldSocket.disconnect(true);
            console.log(`[SESSION] Disconnected old socket ${previousSession.socketId} for user ${userId}`);
          }
        }
        
        // Set up new session
        socket.userId = userId;
        socket.authenticated = true;
        
        // Validate active game exists in database AND user is actually a player before sending to client
        let validActiveGameId = null;
        if (previousSession?.activeGameId) {
          const { GameService } = await import('../services/GameService.js');
          const gameExists = await GameService.getGame(previousSession.activeGameId);
          
          // CRITICAL FIX: Don't redirect to FINISHED games
          if (gameExists && gameExists.status !== 'FINISHED') {
            // Check if user is actually a player in this game (not left)
            const { prisma } = await import('../config/database.js');
            const playerInGame = await prisma.gamePlayer.findFirst({
              where: {
                gameId: previousSession.activeGameId,
                userId: userId
                // Don't filter by leftAt - we want to find players even if they disconnected
              }
            });
            
            if (playerInGame) {
              validActiveGameId = previousSession.activeGameId;
              console.log(`[SESSION] User ${userId} has valid active game: ${validActiveGameId}`);
              
              // CRITICAL: Mark player as reconnected if they were previously disconnected
              if (playerInGame.leftAt) {
                console.log(`[SESSION] User ${userId} reconnecting to game ${validActiveGameId} - marking as reconnected`);
                await GameService.markPlayerReconnected(validActiveGameId, userId);
                playerTimerService.clearTimerForPlayer(validActiveGameId, userId);
              }
            } else {
              console.log(`[SESSION] User ${userId} is not a player in game ${previousSession.activeGameId}, clearing it`);
            }
          } else if (gameExists && gameExists.status === 'FINISHED') {
            console.log(`[SESSION] User ${userId} had finished game ${previousSession.activeGameId}, not redirecting`);
          } else {
            console.log(`[SESSION] User ${userId} had stale active game ${previousSession.activeGameId}, clearing it`);
          }
        }
        
        // Store session in Redis with validated active game info
        const sessionData = {
          socketId: socket.id,
          activeGameId: validActiveGameId
        };
        
        await redisSessionService.setUserSession(userId, sessionData);
        
        console.log(`[SOCKET] User authenticated: ${userId}`);
        console.log(`[SOCKET] Socket after auth - userId: ${socket.userId}, authenticated: ${socket.authenticated}`);
        
        // Send authentication success with active game info
        socket.emit('authenticated', { 
          userId: userId,
          activeGameId: sessionData.activeGameId
        });

        // Handle user coming online for lobby
        lobbyChatHandler.socket = socket;
        lobbyChatHandler.handleUserOnline();
      } catch (error) {
        console.error('[SOCKET] Authentication error:', error);
        console.error('[SOCKET] Error details:', {
          name: error.name,
          message: error.message,
          expiredAt: error.expiredAt,
          jwtSecretSet: !!process.env.JWT_SECRET
        });
        
        let errorMessage = 'Invalid token';
        if (error.name === 'TokenExpiredError') {
          errorMessage = 'Token expired';
        } else if (error.name === 'JsonWebTokenError') {
          errorMessage = `Invalid token: ${error.message}`;
        }
        
        socket.emit('auth_error', { message: errorMessage });
      }
    });

    // Initialize handlers
    console.log(`[SOCKET] Initializing handlers for socket ${socket.id}`);
    const gameJoinHandler = new GameJoinHandler(io, socket);
    const gameStartHandler = new GameStartHandler(io, socket);
    const biddingHandler = new BiddingHandler(io, socket);
    const cardPlayHandler = new CardPlayHandler(io, socket);
    const gameChatHandler = new GameChatHandler(io, socket);
    const botManagementHandler = new BotManagementHandler(io, socket);
    const readyHandler = new ReadyHandler(io, socket);
    const friendBlockHandler = new FriendBlockHandler(io, socket);
    const playAgainHandler = new PlayAgainHandler(io, socket);
    console.log(`[SOCKET] Handlers initialized for socket ${socket.id}`);

    // Simple per-socket debounce map for join_game to avoid rapid repeat loops
    const joinDebounce = new Map(); // gameId -> timestamp

    // Game join/leave events
    socket.on('join_game', (data) => {
      try {
        const gameId = data?.gameId;
        const now = Date.now();
        const last = gameId ? joinDebounce.get(gameId) : undefined;
        if (gameId && last && (now - last) < 1000) {
          console.log(`[SOCKET] Debounced join_game for ${gameId} on socket ${socket.id}`);
          return;
        }
        if (gameId) joinDebounce.set(gameId, now);
      } catch {}
      gameJoinHandler.handleJoinGame(data);
    });
    socket.on('leave_game', (data) => gameJoinHandler.handleLeaveGame(data));
    
    // Game start event
    socket.on('start_game', (data) => gameStartHandler.handleStartGame(data));
    
    // Ready system event
    socket.on('toggle_ready', (data) => readyHandler.handleToggleReady(data));
    
    // Bidding events
    socket.on('make_bid', (data) => biddingHandler.handleMakeBid(data));
    
    // Card play events
    socket.on('play_card', (data) => cardPlayHandler.handlePlayCard(data));

    // Chat events
    socket.on('game_message', (data) => {
      gameChatHandler.handleGameMessage(data);
    });
    socket.on('get_game_messages', (data) => gameChatHandler.handleGetGameMessages(data));

    // Bot management events
    socket.on('add_bot', (data) => botManagementHandler.handleAddBot(data));
    socket.on('remove_bot', (data) => botManagementHandler.handleRemoveBot(data));
    socket.on('fill_with_bots', (data) => botManagementHandler.handleFillWithBots(data));
    
    // Play again event
    socket.on('play_again', (data) => playAgainHandler.handlePlayAgain(data));
    
    // Hand summary continue event - start new round
    socket.on('hand_summary_continue', async (data) => {
      console.log('[SOCKET] hand_summary_continue event received:', data);
      if (!socket.authenticated) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      
      try {
        const { gameId } = data;
        if (!gameId) {
          socket.emit('error', { message: 'Game ID required' });
          return;
        }
        
        // Import TrickCompletionService and start new round
        const { TrickCompletionService } = await import('../services/TrickCompletionService.js');
        await TrickCompletionService.startNewRound(gameId, io);
        
        console.log(`[SOCKET] Started new round for game ${gameId}`);
      } catch (error) {
        console.error('[SOCKET] Error handling hand_summary_continue:', error);
        socket.emit('error', { message: 'Failed to start new round' });
      }
    });
    socket.on('invite_bot', async (data) => {
      console.log('[SOCKET] Received invite_bot event:', data);
      if (!socket.authenticated) {
        console.log('[SOCKET] User not authenticated for invite_bot');
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      console.log('[SOCKET] Calling handleInviteBot with data:', data);
      await gameJoinHandler.handleInviteBot(data);
    });
    socket.on('remove_bot_db', async (data) => {
      console.log('[SOCKET] Received remove_bot_db event:', data);
      if (!socket.authenticated) {
        console.log('[SOCKET] User not authenticated for remove_bot_db');
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      await gameJoinHandler.handleRemoveBot(data);
    });

    // Lobby chat events
    socket.on('lobby_message', (data) => {
      const handler = new LobbyChatHandler(io, socket);
      handler.handleLobbyMessage(data);
    });


    // Emoji reaction events
    socket.on('emoji_reaction', (data) => {
      if (!socket.authenticated) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      
      const { gameId, playerId, emoji } = data;
      if (!gameId || !playerId || !emoji) {
        socket.emit('error', { message: 'Missing required fields' });
        return;
      }
      
      // Broadcast emoji reaction to all players in the game
      io.to(gameId).emit('emoji_reaction', {
        playerId: playerId,
        emoji: emoji
      });
      
      console.log(`[EMOJI] User ${socket.userId} sent emoji reaction ${emoji} to player ${playerId} in game ${gameId}`);
    });
    
    socket.on('send_emoji', (data) => {
      if (!socket.authenticated) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      
      const { gameId, fromPlayerId, toPlayerId, emoji } = data;
      if (!gameId || !fromPlayerId || !toPlayerId || !emoji) {
        socket.emit('error', { message: 'Missing required fields' });
        return;
      }
      
      // Verify the sender matches the authenticated user
      if (fromPlayerId !== socket.userId) {
        socket.emit('error', { message: 'Unauthorized' });
        return;
      }
      
      // Broadcast targeted emoji to all players in the game
      io.to(gameId).emit('send_emoji', {
        fromPlayerId: fromPlayerId,
        toPlayerId: toPlayerId,
        emoji: emoji
      });
      
      console.log(`[EMOJI] User ${fromPlayerId} sent emoji ${emoji} to player ${toPlayerId} in game ${gameId}`);
    });

    // Friend/Block management events
    socket.on('add_friend', (data) => {
      console.log(`[SOCKET] add_friend event received from socket ${socket.id}, userId: ${socket.userId}`);
      console.log(`[SOCKET] add_friend data:`, data);
      console.log(`[SOCKET] Socket authenticated: ${socket.authenticated}`);
      if (!socket.userId) {
        console.log(`[SOCKET] ERROR: No userId on socket!`);
        socket.emit('error', { message: 'User not authenticated' });
        return;
      }
      friendBlockHandler.handleAddFriend(data);
    });
    socket.on('remove_friend', (data) => {
      console.log(`[SOCKET] remove_friend event received from socket ${socket.id}, userId: ${socket.userId}`);
      friendBlockHandler.handleRemoveFriend(data);
    });
    socket.on('block_user', (data) => {
      console.log(`[SOCKET] block_user event received from socket ${socket.id}, userId: ${socket.userId}`);
      friendBlockHandler.handleBlockUser(data);
    });
    socket.on('unblock_user', (data) => {
      console.log(`[SOCKET] unblock_user event received from socket ${socket.id}, userId: ${socket.userId}`);
      friendBlockHandler.handleUnblockUser(data);
    });

    // Disconnect
    socket.on('disconnect', async () => {
      console.log(`[DISCONNECT] Socket ${socket.id} disconnected, userId: ${socket.userId}`);
      
      // Handle user going offline for lobby
      lobbyChatHandler.socket = socket;
      lobbyChatHandler.handleUserOffline();
      
      // CRITICAL: Handle game disconnection
      if (socket.userId) {
        const currentSession = await redisSessionService.getUserSession(socket.userId);
        if (currentSession && currentSession.socketId === socket.id && currentSession.activeGameId) {
          console.log(`[DISCONNECT] User ${socket.userId} disconnected from active game ${currentSession.activeGameId}`);
          
          // Handle game disconnection
          try {
            const { GameDisconnectHandler } = await import('../modules/socket-handlers/game-disconnect/gameDisconnectHandler.js');
            const gameDisconnectHandler = new GameDisconnectHandler(io, socket);
            await gameDisconnectHandler.handlePlayerDisconnect(currentSession.activeGameId, socket.userId);
          } catch (error) {
            console.error('[DISCONNECT] Error handling game disconnect:', error);
          }
        }
        
        // Don't remove session completely - keep activeGameId for reconnection
        console.log(`[SESSION] User ${socket.userId} disconnected from active session`);
      }
    });
  });
}

