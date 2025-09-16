import type { AuthenticatedSocket } from '../socket-auth';
import type { Game } from '../../types/game';
import { io } from '../../index';
import { games } from '../../gamesStore';
import { enrichGameForClient } from '../../routes/games/shared/gameUtils';
import { botMakeMove } from '../bot-play/botLogic';
import { assignDealer, dealCards } from '../dealing/cardDealing';
import { logGameStart } from '../../routes/games/database/gameDatabase';
import prisma from '../../lib/prisma';
import { trickLogger } from '../../lib/trick-logging';

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
      console.log('[GAME START] Game not found:', gameId);
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    if (game.status !== 'WAITING') {
      console.log('[GAME START] Game already started:', { gameId, status: game.status });
      socket.emit('error', { message: 'Game already started' });
      return;
    }

    // Check if all seats are filled
    const filledSeats = game.players.filter(p => p !== null).length;
    console.log('[GAME START] Checking seats:', { gameId, filledSeats, totalSeats: 4 });
    
    if (filledSeats < 4) {
      console.log('[GAME START] Not all seats filled:', { gameId, filledSeats });
      socket.emit('error', { message: 'All seats must be filled to start the game' });
      return;
    }

    // Move to bidding before persisting so DB status is correct
    game.status = 'BIDDING';

    // Ensure game is logged in DB and Round 1 exists
    try {
      if (!game.dbGameId) {
        console.log('[GAME START] Creating game in database...');
        await logGameStart(game);
      }
      // Create Round 1 if missing
      const existingRound = await prisma.round.findFirst({ where: { gameId: game.dbGameId! , roundNumber: 1 } });
      if (!existingRound) {
        console.log('[GAME START] Creating Round 1 in database...');
        const roundId = `round_${game.dbGameId}_1_${Date.now()}`;
        await prisma.round.create({
          data: {
            id: roundId,
            gameId: game.dbGameId!,
            roundNumber: 1,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });
        // Set the round ID for trick logging
        trickLogger.setCurrentRoundId(game.id, roundId);
      } else {
        // Round exists: still set round ID so trick logging works
        trickLogger.setCurrentRoundId(game.id, existingRound.id);
      }
    } catch (err) {
      console.error('[GAME START] Failed to ensure DB game/round records:', err);
      // Continue anyway; bid logging will skip if dbGameId missing
    }

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
      bids: [null, null, null, null], // null = not yet bid
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
      setTimeout(() => botMakeMove(game, (dealerIndex + 1) % 4), 500);
    }

  } catch (err) {
    console.error('[GAME START] Error in handleStartGame:', err);
    socket.emit('error', { message: 'Failed to start game' });
  }
}
