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

export function setupConnectionHandlers(io: Server, authenticatedSockets: Map<string, AuthenticatedSocket>, onlineUsers: Set<string>) {
  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log('[CONNECTION] New socket connection:', {
      socketId: socket.id,
      userId: socket.userId,
      isAuthenticated: socket.isAuthenticated,
      auth: socket.auth
    });

    if (socket.userId) {
      // Check if there's an existing socket for this user and disconnect it
      const existingSocket = authenticatedSockets.get(socket.userId);
      if (existingSocket && existingSocket.id !== socket.id) {
        console.log(`[CONNECTION] Disconnecting existing socket for user ${socket.userId}:`, {
          oldSocketId: existingSocket.id,
          newSocketId: socket.id
        });
        existingSocket.emit('session_invalidated', {
          reason: 'new_connection',
          message: 'You have connected from another location'
        });
        existingSocket.disconnect();
      }
      
      // Create new session for this user
      const sessionId = createUserSession(socket.userId);
      
      authenticatedSockets.set(socket.userId, socket);
      onlineUsers.add(socket.userId);
      io.emit('online_users', Array.from(onlineUsers));
      
      console.log('User connected:', {
        userId: socket.userId,
        sessionId,
        socketId: socket.id,
        onlineUsers: Array.from(onlineUsers)
      });
      socket.emit('authenticated', { 
        success: true, 
        userId: socket.userId, 
        sessionId, 
        games: Array.from(socket.rooms).filter(room => room !== socket.id) 
      });    }

    // Join game event
    socket.on('join_game', (data) => handleJoinGame(socket, data));

    // Game play events
    socket.on('make_bid', (data) => handleMakeBid(socket, data));
    socket.on('play_card', (data) => handlePlayCard(socket, data));
    socket.on('start_game', (data) => handleStartGame(socket, data));

    // Chat events
    socket.on("game_chat_message", async (message) => {
      await handleGameChatMessage(socket, message);
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
      }
    });
  });
}
