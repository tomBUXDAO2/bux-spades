import type { AuthenticatedSocket } from '../socket-auth';
import type { Game } from '../../types/game';
import { io } from '../../index';
import { games } from '../../gamesStore';
import { enrichGameForClient } from '../../routes/games/shared/gameUtils';
import { botMakeMove } from '../bot-play/botLogic';
import { assignDealer, dealCards } from '../dealing/cardDealing';

/**
 * Handles start_game socket event
 */
export async function handleStartGame(socket: AuthenticatedSocket, { gameId }: { gameId: string }): Promise<void> {
  console.log('[GAME START] Received start_game event:', { gameId, userId: socket.userId });
  
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

    if (game.status !== 'WAITING') {
      socket.emit('error', { message: 'Game already started' });
      return;
    }

    // Check if all seats are filled
    const filledSeats = game.players.filter(p => p !== null).length;
    if (filledSeats < 4) {
      socket.emit('error', { message: 'All seats must be filled to start the game' });
      return;
    }

    // Set bot game flag
    const allHuman = game.players.length === 4 && game.players.every(p => p && p.type === 'human');
    game.isBotGame = !allHuman;

    console.log('[GAME START] Starting game:', {
      gameId: game.id,
      isBotGame: game.isBotGame,
      players: game.players.map(p => p ? `${p.username} (${p.type})` : 'null')
    });

    // Start the game
    game.status = 'BIDDING';

    // Dealer assignment and card dealing
    const dealerIndex = assignDealer(game.players, game.dealerIndex);
    game.dealerIndex = dealerIndex;

    // Assign dealer flag for UI
    game.players.forEach((p, i) => {
      if (p) p.isDealer = (i === dealerIndex);
    });

    // Deal cards
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
      bids: [null, null, null, null],
      nilBids: {}
    };

    console.log('[GAME START] Game started successfully:', {
      gameId: game.id,
      dealerIndex,
      firstBidder: firstBidder.username,
      isBotGame: game.isBotGame
    });

    // Emit to all players
    io.emit('games_updated', games.filter(g => g.status === 'WAITING'));
    io.to(game.id).emit('game_started', {
      dealerIndex,
      hands: hands.map((hand, i) => ({
        playerId: game.players[i]?.id,
        hand
      })),
      bidding: game.bidding,
    });

    // Emit game_update for client sync
    io.to(game.id).emit('game_update', enrichGameForClient(game));

    // If first bidder is a bot, trigger bot bidding
    if (firstBidder.type === 'bot') {
      console.log('[GAME START] First bidder is bot, triggering bot move');
      setTimeout(() => {
        botMakeMove(game, (dealerIndex + 1) % 4);
      }, 1000);
    }

  } catch (err) {
    console.error('Error in handleStartGame:', err);
    socket.emit('error', { message: 'Failed to start game' });
  }
}
