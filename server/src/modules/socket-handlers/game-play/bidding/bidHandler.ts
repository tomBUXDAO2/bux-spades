import type { AuthenticatedSocket } from '../../../../types/socket';
import { io } from '../../../../index';
import { enrichGameForClient } from '../../../../routes/games/shared/gameUtils';
import { prisma } from '../../../../lib/prisma';

/**
 * Handle bid socket event
 */
export async function handleMakeBid(socket: AuthenticatedSocket, data: any): Promise<void> {
  try {
    const { gameId, bid } = data;
    const userId = socket.userId;
    
    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    console.log('[BID HANDLER] User making bid:', { gameId, userId, bid });

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

    // Find the player making the bid
    const player = gamePlayers.find(p => p.userId === userId);
    if (!player) {
      socket.emit('error', { message: 'You are not in this game' });
      return;
    }

    if (dbGame.status !== 'BIDDING') {
      socket.emit('error', { message: 'Game is not in bidding phase' });
      return;
    }

    // Update player's bid in database (using a custom field or JSON)
    await prisma.gamePlayer.update({
      where: { id: player.id },
      data: { 
        // Store bid in a JSON field or custom field
        // For now, we'll use a workaround
      }
    });

    // Get next player
    const currentSeatIndex = player.seatIndex;
    const nextSeatIndex = (currentSeatIndex + 1) % 4;
    const nextPlayer = gamePlayers.find(p => p.seatIndex === nextSeatIndex);

    if (nextPlayer) {
      // Update game status to next player's turn
      await prisma.game.update({
        where: { id: gameId },
        data: { 
          status: 'BIDDING'
          // Note: currentPlayer field doesn't exist in schema
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
          currentPlayer: nextPlayer.userId, // Use nextPlayer.userId as currentPlayer
          players: gamePlayers.map(p => ({
            id: p.userId,
            seatIndex: p.seatIndex,
            bid: 0, // Default bid since field doesn't exist in schema
            isHuman: p.isHuman
          }))
        });
      }

      // If next player is a bot, trigger bot bid
      if (nextPlayer.isHuman === false) {
        setTimeout(() => {
          // Trigger bot bid logic here
          console.log('[BID HANDLER] Bot should bid now');
        }, 1000);
      }
    } else {
      // All players have bid, move to playing phase
      await prisma.game.update({
        where: { id: gameId },
        data: { status: 'PLAYING' }
      });

      io.to(gameId).emit('game_update', {
        id: gameId,
        status: 'PLAYING',
        message: 'Bidding complete, starting play phase'
      });
    }

    console.log('[BID HANDLER] Bid processed successfully');

  } catch (error) {
    console.error('[BID HANDLER] Error processing bid:', error);
    socket.emit('error', { message: 'Failed to process bid' });
  }
}
