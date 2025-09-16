import { Server } from 'socket.io';
import { games } from '../../gamesStore';
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
      createUserSession(socket, data);
    });

    // Join game event
    socket.on('join_game', (data) => handleJoinGame(socket, data));

    // Game play events
    socket.on('make_bid', (data) => handleMakeBid(socket, data));
    socket.on('play_card', (data) => handlePlayCard(socket, data));
    socket.on('start_game', (data) => handleStartGame(socket, data));
    socket.on('hand_summary_continue', (data) => handleHandSummaryContinue(socket, data));

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
        authenticatedSockets.delete(socket.userId);
        onlineUsers.delete(socket.userId);
        io.emit('online_users', Array.from(onlineUsers));
        console.log(`[CONNECTION] User ${socket.userId} disconnected. Online users:`, Array.from(onlineUsers));

    // Send authenticated event to client
    socket.emit("authenticated", {
      success: true,
      userId: socket.userId,
      games: [] // TODO: Load user games if needed
    });      }
    });
  });
}
