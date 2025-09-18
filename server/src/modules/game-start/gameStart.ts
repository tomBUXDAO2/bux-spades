import type { AuthenticatedSocket } from '../../socket-auth';
import { io } from '../../index';
import { games } from '../../gamesStore';
import prisma from '../../lib/prisma';
import { enrichGameForClient } from '../../routes/games/shared/gameUtils';
import { botMakeMove } from '../bot-play/botLogic';

/**
 * Handles start_game socket event
 */
export async function handleStartGame(socket: AuthenticatedSocket, { gameId }: { gameId: string }): Promise<void> {
  
  try {
    const game = games.find(g => g.id === gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Ensure 4 seats are filled
    const filledSeats = game.players.filter(p => p !== null).length;
    if (filledSeats < 4) {
      socket.emit('error', { message: 'Not enough players to start the game' });
      return;
    }

    // Set initial status
    game.status = 'BIDDING';

    // Dealer assignment and card dealing
    const dealerIndex = typeof game.dealerIndex === 'number' ? game.dealerIndex : 0;
    const { dealCards } = await import('../dealing/cardDealing');
    const hands = dealCards(game.players, dealerIndex);

    game.hands = hands;

    // Assign hands to individual players
    hands.forEach((hand, index) => {
      if (game.players[index]) {
        game.players[index]!.hand = hand;
      }
    });

    // Bidding phase state
    const firstBidder = game.players[(dealerIndex + 1) % 4];
    if (!firstBidder) {
      throw new Error('Invalid game state: no first bidder found');
    }

    game.bidding = {
      currentPlayer: firstBidder.id,
      currentBidderIndex: (dealerIndex + 1) % 4,
      bids: [null, null, null, null], // null = not yet bid
      nilBids: {}
    };

    // Emit a dedicated game_started event for UI dealing/buy-in animation
    io.to(game.id).emit('game_started', {
      dealerIndex,
      hands: hands.map((hand, i) => ({ playerId: game.players[i]?.id, hand })),
      currentBidderIndex: game.bidding.currentBidderIndex
    });

    // Emit game update to all clients
    io.to(game.id).emit('game_update', enrichGameForClient(game));

    // If first to bid is a bot, trigger bot move shortly after so UI can render dealing/animation
    const firstBidderIndex = (dealerIndex + 1) % 4;
    const firstBidderPlayer = game.players[firstBidderIndex];
    if (firstBidderPlayer && firstBidderPlayer.type === 'bot') {
      console.log('[GAME START] First bidder is a bot; triggering bot bid');
      setTimeout(() => botMakeMove(game, firstBidderIndex), 150);
    }

  } catch (error) {
    console.error('[GAME START] Error starting game:', error);
    socket.emit('error', { message: 'Failed to start game' });
  }
}
