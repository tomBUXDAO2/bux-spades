import type { AuthenticatedSocket } from '../../socket-auth';
import type { Game } from '../../../types/game';
import { games } from '../../../gamesStore';
import { enrichGameForClient } from '../../../routes/games/shared/gameUtils';

/**
 * Handles join_game socket event
 */
export async function handleJoinGame(socket: AuthenticatedSocket, { gameId }: { gameId: string }): Promise<void> {
  console.log('[SERVER DEBUG] join_game event received:', { 
    gameId, 
    socketId: socket.id, 
    userId: socket.userId,
    isAuthenticated: socket.isAuthenticated,
    timestamp: new Date().toISOString()
  });
  
  if (!socket.isAuthenticated || !socket.userId) {
    console.log('Unauthorized join_game attempt:', { 
      socketId: socket.id, 
      isAuthenticated: socket.isAuthenticated,
      userId: socket.userId 
    });
    socket.emit('error', { message: 'Not authenticated' });
    return;
  }

  try {
    console.log('[JOIN GAME DEBUG] Looking for game:', gameId);
    console.log('[JOIN GAME DEBUG] Available games:', games.map(g => ({ id: g.id, status: g.status, players: g.players.map(p => p ? p.id : 'null') })));
    
    const game = games.find((g: Game) => g.id === gameId);
    if (!game) {
      console.log(`Game ${gameId} not found`);
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    // Update game activity
    game.lastActivity = Date.now();
    
    console.log('[SERVER DEBUG] Found game:', { 
      gameId, 
      status: game.status, 
      currentPlayer: game.currentPlayer,
      biddingCurrentPlayer: game.bidding?.currentPlayer,
      playCurrentPlayer: game.play?.currentPlayer,
      players: game.players.map(p => p ? { id: p.id, username: p.username, type: p.type } : null)
    });
    
    // Join the socket room for this game
    socket.join(gameId);
    console.log(`[JOIN GAME] Socket ${socket.id} joined room ${gameId}`);
    
    // Send current game state to the joining player
    socket.emit('game_state', enrichGameForClient(game));
    
    // Notify other players that someone joined
    socket.to(gameId).emit('player_joined_room', {
      gameId,
      userId: socket.userId,
      socketId: socket.id
    });
    
    console.log(`[JOIN GAME] Successfully joined game ${gameId} for user ${socket.userId}`);
    
  } catch (error) {
    console.error('Error in join_game:', error);
    socket.emit('error', { message: 'Internal server error' });
  }
}
