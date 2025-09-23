import type { Game } from '../../../../types/game';
import { io } from '../../../../index';
import { enrichGameForClient } from '../../../../routes/games/shared/gameUtils';
import { botPlayCard } from '../../../bot-play/botLogic';
import prisma from '../../../../lib/prisma';
import { startTurnTimeout } from '../../../timeout-management/core/timeoutManager';
import { newdbEnsureRound, newdbUpsertBid } from '../../../../newdb/writers';
import { prismaNew } from '../../../../newdb/client';
import { useNewDbOnly } from '../../../../newdb/toggle';

/**
 * Handles bidding completion
 */
export async function handleBiddingComplete(game: Game): Promise<void> {
  console.log('[BIDDING COMPLETE] All bids received, starting play phase');
  
  if (typeof game.dealerIndex !== 'number') {
    io.to(game.id).emit('error', { message: 'Invalid game state: no dealer assigned' });
    return;
  }

  // Ensure 4 RoundBid rows exist for this round in DB
  try {
    if (game.dbGameId) {
      const roundNumber = game.currentRound || 1;
      let roundRecord = await prisma.round.findFirst({ where: { gameId: game.dbGameId, roundNumber } });
      if (!roundRecord) {
        roundRecord = await prisma.round.create({
          data: {
            id: `round_${game.dbGameId}_${roundNumber}_${Date.now()}`,
            gameId: game.dbGameId,
            roundNumber,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });
      }
      for (let i = 0; i < 4; i++) {
        const p = game.players[i];
        if (!p) continue;
        const bid = game.bidding.bids[i] ?? 0;
        await prisma.roundBid.upsert({
          where: { roundId_playerId: { roundId: roundRecord.id, playerId: p.id } },
          update: { bid, isBlindNil: bid === -1 },
          create: {
            id: `bid_${roundRecord.id}_${i}_${Date.now()}`,
            roundId: roundRecord.id,
            playerId: p.id,
            bid,
            isBlindNil: bid === -1,
            createdAt: new Date()
          }
        });
      }

      // NEW DB: ensure round and upsert bids
      try {
        const roundIdNew = await newdbEnsureRound({ gameId: game.id, roundNumber, dealerSeatIndex: game.dealerIndex });
        for (let i = 0; i < 4; i++) {
          const p = game.players[i];
          if (!p) continue;
          const bid = game.bidding.bids[i] ?? 0;
          await newdbUpsertBid({ roundId: roundIdNew, userId: p.id, seatIndex: i, bid });
        }
      } catch (e) {
        console.warn('[NEWDB] Failed to dual-write bids on completion:', e);
      }
    }
  } catch (err) {
    console.error('[BIDDING COMPLETE] Failed to ensure 4 RoundBid rows:', err);
  }
  
  console.log("[BIDDING COMPLETE DEBUG] dealerIndex:", game.dealerIndex, "firstPlayerIndex:", (game.dealerIndex + 1) % 4);
  console.log("[BIDDING COMPLETE DEBUG] players array:", game.players.map((p, i) => `${i}: ${p?.username || "null"}`));
  console.log("[BIDDING COMPLETE DEBUG] selected player:", game.players[(game.dealerIndex + 1) % 4]?.username);
  const firstPlayer = game.players[(game.dealerIndex + 1) % 4];
  if (!firstPlayer) {
    io.to(game.id).emit('error', { message: 'Invalid game state' });
    return;
  }
  
  // Update game status
  game.status = 'PLAYING';
  game.play = {
    currentPlayer: firstPlayer.id ?? '',
    currentPlayerIndex: (game.dealerIndex + 1) % 4,
    currentTrick: [],
    tricks: [],
    trickNumber: 0,
    spadesBroken: false
  };
  
  
  // Update game status in database
  if (game.dbGameId) {
    try {
      await prisma.game.update({
        where: { id: game.dbGameId },
        data: { status: 'PLAYING' }
      });
      console.log('[BIDDING COMPLETE] Updated game status to PLAYING in database:', game.dbGameId);
    } catch (err) {
      console.error('[BIDDING COMPLETE] Failed to update game status in database:', err);
    }
  }

  // NEW DB: also update status when using new DB only
  if (useNewDbOnly) {
    try {
      await prismaNew.game.update({
        where: { id: game.id },
        data: { status: 'PLAYING' as any }
      });
      console.log('[BIDDING COMPLETE] Updated new DB game status to PLAYING:', game.id);
    } catch (err) {
      console.error('[BIDDING COMPLETE] Failed to update new DB game status:', err);
    }
  }
  
  console.log('[BIDDING COMPLETE] Moving to play phase, first player:', firstPlayer.username);
  
  // Emit events
  io.to(game.id).emit('game_update', enrichGameForClient(game));
  io.to(game.id).emit('bidding_complete', { currentBidderIndex: null, bids: game.bidding.bids });
  io.to(game.id).emit('play_start', {
    gameId: game.id,
    currentPlayerIndex: game.play.currentPlayerIndex,
    currentTrick: game.play.currentTrick,
    // trickNumber: game.play.trickNumber,
  });
  
  // If first player is a bot, trigger bot card play
  if (firstPlayer.type === 'bot') {
    setTimeout(() => {
      botPlayCard(game, (game.dealerIndex + 1) % 4);
    }, 500);
  } else {
    // Start timeout for human player's first card play
    startTurnTimeout(game, (game.dealerIndex + 1) % 4, 'playing');
  }
}
