import { gameManager } from '../services/GameManager.js';
import { GameJoinHandler } from '../modules/socket-handlers/game-join/gameJoinHandler.js';
import { GameStartHandler } from '../modules/socket-handlers/game-start/gameStartHandler.js';
import { BiddingHandler } from '../modules/socket-handlers/bidding/biddingHandler.js';
import { CardPlayHandler } from '../modules/socket-handlers/card-play/cardPlayHandler.js';
import { GameChatHandler } from '../modules/socket-handlers/chat/gameChatHandler.js';
import { BotManagementHandler } from '../modules/socket-handlers/bot-management/botManagementHandler.js';
import { LobbyChatHandler } from '../modules/socket-handlers/lobby/lobbyChatHandler.js';
import { FriendBlockHandler } from '../modules/socket-handlers/friends/friendBlockHandler.js';
import jwt from 'jsonwebtoken';

export function setupSocketHandlers(io) {
  // Global lobby chat handler to track online users
  const lobbyChatHandler = new LobbyChatHandler(io, null);

  io.on('connection', (socket) => {
    console.log(`[SOCKET] Client connected: ${socket.id}`);
    console.log(`[SOCKET] Socket user ID: ${socket.userId}`);
    console.log(`[SOCKET] Socket authenticated: ${socket.authenticated}`);

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
        
        console.log(`[SOCKET] User authenticated: ${decoded.userId}`);
        console.log(`[SOCKET] Socket after auth - userId: ${socket.userId}, authenticated: ${socket.authenticated}`);
        socket.emit('authenticated', { userId: decoded.userId });

        // Handle user coming online for lobby
        lobbyChatHandler.socket = socket;
        lobbyChatHandler.handleUserOnline();
      } catch (error) {
        console.error('[SOCKET] Authentication error:', error);
        socket.emit('auth_error', { message: 'Invalid token' });
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
    const friendBlockHandler = new FriendBlockHandler(io, socket);
    console.log(`[SOCKET] Handlers initialized for socket ${socket.id}`);

    // Simple per-socket debounce map for join_game to avoid rapid repeat loops
    const joinDebounce = new Map(); // gameId -> timestamp

    // Game join/leave events
    socket.on('join_game', (data) => {
      console.log(`[SOCKET] join_game event received from socket ${socket.id}, userId: ${socket.userId}`);
      console.log(`[SOCKET] join_game data:`, data);
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
    
    // Bidding events
    socket.on('make_bid', (data) => biddingHandler.handleMakeBid(data));
    
    // Card play events
    socket.on('play_card', (data) => cardPlayHandler.handlePlayCard(data));

    // Chat events
    socket.on('game_message', (data) => {
      console.log(`[SOCKET] game_message event received from socket ${socket.id}, userId: ${socket.userId}`);
      console.log(`[SOCKET] game_message data:`, data);
      gameChatHandler.handleGameMessage(data);
    });
    socket.on('get_game_messages', (data) => gameChatHandler.handleGetGameMessages(data));

    // Bot management events
    socket.on('add_bot', (data) => botManagementHandler.handleAddBot(data));
    socket.on('remove_bot', (data) => botManagementHandler.handleRemoveBot(data));
    socket.on('fill_with_bots', (data) => botManagementHandler.handleFillWithBots(data));
    
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
    socket.on('remove_bot_db', (data) => {
      console.log('[SOCKET] Received remove_bot_db event:', data);
      if (!socket.authenticated) {
        console.log('[SOCKET] User not authenticated for remove_bot_db');
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }
      gameJoinHandler.handleRemoveBot(data);
    });

    // Lobby chat events
    socket.on('lobby_message', (data) => lobbyChatHandler.handleLobbyMessage(data));


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
    socket.on('disconnect', () => {
      console.log(`[SOCKET] Client disconnected: ${socket.id}`);
      // Handle user going offline for lobby
      lobbyChatHandler.socket = socket;
      lobbyChatHandler.handleUserOffline();
    });
  });
}

