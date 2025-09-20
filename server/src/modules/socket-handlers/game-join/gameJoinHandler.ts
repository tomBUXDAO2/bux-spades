import type { AuthenticatedSocket } from '../../socket-auth';
import { io } from '../../../index';
import { games } from '../../../gamesStore';
import { enrichGameForClient } from '../../../routes/games/shared/gameUtils';

export async function handleJoinGame(socket: AuthenticatedSocket, { gameId }: { gameId: string }): Promise<void> {
  console.log('[JOIN GAME DEBUG] Socket join request:', {
    gameId,
    socketId: socket.id,
    userId: socket.userId,
    isAuthenticated: socket.isAuthenticated,
    timestamp: new Date().toISOString()
  });

  if (!socket.isAuthenticated || !socket.userId) {
    socket.emit('error', { message: 'Not authenticated' });
    return;
  }

  try {
    console.log('[JOIN GAME DEBUG] Looking for game:', gameId);
    console.log('[JOIN GAME DEBUG] Available games:', games.map(g => ({
      id: g.id,
      status: g.status,
      players: g.players.map(p => p ? p.id : 'null')
    })));

    const game = games.find(g => g.id === gameId);
    if (!game) {
      console.log('[JOIN GAME DEBUG] Game not found:', gameId);
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    console.log('[SERVER DEBUG] Found game:', {
      gameId: game.id,
      status: game.status,
      currentPlayer: game.currentPlayer,
      biddingCurrentPlayer: game.bidding?.currentPlayer,
      playCurrentPlayer: game.play?.currentPlayer,
      players: game.players.map(p => p ? {
        id: p.id,
        username: p.username,
        type: p.type
      } : null)
    });

    // Check if user is already in this game
    const existingPlayerIndex = game.players.findIndex(p => p && p.id === socket.userId);
    if (existingPlayerIndex !== -1) {
      console.log('[JOIN GAME] User already in game, rejoining...');
      // User is already in the game, just join the socket room
      socket.join(gameId);
      socket.emit('game_joined', { gameId });
      socket.emit('game_update', enrichGameForClient(game));
      
      // IMPORTANT: Also emit to all players in the room to sync the UI
      io.to(gameId).emit('game_update', enrichGameForClient(game));
      return; // Exit early since user is already in game
    }

    // Check if user is in another game (using database)
    const { prisma } = await import('../../../lib/prisma');
    const existingGamePlayer = await prisma.gamePlayer.findFirst({
      where: {
        userId: socket.userId,
        Game: {
          status: {
            in: ["WAITING", "BIDDING", "PLAYING"]
          }
        }
      },
      include: {
        Game: true
      }
    });
    
    if (existingGamePlayer && existingGamePlayer.gameId !== gameId) {
      socket.emit('error', { message: `You are already in game ${existingGamePlayer.gameId}. Please leave that game first.` });
      return;
    }
    // For socket joins, we don't have a specific seat request, so find empty seat
    const emptySeatIndex = game.players.findIndex(p => p === null);
    if (emptySeatIndex === -1) {
      socket.emit('error', { message: 'Game is full' });
      return;
    }

    // Add player to game - fetch user data from database
    const userData = await prisma.user.findUnique({
      where: { id: socket.userId },
      select: { username: true, avatar: true }
    });
    
    game.players[emptySeatIndex] = {
      id: socket.userId,
      username: userData?.username || 'Unknown Player',
      avatar: userData?.avatar || '/default-avatar.jpg',
      type: 'human',
      position: emptySeatIndex,
      team: emptySeatIndex % 2,
      bid: undefined,
      tricks: 0,
      points: 0,
      bags: 0
    };

    // Join socket room
    socket.join(gameId);
    socket.emit('game_joined', { gameId });

    console.log('[JOIN GAME] Socket', socket.id, 'joined room', gameId);
    console.log('[JOIN GAME] Successfully joined game', gameId, 'for user', socket.userId);

    // Emit game update to all players
    io.to(gameId).emit('game_update', enrichGameForClient(game));

    // Update lobby for all clients
    const lobbyGames = games.filter(g => {
      if ((g as any).league && g.status === 'WAITING') {
        return false;
      }
      return true;
    });
    io.emit('games_updated', lobbyGames.map(g => enrichGameForClient(g)));
    
    // Also emit all games (including league games) for real-time league game detection
    io.emit('all_games_updated', games.map(g => enrichGameForClient(g)));

  } catch (error) {
    console.error('[JOIN GAME ERROR]', error);
    socket.emit('error', { message: 'Failed to join game' });
  }
}
