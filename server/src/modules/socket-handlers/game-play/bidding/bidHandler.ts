import type { AuthenticatedSocket } from '../../../socket-auth';
import { io } from '../../../../index';
import { games } from '../../../../gamesStore';
import prisma from '../../../../lib/prisma';
import { enrichGameForClient } from '../../../../routes/games/shared/gameUtils';
import { botMakeMove } from '../../../bot-play/botLogic';
import { handleBiddingComplete } from '../../../socket-handlers/game-state/bidding/biddingCompletion';

// Single bot user ID for all bots
const BOT_USER_ID = 'bot-user-universal';

/**
 * Get the database user ID for a player (human or bot)
 */
function getPlayerDbUserId(player: any): string {
  if (player.type === 'bot') {
    return player.id;
  }
  return player.id;
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
              updatedAt: new Date()
            }
          });
        }
        // Upsert RoundBid using correct player ID
        await prisma.roundBid.upsert({
          where: {
            roundId_playerId: {
              roundId: roundRecord.id,
              playerId: getPlayerDbUserId(game.players[playerIndex]!) // Use correct ID for human/bot
            }
          },
          update: {
            bid,
            isBlindNil: bid === -1
          },
          create: {
            id: `bid_${roundRecord.id}_${playerIndex}_${Date.now()}`,
            roundId: roundRecord.id,
            playerId: getPlayerDbUserId(game.players[playerIndex]!), // Use correct ID for human/bot
            bid,
            isBlindNil: bid === -1,
            createdAt: new Date()
          }
        });
      }
    } catch (err) {
      console.error('[MAKE BID DEBUG] Failed to persist RoundBid:', err);
      // Continue gameplay even if DB logging failed
    }

    // Check if all players have bid (null means not yet bid)
    const bidsComplete = game.bidding.bids.every(b => b !== null);
    
    if (bidsComplete) {
      console.log('[MAKE BID DEBUG] All bids complete, moving to play phase');
      await handleBiddingComplete(game);
    } else {
      // Move to next player
      const nextPlayerIndex = (playerIndex + 1) % 4;
      game.bidding.currentBidderIndex = nextPlayerIndex;
      game.bidding.currentPlayer = game.players[nextPlayerIndex]?.id ?? '';
      game.currentPlayer = game.players[nextPlayerIndex]?.id ?? '';
      io.to(gameId).emit('game_update', enrichGameForClient(game));
      if (game.players[nextPlayerIndex] && game.players[nextPlayerIndex].type === 'bot') {
        setTimeout(() => {
          botMakeMove(game, nextPlayerIndex);
        }, 500);
      }
    }

  } catch (error) {
    console.error('Error in make_bid:', error);
    socket.emit('error', { message: 'Failed to process bid' });
  }
}
