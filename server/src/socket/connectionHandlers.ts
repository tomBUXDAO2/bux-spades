import { io, authenticatedSockets, onlineUsers } from '../server';
import { registerGameEventHandlers } from './gameEventHandlers';
import { userSessions, sessionToUser } from './authentication';
import { games } from '../gamesStore';
import { enrichGameForClient } from '../routes/games.routes';
import type { AuthenticatedSocket } from '../server';

// Inactivity tracking
const tableInactivityTimers = new Map<string, NodeJS.Timeout>();
const INACTIVITY_TIMEOUT = 10 * 60 * 1000; // 10 minutes in milliseconds

export function setupConnectionHandlers(io: any) {
  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`[CONNECTION] User ${socket.auth?.username} (${socket.userId}) connected`);
    
    // Add to authenticated sockets and online users
    if (socket.userId) {
      authenticatedSockets.set(socket.userId, socket);
      onlineUsers.add(socket.userId);
    }

    // Emit online users update
    // Emit authenticated event to client
    socket.emit("authenticated", { success: true, userId: socket.userId, username: socket.auth?.username, games: [] });    io.emit('online_users_updated', Array.from(onlineUsers));

    // Register game event handlers
    registerGameEventHandlers(socket);
    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log(`[DISCONNECT] User ${socket.auth?.username} (${socket.userId}) disconnected: ${reason}`);
      
      if (socket.userId) {
        authenticatedSockets.delete(socket.userId);
        onlineUsers.delete(socket.userId);
        userSessions.delete(socket.userId);
        sessionToUser.delete(socket.id);
      }

      // Emit online users update
      io.emit('online_users_updated', Array.from(onlineUsers));

      // Handle game disconnection
      handleGameDisconnection(socket);
    });

    // Handle reconnection
    socket.on('reconnect', () => {
      console.log(`[RECONNECT] User ${socket.auth?.username} (${socket.userId}) reconnected`);
      
      if (socket.userId) {
        authenticatedSockets.set(socket.userId, socket);
        onlineUsers.add(socket.userId);
      }

      // Emit online users update
      io.emit('online_users_updated', Array.from(onlineUsers));
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`[SOCKET ERROR] User ${socket.auth?.username} (${socket.userId}):`, error);
    });
  });
}

function handleGameDisconnection(socket: AuthenticatedSocket) {
  if (!socket.userId) return;

  // Find games where this user is playing
  const userGames = games.filter(game => 
    game.players.some(player => player && player.id === socket.userId)
  );

  userGames.forEach(game => {
    console.log(`[DISCONNECT] User ${socket.userId} disconnected from game ${game.id}`);
    
    // Set up inactivity timer
    const timerKey = `${game.id}-${socket.userId}`;
    const existingTimer = tableInactivityTimers.get(timerKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const inactivityTimer = setTimeout(() => {
      console.log(`[INACTIVITY] User ${socket.userId} inactive for ${INACTIVITY_TIMEOUT}ms in game ${game.id}`);
      
      // Remove user from game
      const playerIndex = game.players.findIndex(player => player && player.id === socket.userId);
      if (playerIndex !== -1) {
        game.players[playerIndex] = null;
        
        // Emit game update
        const enrichedGame = enrichGameForClient(game);
        io.to(game.id).emit('game_update', enrichedGame);
        
        // Emit system message
        io.to(game.id).emit('system_message', {
          message: `${socket.auth?.username} has left the game due to inactivity`,
          type: 'warning'
        });
      }
      
      tableInactivityTimers.delete(timerKey);
    }, INACTIVITY_TIMEOUT);

    tableInactivityTimers.set(timerKey, inactivityTimer);
  });
}

export { tableInactivityTimers, INACTIVITY_TIMEOUT };
