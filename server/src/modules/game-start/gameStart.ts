import type { AuthenticatedSocket } from '../socket-auth';
import { io } from '../../index';
import { games } from '../../gamesStore';
import prisma from '../../lib/prisma';
import { enrichGameForClient } from '../../routes/games/shared/gameUtils';
import { botMakeMove } from '../bot-play/botLogic';
import { logGameStart } from '../../routes/games/database/gameDatabase';
import { newdbCreateRound } from '../../newdb/writers';
import { prismaNew } from '../../newdb/client';
import { handleBiddingComplete } from '../socket-handlers/game-state/bidding/biddingCompletion';

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

    // Check if we have 4 human players and set rated accordingly
    const humanPlayers = game.players.filter(p => p && p.type === 'human').length;
    game.rated = humanPlayers === 4;

    // Create game in database if not already created
    if (!game.dbGameId) {
      console.log('[GAME START] Creating game in database...');
      await logGameStart(game);
    }

    // Set initial status
    game.status = 'BIDDING';
    
    // Update game status in database
    if (game.dbGameId) {
      try {
        await prisma.game.update({
          where: { id: game.dbGameId },
          data: { status: 'BIDDING' }
        });
        console.log('[GAME START] Updated game status to BIDDING in database:', game.dbGameId);
      } catch (err) {
        console.error('[GAME START] Failed to update game status in database:', err);
      }
    }

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

    // Dual-write: update new DB Game status and create Round + initial hand snapshots
    try {
      await prismaNew.game.update({ where: { id: game.id }, data: { status: 'BIDDING' as any, startedAt: new Date() } });
      await newdbCreateRound({
        gameId: game.id,
        roundNumber: 1,
        dealerSeatIndex: dealerIndex,
        initialHands: hands.map((hand, i) => ({ seatIndex: i, cards: hand.map(c => ({ suit: c.suit, rank: c.rank })) })),
      });
    } catch (err) {
      console.error('[GAME START] Failed dual-write to new DB for round start:', err);
    }

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

    // MIRROR: Auto-bid for all seats, then immediately complete bidding
    if ((game as any).rules?.bidType === 'MIRROR') {
      console.log('[GAME START][MIRROR] Auto-bidding for all players based on spade counts');
      for (let i = 0; i < 4; i++) {
        const hand = game.hands[i] || [];
        const spades = hand.filter(c => c.suit === 'SPADES').length;
        const bid = spades === 0 ? 0 : spades;
        game.bidding.bids[i] = bid;
        if (game.players[i]) {
          game.players[i]!.bid = bid;
        }
      }
      // Broadcast updated bids before moving to play
      io.to(game.id).emit('game_update', enrichGameForClient(game));
      await handleBiddingComplete(game);
      io.to(game.id).emit('game_update', enrichGameForClient(game));
      return; // Do not proceed with per-turn bidding scheduling
    }

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
