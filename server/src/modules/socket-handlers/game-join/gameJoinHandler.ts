import type { AuthenticatedSocket } from '../../socket-auth/socketAuth';
import { io } from '../../../index';
import { prisma } from '../../../lib/prisma';
import { enrichGameForClient } from '../../../routes/games/shared/gameUtils';

export async function handleJoinGame(socket: AuthenticatedSocket, gameId: string) {
  try {
    console.log(`[GAME JOIN] User ${socket.userId} attempting to join game ${gameId}`);
    
    // Check if game exists in database
    const dbGame = await prisma.game.findUnique({
      where: { id: gameId }
    });
    
    if (!dbGame) {
      console.log(`[GAME JOIN] Game ${gameId} not found in database`);
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    if (dbGame.status !== 'WAITING') {
      socket.emit('error', { message: 'Game is not accepting new players' });
      return;
    }
    
    // Load existing players for this game
    const gamePlayers = await prisma.gamePlayer.findMany({
      where: { gameId },
      orderBy: { seatIndex: 'asc' }
    });
    
    // Check if user is already in the game
    const existingPlayer = gamePlayers.find(p => p.userId === socket.userId);
    if (existingPlayer) {
      console.log(`[GAME JOIN] User ${socket.userId} already in game ${gameId} at seat ${existingPlayer.seatIndex}`);
      socket.join(gameId);
      
      // Get enriched game data
      const updatedGame = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          gamePlayers: {
            include: {
              user: true
            }
          }
        }
      });
      
      if (updatedGame) {
        const enrichedGame = enrichGameForClient(updatedGame);
        socket.emit('game_joined', { 
          gameId, 
          seatIndex: existingPlayer.seatIndex,
          game: enrichedGame 
        });
        io.to(gameId).emit('game_update', enrichedGame);
      }
      return;
    }
    
    // Find an available seat
    const occupiedSeats = new Set(gamePlayers.map(p => p.seatIndex));
    let targetSeatIndex = -1;
    for (let i = 0; i < 4; i++) {
      if (!occupiedSeats.has(i)) {
        targetSeatIndex = i;
        break;
      }
    }
    
    if (targetSeatIndex === -1) {
      socket.emit('error', { message: 'Game is full' });
      return;
    }
    
    // Add player to database
    await prisma.gamePlayer.create({
      data: {
        gameId: gameId,
        userId: socket.userId!,
        seatIndex: targetSeatIndex,
        teamIndex: targetSeatIndex % 2, // Simple team assignment
        isHuman: true
      }
    });
    
    // Join socket room
    socket.join(gameId);
    
    // Get enriched game data
    const updatedGame = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        gamePlayers: {
          include: {
            user: true
          }
        }
      }
    });
    
    if (updatedGame) {
      const enrichedGame = enrichGameForClient(updatedGame);
      
      // Emit success
      socket.emit('game_joined', { 
        gameId, 
        seatIndex: targetSeatIndex,
        game: enrichedGame 
      });
      
      // Notify other players
      socket.to(gameId).emit('player_joined', {
        userId: socket.userId,
        seatIndex: targetSeatIndex
      });
      
      // Emit game update to all clients
      io.to(gameId).emit('game_update', enrichedGame);
    }
    
    console.log(`[GAME JOIN] User ${socket.userId} successfully joined game ${gameId} at seat ${targetSeatIndex}`);
    
  } catch (error) {
    console.error('[GAME JOIN] Error joining game:', error);
    socket.emit('error', { message: 'Failed to join game' });
  }
}
