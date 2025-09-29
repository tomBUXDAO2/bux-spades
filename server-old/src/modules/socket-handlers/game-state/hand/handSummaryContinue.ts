import type { AuthenticatedSocket } from '../../../../types/socket';
import { io } from '../../../../index';
import { enrichGameForClient } from '../../../../routes/games/shared/gameUtils';
import { prisma } from '../../../../lib/prisma';

/**
 * Handle hand summary continue socket event
 */
export async function handleHandSummaryContinue(socket: AuthenticatedSocket, data: any): Promise<void> {
  try {
    const { gameId } = data;
    const userId = socket.userId;
    
    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    console.log('[HAND SUMMARY CONTINUE] User continuing hand summary:', { gameId, userId });

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

    // Find the player
    const player = gamePlayers.find(p => p.userId === userId);
    if (!player) {
      socket.emit('error', { message: 'You are not in this game' });
      return;
    }

    // Create a simplified game object for compatibility
    const game = {
      id: dbGame.id,
      status: dbGame.status,
      currentRound: 1, // Default value
      dealerIndex: 0, // Default value
      dbGameId: dbGame.id,
      currentPlayer: '', // Add currentPlayer property
      players: gamePlayers.map((p: any) => ({
        id: p.userId,
        username: `Player ${p.seatIndex + 1}`,
        type: p.isHuman ? 'human' : 'bot',
        seatIndex: p.seatIndex,
        bid: 0,
        tricks: 0,
        points: 0,
        bags: 0
      })),
      hands: [] as any[], // Explicitly type as any[]
      bidding: {
        currentPlayer: '',
        currentBidderIndex: -1,
        bids: [null, null, null, null] as any[], // Explicitly type as any[]
        nilBids: {}
      },
      play: {
        currentPlayer: '',
        currentPlayerIndex: -1,
        currentTrick: [] as any[], // Explicitly type as any[]
        tricks: [] as any[], // Explicitly type as any[]
        trickNumber: 1,
        spadesBroken: false
      }
    };

    // Emit game update
    io.to(gameId).emit('game_update', {
      id: game.id,
      status: game.status,
      currentPlayer: game.currentPlayer,
      players: game.players.map((p: any) => ({
        id: p.id,
        username: p.username,
        type: p.type,
        seatIndex: p.seatIndex,
        bid: p.bid,
        tricks: p.tricks,
        points: p.points,
        bags: p.bags
      }))
    });

    console.log('[HAND SUMMARY CONTINUE] Hand summary continue processed successfully');

  } catch (error) {
    console.error('[HAND SUMMARY CONTINUE] Error processing hand summary continue:', error);
    socket.emit('error', { message: 'Failed to process hand summary continue' });
  }
}

/**
 * Initialize hand summary tracking
 */
export function initializeHandSummaryTracking(game: any): void {
  console.log('[HAND SUMMARY TRACKING] Initializing hand summary tracking for game:', game.id);
  // Placeholder implementation
}
