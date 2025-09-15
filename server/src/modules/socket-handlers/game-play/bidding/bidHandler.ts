import type { AuthenticatedSocket } from '../../../socket-auth';
import type { Game } from '../../../../types/game';
import { io } from '../../../../index';
import { games } from '../../../../gamesStore';
import { enrichGameForClient } from '../../../../routes/games/shared/gameUtils';
import { botMakeMove } from '../../../bot-play/botLogic';
import { handleBiddingComplete } from '../../game-state/gameStateHandler';

/**
 * Handles make_bid socket event
 */
export async function handleMakeBid(socket: AuthenticatedSocket, { gameId, userId, bid }: { gameId: string; userId: string; bid: number }): Promise<void> {
  console.log('[MAKE BID DEBUG] Received bid:', { gameId, userId, bid, socketId: socket.id });
  
  if (!socket.isAuthenticated || !socket.userId) {
    socket.emit('error', { message: 'Not authenticated' });
    return;
  }

  try {
    const game = games.find(g => g.id === gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    if (game.status !== 'BIDDING') {
      socket.emit('error', { message: 'Game is not in bidding phase' });
      return;
    }

    if (!game.bidding || game.bidding.currentPlayer !== userId) {
      socket.emit('error', { message: 'Not your turn to bid' });
      return;
    }

    const playerIndex = game.players.findIndex(p => p && p.id === userId);
    if (playerIndex === -1) {
      socket.emit('error', { message: 'Player not found in game' });
      return;
    }

    // Validate bid
    if (bid < 0 || bid > 13) {
      socket.emit('error', { message: 'Invalid bid amount' });
      return;
    }

    // Record the bid
    game.bidding.bids[playerIndex] = bid;
    game.players[playerIndex]!.bid = bid;
    
    console.log('[MAKE BID DEBUG] Bid recorded:', { playerIndex, bid, totalBids: game.bidding.bids.filter(b => b !== undefined).length });

    // Emit bid made event
    io.to(gameId).emit('bid_made', {
      gameId,
      playerId: userId,
      bid,
      playerIndex
    });

    // Check if all players have bid
    const bidsComplete = game.bidding.bids.every(bid => bid !== undefined);
    
    if (bidsComplete) {
      console.log('[MAKE BID DEBUG] All bids complete, moving to play phase');
      await handleBiddingComplete(game);
    } else {
      // Move to next player
      const nextPlayerIndex = (playerIndex + 1) % 4;
      game.bidding.currentBidderIndex = nextPlayerIndex;
      game.bidding.currentPlayer = game.players[nextPlayerIndex]?.id ?? '';
      
      io.to(gameId).emit('game_update', enrichGameForClient(game));
      
      // If next player is bot, trigger their move
      if (game.players[nextPlayerIndex] && game.players[nextPlayerIndex].type === 'bot') {
        setTimeout(() => {
          botMakeMove(game, nextPlayerIndex);
        }, 500);
      }
    }

  } catch (error) {
    console.error('Error in make_bid:', error);
    socket.emit('error', { message: 'Internal server error' });
  }
}
