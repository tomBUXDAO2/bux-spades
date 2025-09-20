import { Server } from 'socket.io';
import { games } from '../../gamesStore';
import { io } from '../../index';
import { deleteUnratedGameFromDatabase } from '../../lib/hand-completion/game/gameCompletion';
import { enrichGameForClient } from '../../routes/games/shared/gameUtils';
import { AuthenticatedSocket } from '../socket-auth';
import { 
  handleJoinGame, 
  handleMakeBid, 
  handlePlayCard,
  handleGameChatMessage,
  handleLobbyChatMessage,
  addBotToSeat,
  createUserSession,
  handleStartGame
} from '../index';
import { handleHandSummaryContinue } from '../socket-handlers/game-state/hand/handSummaryContinue';
import { handlePlayAgainSocket } from '../socket-handlers/game-completion/playAgainHandler';
import { handlePlayerLeaveDuringPlayAgain } from '../play-again/playAgainManager';

export function setupConnectionHandlers(io: Server, authenticatedSockets: Map<string, AuthenticatedSocket>, onlineUsers: Set<string>) {
  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log('[CONNECTION] New socket connection:', {
      socketId: socket.id,
      userId: socket.userId,
      isAuthenticated: socket.isAuthenticated,
      connectedAt: new Date().toISOString()
    });

    // Store authenticated socket
    if (socket.isAuthenticated && socket.userId) {
      authenticatedSockets.set(socket.userId, socket);
      onlineUsers.add(socket.userId);
      io.emit('online_users', Array.from(onlineUsers));
      console.log(`[CONNECTION] User ${socket.userId} connected. Online users:`, Array.from(onlineUsers));

      // Send authenticated event to client
      socket.emit("authenticated", {
        success: true,
        userId: socket.userId,
        games: [] // TODO: Load user games if needed
      });
    }

    // Authentication event
    socket.on('authenticate', (data) => {
      createUserSession(data.userId);
    });

    // Join game event
    socket.on('join_game', (data) => handleJoinGame(socket, data));

    // Game play events
    socket.on('make_bid', (data) => handleMakeBid(socket, data));
    socket.on('play_card', (data) => handlePlayCard(socket, data));
    socket.on('start_game', (data) => handleStartGame(socket, data));
    socket.on('hand_summary_continue', (data) => handleHandSummaryContinue(socket, data));
    socket.on('play_again', (data) => handlePlayAgainSocket(socket, data));

    // Leave game event
    socket.on('leave_game', async ({ gameId, userId }) => {
      console.log(`[SOCKET LEAVE GAME] User ${userId} leaving game ${gameId}`);
      
      if (!socket.isAuthenticated || !socket.userId || socket.userId !== userId) {
        socket.emit('error', { message: 'Not authenticated or invalid user' });
        return;
      }

      try {
        const game = games.find(g => g.id === gameId);
        if (!game) {
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        // Make user leave the socket room
        socket.leave(gameId);
        console.log(`[SOCKET LEAVE GAME] User ${userId} left socket room ${gameId}`);

        // Remove from players
        const playerIdx = game.players.findIndex(p => p && p.id === userId);
        if (playerIdx !== -1) {
          game.players[playerIdx] = null;
        }

        // Remove from database if game exists in DB
        if (game.dbGameId) {
          try {
            const { prisma } = await import('../../lib/prisma');
            await prisma.gamePlayer.deleteMany({ where: { gameId: game.dbGameId, userId: userId } });
            console.log(`[SOCKET LEAVE GAME] Removed user ${userId} from database game ${game.dbGameId}`);
          } catch (dbError) {
            console.error(`[SOCKET LEAVE GAME] Failed to remove user from database:`, dbError);
          }
        }

        // Remove from spectators
        if (Array.isArray((game as any).spectators)) {
          const specIdx = (game as any).spectators.findIndex((s: any) => s.id === userId);
          if (specIdx !== -1) {
            (game as any).spectators.splice(specIdx, 1);
          }
        }

        // Emit game update to all players in the room first
        io.to(gameId).emit('game_update', enrichGameForClient(game));
        
        // If no human players remain and not a league game, remove game
        const hasHumanPlayers = game.players.some(p => p && p.type === 'human');
        const isLeague = Boolean((game as any).league);

        if (!hasHumanPlayers && !isLeague) {
          console.log(`[SOCKET LEAVE GAME] No human players remaining in game ${gameId}`);
          
          // If this is an unrated game, clean it up completely (including bots)
          if (!game.rated) {
            console.log(`[SOCKET LEAVE GAME] Cleaning up unrated game ${gameId} from database`);
            
            try {
              // Clean up database using the same function as game completion
              if (game.dbGameId) {
                await deleteUnratedGameFromDatabase(game);
              }
              
              // Remove game from memory
              const index = games.findIndex(g => g.id === gameId);
              if (index !== -1) games.splice(index, 1);
              
              // Notify all players that the game is closed
              io.to(gameId).emit('game_closed', { 
                gameId, 
                reason: 'no_human_players_remaining' 
              });
              
              console.log(`[SOCKET LEAVE GAME] Successfully cleaned up unrated game ${gameId}`);
            } catch (error) {
              console.error(`[SOCKET LEAVE GAME] Failed to clean up unrated game ${gameId}:`, error);
            }
          } else {
            // For rated games, just close the game but don't delete from database
            console.log(`[SOCKET LEAVE GAME] Closing rated game ${gameId} (keeping in database)`);
            
            // Remove game from memory
            const index = games.findIndex(g => g.id === gameId);
            if (index !== -1) games.splice(index, 1);
            
            // Notify all players that the game is closed
            io.to(gameId).emit('game_closed', { 
              gameId, 
              reason: 'no_human_players_remaining' 
            });
          }
        }

        // Update lobby for all clients
        const lobbyGames = games.filter(g => {
          if ((g as any).league && g.status === 'WAITING') {
            return false;
          }
          return true;
        });
        io.emit('games_updated', lobbyGames.map(g => enrichGameForClient(g)));
        io.emit('all_games_updated', games.map(g => enrichGameForClient(g)));

        socket.emit('game_left', { gameId, success: true });
      } catch (error) {
        console.error('[SOCKET LEAVE GAME] Error leaving game:', error);
        socket.emit('error', { message: 'Failed to leave game' });
      }
    });

    // Chat events
    socket.on("chat_message", async (data) => {
      await handleGameChatMessage(socket, data.gameId, data.message);
    });

    socket.on("lobby_chat_message", async (message) => {
      await handleLobbyChatMessage(socket, message);
    });

    // Fill seat with bot event (manual replacement)
    socket.on('fill_seat_with_bot', async ({ gameId, seatIndex }) => {
      console.log('[FILL SEAT] Received fill_seat_with_bot event:', { gameId, seatIndex });
      
      if (!socket.isAuthenticated || !socket.userId) {
        console.log('Unauthorized fill_seat_with_bot attempt');
        socket.emit('error', { message: 'Not authorized' });
        return;
      }
      
      const game = games.find(g => g.id === gameId);
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      
      // Check if seat is empty
      if (game.players[seatIndex] !== null) {
        socket.emit('error', { message: 'Seat is not empty' });
        return;
      }
      
      // Fill the seat with a bot (manual invitation) - now properly awaited
      await addBotToSeat(game, seatIndex);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[CONNECTION] Socket ${socket.id} disconnected:`, reason);
      
      if (socket.userId) {
        // Handle play again cleanup if player was in a finished game
        games.forEach(game => {
          if (game.status === 'FINISHED' && game.players.some(p => p && p.id === socket.userId)) {
            handlePlayerLeaveDuringPlayAgain(game.id, socket.userId);
          }
        });
        
        authenticatedSockets.delete(socket.userId);
        onlineUsers.delete(socket.userId);
        io.emit('online_users', Array.from(onlineUsers));
        console.log(`[CONNECTION] User ${socket.userId} disconnected. Online users:`, Array.from(onlineUsers));
      }
    });
  });
}
