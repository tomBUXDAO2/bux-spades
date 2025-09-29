// @ts-nocheck
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
import { handlePlayerLeaveDuringPlayAgain } from '../play-again/playAgainManager';
import { handleGameChatMessage, handleLobbyChatMessage } from '../chat';
import { prisma } from '../../lib/prisma';

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
      authenticatedSockets.set(socket.userId, socket);
      onlineUsers.add(socket.userId);
      console.log(`[CONNECTION] User ${socket.userId} connected. Online users:`, Array.from(onlineUsers));
      
      // Emit authenticated event to client
      socket.emit('authenticated', {
        success: true,
        userId: socket.userId,
        games: [] // Empty for now, can be populated later if needed
      });
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

        // Handle player leaving during play again
        try {
          // Find games where this user is a player
          const gamePlayers = await prisma.gamePlayer.findMany({
            where: {
              userId: socket.userId
            },
            select: {
              gameId: true
            }
          });

          const gameIds = gamePlayers.map(gp => gp.gameId);
          
          for (const gameId of gameIds) {
            await handlePlayerLeaveDuringPlayAgain(gameId, socket.userId);
          }
        } catch (error) {
          console.error('[CONNECTION] Error handling player leave during play again:', error);
        }
      }
    });

    // Game-related socket events
    socket.on('join_game', (data: any) => handleJoinGame(socket, data.gameId));
    socket.on('leave_game', (data: any) => {
      console.log('[LEAVE GAME] User wants to leave game:', { gameId: data.gameId, userId: socket.userId });
      // Handle leave game logic here
    });
    socket.on('start_game', (data: any) => handleStartGame(socket, data));
    socket.on('make_bid', (data: any) => handleMakeBid(socket, data));
  
  // Debug: Handle test connection from client
  socket.on('test_connection', (data: any) => {
    console.log('[SOCKET DEBUG] Received test connection from client:', data);
    socket.emit('test_connection_response', { 
      message: 'Server received test connection', 
      clientData: data,
      timestamp: Date.now()
    });
  });
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
        console.log('[SPECTATE] User wants to spectate game:', { gameId, userId: socket.userId });
        
        if (!socket.isAuthenticated || !socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        // Check if game exists
        const game = await prisma.game.findUnique({
          where: { id: gameId }
        });

        if (!game) {
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        // Check if user is already in this game
        const existingPlayer = await prisma.gamePlayer.findFirst({
          where: {
            gameId: gameId,
            userId: socket.userId
          }
        });

        if (existingPlayer) {
          socket.emit('error', { message: 'You are already in this game' });
          return;
        }

        // Join game room
        socket.join(gameId);
        
        // Get user profile
        const user = await prisma.user.findUnique({
          where: { id: socket.userId }
        });

        if (user) {
          // Notify other players
          socket.to(gameId).emit('spectator_joined', {
            userId: socket.userId,
            username: user.username,
            avatarUrl: user.avatarUrl
          });
        }

        console.log('[SPECTATE] User joined as spectator:', { gameId, userId: socket.userId });
        
      } catch (error) {
        console.error('[SPECTATE] Error handling spectate:', error);
        socket.emit('error', { message: 'Failed to spectate game' });
      }
    });

    // Handle leave spectate
    socket.on('leave_spectate', async ({ gameId }: { gameId: string }) => {
      try {
        console.log('[LEAVE SPECTATE] User wants to leave spectate:', { gameId, userId: socket.userId });
        
        if (!socket.isAuthenticated || !socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        // Leave game room
        socket.leave(gameId);
        
        // Notify other players
        socket.to(gameId).emit('spectator_left', {
          userId: socket.userId
        });

        console.log('[LEAVE SPECTATE] User left spectate:', { gameId, userId: socket.userId });
        
      } catch (error) {
        console.error('[LEAVE SPECTATE] Error handling leave spectate:', error);
        socket.emit('error', { message: 'Failed to leave spectate' });
      }
    });

    // Handle chat messages
    socket.on('chat_message', async ({ gameId, message }: { gameId: string; message: any }) => {
      await handleGameChatMessage(socket, gameId, message);
    });

    // Handle lobby chat messages
    socket.on('lobby_chat_message', async (message: any) => {
      await handleLobbyChatMessage(socket, message);
    });

    // Handle emoji reactions
    socket.on('emoji_reaction', async ({ gameId, emoji }: { gameId: string; emoji: string }) => {
      try {
        if (!socket.isAuthenticated || !socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        // Get user profile
        const user = await prisma.user.findUnique({
          where: { id: socket.userId }
        });

        if (user) {
          // Broadcast emoji reaction to game room
          io.to(gameId).emit('emoji_reaction', {
            userId: socket.userId,
            username: user.username,
            emoji: emoji,
            timestamp: new Date().toISOString()
          });
        }

      } catch (error) {
        console.error('[EMOJI] Error handling emoji reaction:', error);
        socket.emit('error', { message: 'Failed to send emoji reaction' });
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

        await prisma.user.upsert({
          where: { id: botId },
          update: {},
          create: {
            id: botId,
            username: `Bot${botNumber}`,
            avatarUrl: "/bot-avatar.jpg",
            discordId: `bot_discord_${botNumber}_${Date.now()}`,
            coins: 1000000,
            createdAt: new Date()
          }
        });

        // Create bot player in game
        await prisma.gamePlayer.create({
          data: {
            gameId: gameId,
            userId: botId,
            seatIndex: seatIndex,
            teamIndex: seatIndex % 2,
            isHuman: false,
            joinedAt: new Date()
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

    // Handle emoji reactions
    socket.on('emoji_reaction', async ({ gameId, emoji }: { gameId: string; emoji: string }) => {
      try {
        if (!socket.isAuthenticated || !socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        // Get user profile
        const user = await prisma.user.findUnique({
          where: { id: socket.userId }
        });

        if (user) {
          // Broadcast emoji reaction to game room
          io.to(gameId).emit('emoji_reaction', {
            userId: socket.userId,
            username: user.username,
            emoji: emoji,
            timestamp: new Date().toISOString()
          });
        }

      } catch (error) {
        console.error('[EMOJI] Error handling emoji reaction:', error);
        socket.emit('error', { message: 'Failed to send emoji reaction' });
      }
    });

    // Handle player profile requests
    socket.on('get_player_profile', async ({ userId }: { userId: string }) => {
      try {
        if (!socket.isAuthenticated || !socket.userId) {
          socket.emit('error', { message: 'Not authenticated' });
          return;
        }

        // Get player profile
        const user = await prisma.user.findUnique({
          where: { id: userId }
        });

        if (user) {
          socket.emit('player_profile', {
            id: user.id,
            username: user.username,
            avatarUrl: user.avatarUrl,
            coins: user.coins,
            stats: null // userStats not available in current schema
          });
        } else {
          socket.emit('error', { message: 'Player not found' });
        }

      } catch (error) {
        console.error('[PLAYER PROFILE] Error handling player profile request:', error);
        socket.emit('error', { message: 'Failed to get player profile' });
      }
    });
  });
}
