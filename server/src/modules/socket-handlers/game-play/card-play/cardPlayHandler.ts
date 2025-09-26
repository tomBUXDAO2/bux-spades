import type { AuthenticatedSocket } from '../../../../types/socket';
import { io } from '../../../../index';
import { enrichGameForClient } from '../../../../routes/games/shared/gameUtils';
import { prisma } from '../../../../lib/prisma';

/**
 * Handle play card socket event
 */
export async function handlePlayCard(socket: AuthenticatedSocket, data: any): Promise<void> {
  try {
    const { gameId, card } = data;
    const userId = socket.userId;
    
    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    console.log('[CARD PLAY HANDLER] User playing card:', { gameId, userId, card });

    // Fetch game from database
    const dbGame = await prisma.game.findUnique({
      where: { id: gameId }
    });

    if (!dbGame) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Get game players
    const gamePlayers = await prisma.gamePlayer.findMany({
      where: { gameId: gameId },
      orderBy: { seatIndex: 'asc' }
    });

    // Find the player playing the card
    const player = gamePlayers.find(p => p.userId === userId);
    if (!player) {
      socket.emit('error', { message: 'You are not in this game' });
      return;
    }

    if (dbGame.status !== 'PLAYING') {
      socket.emit('error', { message: 'Game is not in playing phase' });
      return;
    }

    // Get next player
    const currentSeatIndex = player.seatIndex;
    const nextSeatIndex = (currentSeatIndex + 1) % 4;
    const nextPlayer = gamePlayers.find(p => p.seatIndex === nextSeatIndex);

    if (nextPlayer) {
      // Update game status to next player's turn
      await prisma.game.update({
        where: { id: gameId },
        data: { 
          status: 'PLAYING'
        }
      });

      // Emit game update
      const updatedGame = await prisma.game.findUnique({
        where: { id: gameId }
      });

      if (updatedGame) {
        io.to(gameId).emit('game_update', {
          id: updatedGame.id,
          status: updatedGame.status,
          currentPlayer: nextPlayer.userId,
          players: gamePlayers.map((p: any) => ({
            id: p.userId,
            seatIndex: p.seatIndex,
            isHuman: p.isHuman
          }))
        });
      }

      // If next player is a bot, trigger bot play
      if (nextPlayer.isHuman === false) {
        setTimeout(() => {
          // Trigger bot play logic here
          console.log('[CARD PLAY HANDLER] Bot should play now');
        }, 1000);
      }
    } else {
      // All players have played, move to next trick or hand
      await prisma.game.update({
        where: { id: gameId },
        data: { status: 'PLAYING' }
      });

      io.to(gameId).emit('game_update', {
        id: gameId,
        status: 'PLAYING',
        message: 'Trick complete, starting next trick'
      });
    }

    console.log('[CARD PLAY HANDLER] Card played successfully');

  } catch (error) {
    console.error('[CARD PLAY HANDLER] Error processing card play:', error);
    socket.emit('error', { message: 'Failed to process card play' });
  }
}
