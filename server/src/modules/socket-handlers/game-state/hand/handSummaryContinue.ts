import type { AuthenticatedSocket } from '../../../socket-auth';
import type { Game } from '../../../../types/game';
import { io } from '../../../../index';
import { enrichGameForClient } from '../../../../routes/games/shared/gameUtils';
import prisma from '../../../../lib/prisma';
import { trickLogger } from '../../../../lib/trick-logging';
import { games } from '../../../../gamesStore';

// Hand summary continue tracking
const handSummaryResponses = new Map<string, Set<string>>(); // gameId -> Set of player IDs who clicked continue

/**
 * Handles hand summary continue event from client
 */
export async function handleHandSummaryContinue(socket: AuthenticatedSocket, { gameId }: { gameId: string }): Promise<void> {
  console.log('[HAND SUMMARY CONTINUE] Event received:', { gameId, socketId: socket.id, userId: socket.userId });
  
  if (!socket.isAuthenticated || !socket.userId) {
    console.log('Unauthorized hand_summary_continue attempt');
    socket.emit('error', { message: 'Not authorized' });
    return;
  }

  try {
    const game = games.find((g: Game) => g.id === gameId);
    if (!game) {
      console.log(`Game ${gameId} not found`);
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Check if game is in PLAYING status
    if (game.status !== 'PLAYING') {
      console.log('[HAND SUMMARY] Game is not in PLAYING status');
      socket.emit('error', { message: 'Game is not ready for hand summary' });
      return;
    }

    // Initialize response tracking for this game if not exists
    if (!handSummaryResponses.has(gameId)) {
      handSummaryResponses.set(gameId, new Set());
    }

    // Add this player to the responses
    const responses = handSummaryResponses.get(gameId)!;
    responses.add(socket.userId);
    
    console.log('[HAND SUMMARY] Player clicked continue:', socket.userId);
    console.log('[HAND SUMMARY] Responses so far:', Array.from(responses));
    console.log('[HAND SUMMARY] Total players:', game.players.filter(p => p && p.type === 'human').length);

    // Check if all human players have responded
    const humanPlayers = game.players.filter(p => p && p.type === 'human');
    const allHumanPlayersResponded = humanPlayers.every(player => responses.has(player.id));

    if (allHumanPlayersResponded) {
      console.log('[HAND SUMMARY] All players responded, starting new hand');
      
      // Clear the responses for this game
      handSummaryResponses.delete(gameId);
      
      // Start the new hand
      await startNewHand(game);
    } else {
      console.log('[HAND SUMMARY] Not all players responded yet, waiting...');
      // Emit confirmation to this player that their continue was received
      socket.emit('hand_summary_continue_confirmed');
    }

  } catch (error) {
    console.error('Error in hand_summary_continue:', error);
    socket.emit('error', { message: 'Internal server error' });
  }
}

/**
 * Starts a new hand for an existing game
 */
async function startNewHand(game: Game): Promise<void> {
  console.log('[START NEW HAND] Starting new hand for game:', game.id);

  // Check if all seats are filled
  const filledSeats = game.players.filter(p => p !== null).length;
  if (filledSeats < 4) {
    console.log('[START NEW HAND] Not all seats are filled, cannot start new hand');
    return;
  }

  // Assign new dealer
  const newDealerIndex = (game.dealerIndex + 1) % 4;
  game.dealerIndex = newDealerIndex;
  
  // Assign dealer flag for UI
  game.players.forEach((p, i) => {
    if (p) p.isDealer = (i === newDealerIndex);
  });
  
  // Reset hands and dealing
  game.hands = [];
  game.players.forEach(p => { if (p) p.hand = []; });
  
  // Deal cards (reuse existing dealing util)
  const { assignDealer, dealCards } = require('../../../dealing/cardDealing');
  const hands = dealCards(game.players, newDealerIndex);
  game.hands = hands;
  hands.forEach((hand: import('../../../../types/game').Card[], index: number) => {
    if (game.players[index]) {
      game.players[index]!.hand = hand;
    }
  });
  
  // Move game into bidding phase for the new hand
  game.status = 'BIDDING';
  
  // Reset bidding state
  game.bidding = {
    currentBidderIndex: (newDealerIndex + 1) % 4,
    currentPlayer: game.players[(newDealerIndex + 1) % 4]?.id ?? '',
    bids: [null, null, null, null],
    nilBids: {}
  };
  
  // Clear play state
  game.play = undefined;
  
  // Reset player trick counts for new hand
  game.players.forEach(player => {
    if (player) {
      player.tricks = 0;
    }
  });
  
  // Start a new round in DB for this hand (DB-driven next round number)
  if (game.dbGameId) {
    try {
      const existingMax = await prisma.round.findFirst({
        where: { gameId: game.dbGameId },
        orderBy: { roundNumber: 'desc' },
        select: { roundNumber: true }
      });
      const nextRoundNumber = (existingMax?.roundNumber || 0) + 1;
      let roundRecord = await prisma.round.findFirst({ where: { gameId: game.dbGameId, roundNumber: nextRoundNumber } });
      if (!roundRecord) {
        roundRecord = await prisma.round.create({
          data: {
            id: `round_${game.dbGameId}_${nextRoundNumber}_${Date.now()}`,
            gameId: game.dbGameId,
            roundNumber: nextRoundNumber,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });
      }
      trickLogger.setCurrentRoundId(game.id, roundRecord.id);
      game.currentRound = nextRoundNumber;
    } catch (err) {
      console.error('Failed to start round logging for new hand:', err);
    }
  }
  
  // Emit new hand started event with dealing phase
  console.log('[START NEW HAND] Emitting new_hand_started event');
  io.to(game.id).emit('new_hand_started', {
    dealerIndex: newDealerIndex,
    hands: game.hands,
    currentBidderIndex: game.bidding.currentBidderIndex
  });
  
  // Emit game update
  io.to(game.id).emit('game_update', enrichGameForClient(game));
  
  // Add delay before starting bidding phase
  setTimeout(() => {
    // If first bidder is a bot, trigger bot bidding
    const firstBidder = game.players[game.bidding.currentBidderIndex];
    if (firstBidder && firstBidder.type === 'bot') {
      const { botMakeMove } = require('../../../bot-play/botLogic');
      botMakeMove(game, game.bidding.currentBidderIndex);
    }
  }, 1000);
}
