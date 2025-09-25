import type { AuthenticatedSocket } from '../../../socket-auth';
import { io } from '../../../../index';
import { games } from '../../../../gamesStore';
import prisma from '../../../../lib/prisma';
import { enrichGameForClient } from '../../../../routes/games/shared/gameUtils';
import { botMakeMove } from '../../../bot-play/botLogic';
import { handleBiddingComplete } from '../../../socket-handlers/game-state/bidding/biddingCompletion';
import { startTurnTimeout, clearTurnTimeout } from '../../../timeout-management/core/timeoutManager';
import { prisma } from '../../../../lib/prisma';
import { newdbEnsureRound, newdbUpsertBid } from '../../../../newdb/writers';

/**
 * Get the database user ID for a player (human or bot)
 */
function getPlayerDbUserId(player: any): string {
  return player?.id;
}

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
    const isBlindNilBid = bid === -1;
    const blindNilAllowed = Boolean(game.rules?.allowBlindNil);
    if ((bid < 0 || bid > 13) && !(isBlindNilBid && blindNilAllowed)) {
      socket.emit('error', { message: 'Invalid bid amount' });
      return;
    }

    // Enforce no-nil option for regular/whiz/mirror when disabled
    if (bid === 0 && !(game.rules.allowNil)) {
      socket.emit('error', { message: 'Nil is not allowed in this game' });
      return;
    }

    // Record the bid in memory
    game.bidding.bids[playerIndex] = bid;
    game.players[playerIndex]!.bid = bid;
    console.log('[MAKE BID DEBUG] Bid recorded:', { playerIndex, bid, totalBids: game.bidding.bids.filter(b => b !== null).length });

    // Emit an immediate update so UI reflects the bid
    // Emit an immediate update so UI reflects the bid
    io.to(game.id).emit('game_update', enrichGameForClient(game));

    // Update game status to BIDDING if still WAITING (before first bid)
    if ((game.status as string) === 'WAITING') {
      game.status = 'BIDDING';
      await prisma.game.update({
        where: { id: game.dbGameId },
        data: { status: 'BIDDING' }
      });
      // Dual-write to new DB status as well
      try {
        await prisma.game.update({ where: { id: game.id }, data: { status: 'BIDDING' as any } });
      } catch (err) {
        console.error('[MAKE BID DEBUG] Failed to update newdb game status to BIDDING:', err);
      }
    }

    // Persist the bid to database (RoundBid upsert) before proceeding
    try {
      if (game.dbGameId) {
        // Determine current roundNumber
        let roundNumber = game.currentRound || 1;
        // Find/create Round record
        let roundRecord = await prisma.round.findFirst({ where: { gameId: game.dbGameId, roundNumber } });
        if (!roundRecord) {
          roundRecord = await prisma.round.create({
            data: {
              id: `round_${game.dbGameId}_${roundNumber}_${Date.now()}`,
              gameId: game.dbGameId,
              roundNumber,
              createdAt: new Date(),
              // updatedAt: new Date()
            }
          });
        }

        const dbPlayerId = getPlayerDbUserId(game.players[playerIndex]!);

        await prisma.roundBid.upsert({
          where: {
            roundId_playerId: {
              roundId: roundRecord.id,
              playerId: dbPlayerId
            }
          },
          update: {
            bid,
            isBlindNil: bid === -1
          },
          create: {
            id: `bid_${roundRecord.id}_${playerIndex}_${Date.now()}`,
            roundId: roundRecord.id,
            playerId: dbPlayerId,
            bid,
            isBlindNil: bid === -1,
            createdAt: new Date()
          }
        });
      }

      // Dual-write: ensure round and upsert bid in new DB
      try {
        const roundId = await newdbEnsureRound({ gameId: game.id, roundNumber: game.currentRound || 1, dealerSeatIndex: game.dealerIndex ?? 0 });
        await newdbUpsertBid({ roundId, userId, seatIndex: playerIndex, bid });
      } catch (err) {
        console.error('[MAKE BID DEBUG] Failed to dual-write bid to new DB:', err);
      }
    } catch (err) {
      console.error('[MAKE BID DEBUG] Failed to persist RoundBid:', err);
      // Continue gameplay even if DB logging failed
    }

    // Clear timeout for current player since they acted
    clearTurnTimeout(game, userId);

    // Check if all players have bid (null means not yet bid)
    const bidsComplete = game.bidding.bids.every(b => b !== null);
    
    if (bidsComplete) {
      await handleBiddingComplete(game);
      io.to(game.id).emit('game_update', enrichGameForClient(game));
    } else {
      // Advance turn to next player and notify UI
      const nextIndex = (playerIndex + 1) % 4;
      const nextPlayer = game.players[nextIndex];
      game.bidding.currentPlayer = nextPlayer?.id ?? '';
      io.to(game.id).emit('game_update', enrichGameForClient(game));

      if (nextPlayer?.type === 'bot') {
        await botMakeMove(game, nextIndex);
      } else {
        // Start timeout for human player's turn
        startTurnTimeout(game, nextIndex, 'bidding');
      }
    }
  } catch (error) {
    console.error('[MAKE BID ERROR]', error);
    socket.emit('error', { message: 'Failed to process bid' });
  }
}
