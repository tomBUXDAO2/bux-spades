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
  createUserSession
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

      // Auto-join user to any games they're already in
      games.forEach(game => {
        const isPlayerInGame = game.players.some(player => player && player.id === socket.userId);
        if (isPlayerInGame) {
          socket.join(game.id);
          console.log(`[CONNECTION] Auto-joined game room ${game.id} for user ${socket.userId}`);
        }
      });
    }

    // Socket event handlers
    socket.on('join_game', (data) => handleJoinGame(socket, data));
    socket.on('make_bid', (data) => handleMakeBid(socket, data));
    socket.on('play_card', (data) => handlePlayCard(socket, data));

    // Chat handlers
    socket.on('chat_message', async ({ gameId, message }) => {
      await handleGameChatMessage(socket, gameId, message);
    });

    socket.on("lobby_chat_message", async (message) => {
      await handleLobbyChatMessage(socket, message);
    });

    // Fill seat with bot event (manual replacement)
    socket.on('fill_seat_with_bot', ({ gameId, seatIndex }) => {
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
      
      // Fill the seat with a bot (manual invitation)
      addBotToSeat(game, seatIndex);
    });

    socket.on('disconnect', (reason) => {
      console.log('[DISCONNECT] User disconnected:', {
        userId: socket.userId,
        socketId: socket.id,
        reason
      });

      if (socket.userId) {
        authenticatedSockets.delete(socket.userId);
        onlineUsers.delete(socket.userId);
        io.emit('online_users', Array.from(onlineUsers));
      }
    });
  });
}
