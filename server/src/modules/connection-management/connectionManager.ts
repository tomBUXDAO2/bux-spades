import type { Server } from 'socket.io';
import type { AuthenticatedSocket } from '../../types/socket';
import { 
  handleJoinGame, 
  handleStartGame, 
  handleMakeBid, 
  handlePlayCard
} from '../socket-handlers';
import { handleHandSummaryContinue } from '../socket-handlers/game-state/hand/handSummaryContinue';
import { handlePlayAgainSocket } from '../socket-handlers/game-completion/playAgainHandler';
import { prisma } from '../../lib/prisma';
import { handleGameChatMessage } from '../chat/game/gameChatHandler';

export function setupConnectionHandlers(io: Server, authenticatedSockets: Map<string, AuthenticatedSocket>, onlineUsers: Set<string>) {
  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log('[CONNECTION] New socket connection:', {
      socketId: socket.id,
      userId: socket.userId,
      isAuthenticated: socket.isAuthenticated,
      connectedAt: new Date().toISOString()
    });

    // Add to authenticated sockets map
    if (socket.isAuthenticated && socket.userId) {
      // Emit authenticated event to client
      socket.emit("authenticated", {
        success: true,
        userId: socket.userId,
        games: [] // Empty for now, can be populated later if needed
      });
      authenticatedSockets.set(socket.userId, socket);
      onlineUsers.add(socket.userId);
      console.log(`[CONNECTION] User ${socket.userId} connected. Online users:`, Array.from(onlineUsers));
    }

    // Handle disconnection
    socket.on('disconnect', async () => {
      console.log('[CONNECTION] Socket disconnected:', {
        socketId: socket.id,
        userId: socket.userId
      });

      if (socket.userId) {
        authenticatedSockets.delete(socket.userId);
        onlineUsers.delete(socket.userId);
        console.log(`[CONNECTION] User ${socket.userId} disconnected. Online users:`, Array.from(onlineUsers));
      }
    });

    // Game-related socket events
    socket.on('join_game', (data: any) => {
      console.log('[SOCKET JOIN] Data received:', data);
      handleJoinGame(socket, data.gameId);
    });
    
    socket.on('leave_game', (data: any) => {
      console.log('[LEAVE GAME] User wants to leave game:', { gameId: data.gameId, userId: socket.userId });
      // Handle leave game logic here
    });
    
    socket.on('start_game', (data: any) => handleStartGame(socket, data));
    socket.on('bid', (data: any) => handleMakeBid(socket, data));
    socket.on('play_card', (data: any) => handlePlayCard(socket, data));
    
    socket.on('hand_completed', ({ gameId }: { gameId: string }) => {
      console.log('[HAND COMPLETED] Initializing hand summary tracking for game:', gameId);
      // Get game from database
      prisma.game.findUnique({
        where: { id: gameId }
      }).then(game => {
        if (game) {
          // Import the tracking functions and initialize
          const { initializeHandSummaryTracking } = require('../socket-handlers/game-state/hand/handSummaryContinue');
          initializeHandSummaryTracking(game);
        }
      }).catch(error => {
        console.error('[HAND COMPLETED] Error fetching game:', error);
      });
    });
    
    socket.on('play_again', (data: any) => handlePlayAgainSocket(socket, data));

    // Handle hand summary continue
    socket.on('hand_summary_continue', (data: any) => handleHandSummaryContinue(socket, data));

    // Handle spectate
    socket.on('spectate_game', async ({ gameId }: { gameId: string }) => {
      try {
        if (!socket.isAuthenticated || !socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        // Join the game room for spectating
        await socket.join(gameId);
        socket.emit('spectate_joined', { gameId });
      } catch (error) {
        console.error('[SPECTATE] Error handling spectate:', error);
        socket.emit('error', { message: 'Failed to spectate game' });
      }
    });

    // Handle leave spectate
    socket.on('leave_spectate', async ({ gameId }: { gameId: string }) => {
      try {
        await socket.leave(gameId);
        socket.emit('spectate_left', { gameId });
      } catch (error) {
        console.error('[LEAVE SPECTATE] Error handling leave spectate:', error);
        socket.emit('error', { message: 'Failed to leave spectate' });
      }
    });

    // Handle chat messages
    socket.on('chat_message', async (data: any) => {
      try {
        const { gameId, message } = data;
        console.log('[CHAT DEBUG] Received chat message:', { gameId, message, userId: socket.userId });
        await handleGameChatMessage(socket, gameId, message);
      } catch (error) {
        console.error('[CHAT] Error handling chat message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle lobby chat messages
    socket.on('lobby_chat_message', async ({ message }: { message: string }) => {
      try {
        if (!socket.isAuthenticated || !socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        const user = await prisma.user.findUnique({
          where: { id: socket.userId },
          select: { username: true, avatarUrl: true }
        });

        if (user) {
          io.emit('lobby_chat_message', {
            userId: socket.userId,
            username: user.username,
            avatarUrl: user.avatarUrl,
            message: message,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.error('[LOBBY CHAT] Error handling lobby chat message:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle emoji reactions
    socket.on('emoji_reaction', async ({ gameId, emoji }: { gameId: string; emoji: string }) => {
      try {
        if (!socket.isAuthenticated || !socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        io.to(gameId).emit('emoji_reaction', {
          userId: socket.userId,
          emoji: emoji,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('[EMOJI] Error handling emoji reaction:', error);
        socket.emit('error', { message: 'Failed to send emoji reaction' });
      }
    });

    // Handle player profile requests
    socket.on('get_player_profile', async ({ userId }: { userId: string }) => {
      try {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, username: true, avatarUrl: true, coins: true }
        });

        if (user) {
          socket.emit('player_profile', user);
        } else {
          socket.emit('error', { message: 'Player not found' });
        }
      } catch (error) {
        console.error('[PLAYER PROFILE] Error handling player profile request:', error);
        socket.emit('error', { message: 'Failed to get player profile' });
      }
    });

    // Handle fill seat with bot
    socket.on("fill_seat_with_bot", async ({ gameId, seatIndex }: { gameId: string; seatIndex: number }) => {
      console.log("[FILL SEAT] Received fill_seat_with_bot event:", { gameId, seatIndex });
      
      try {
        if (!socket.isAuthenticated || !socket.userId) {
          console.log("Unauthorized fill_seat_with_bot attempt");
          socket.emit("error", { message: "Not authorized" });
          return;
        }
        
        // Find game in database
        const dbGame = await prisma.game.findUnique({
          where: { id: gameId },
          include: { gamePlayers: { include: { user: true } } }
        });
        
        if (!dbGame) {
          socket.emit("error", { message: "Game not found" });
          return;
        }
        
        // Check if seat is already taken
        const existingPlayer = dbGame.gamePlayers.find(gp => gp.seatIndex === seatIndex);
        if (existingPlayer) {
          socket.emit("error", { message: "Seat already taken" });
          return;
        }
        
        // Create bot user
        const botNumber = Math.floor(Math.random() * 1000);
        const botId = `bot_${botNumber}_${Date.now()}`;
        
        const botUser = await prisma.user.upsert({
          where: { id: botId },
          update: {},
          create: {
            id: botId,
            username: `Bot${botNumber}`,
            avatarUrl: "/bot-avatar.jpg",
            discordId: `bot_${botNumber}_${Date.now()}`,
            coins: 1000000,
            createdAt: new Date()
          }
        });
        const botPlayer = await prisma.gamePlayer.create({
          data: {
            gameId: gameId,
            userId: botId,
            seatIndex: seatIndex,
            teamIndex: seatIndex % 2,
            isHuman: false,
            joinedAt: new Date(),
          }
        });
        
        // Get updated game and emit to clients
        const updatedGame = await prisma.game.findUnique({
          where: { id: gameId },
          include: { gamePlayers: { include: { user: true } } }
        });
        
        if (updatedGame) {
          const { enrichGameForClient } = require("../../routes/games/shared/gameUtils");
          const enrichedGame = enrichGameForClient(updatedGame);
          io.to(gameId).emit("game_update", enrichedGame);
        }
        
        console.log(`[FILL SEAT] Successfully added bot to seat ${seatIndex} in game ${gameId}`);
      } catch (error) {
        console.error("[FILL SEAT] Error filling seat with bot:", error);
        socket.emit("error", { message: "Failed to add bot" });
      }
    });
  });
}