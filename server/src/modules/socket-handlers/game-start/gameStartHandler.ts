import type { AuthenticatedSocket } from '../../../types/socket';
import { io } from '../../../index';
import { prisma } from '../../../lib/prisma';

/**
 * Handle game start socket event
 */
export async function handleStartGame(socket: AuthenticatedSocket, data: any): Promise<void> {
  try {
    console.log('[GAME START] User wants to start game:', { gameId: data.gameId, userId: socket.userId });
    
    if (!socket.isAuthenticated || !socket.userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    const { gameId } = data;
    if (!gameId) {
      socket.emit('error', { message: 'Game ID required' });
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

    // Check if user is in this game
    const player = await prisma.gamePlayer.findFirst({
      where: {
        gameId: gameId,
        userId: socket.userId
      }
    });

    if (!player) {
      socket.emit('error', { message: 'You are not in this game' });
      return;
    }

    // Update game status to BIDDING
    await prisma.game.update({
      where: { id: gameId },
      data: { status: 'BIDDING' }
    });

    // Notify all players
    io.to(gameId).emit('game_started', { gameId });
    console.log('[GAME START] Game started:', gameId);

  } catch (error) {
    console.error('[GAME START] Error starting game:', error);
    socket.emit('error', { message: 'Failed to start game' });
  }
}
