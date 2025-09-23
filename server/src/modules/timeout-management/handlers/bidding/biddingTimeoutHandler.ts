import type { Game } from '../../../../types/game';
import { io } from '../../../../index';
import { botMakeMove } from '../../../bot-play/botLogic';
import { handleBiddingComplete } from '../../../socket-handlers/game-state/bidding/biddingCompletion';
import { enrichGameForClient } from '../../../../routes/games/shared/gameUtils';
import { startTurnTimeout, clearTurnTimeoutOnly } from '../../core/timeoutManager';
import { getRegularBid, getWhizBid, getMirrorBid, getSuicideBid, getBid4OrNil, getBid3, getBidHearts, getCrazyAces } from '../../../bot-bidding';

/**
 * Handles bidding timeout
 */
export async function handleBiddingTimeout(game: Game, playerIndex: number): Promise<void> {
  const player = game.players[playerIndex];
  if (!player || !game.bidding) {
    return;
  }

  console.log(`[TIMEOUT] Handling bidding timeout for ${player.username}`);
  
  // Clear only timers but preserve consecutive count
  clearTurnTimeoutOnly(game, player.id);
  
  // Compute a bid using the same logic as bots, respecting forced bid options
  const hand = game.hands[playerIndex] || [];
  const existingBids = game.bidding.bids.slice();
  const bidType = (game as any).rules?.bidType;
  const gimmickType = (game as any).rules?.gimmickType;

  let bid = 1;
  try {
    if (bidType === 'WHIZ') {
      bid = getWhizBid({ hand, seatIndex: playerIndex, existingBids, game }).bid;
    } else if (bidType === 'MIRROR') {
      bid = getMirrorBid({ hand, seatIndex: playerIndex, existingBids }).bid;
    } else if (bidType === 'GIMMICK' && gimmickType === 'SUICIDE') {
      bid = getSuicideBid({ hand, seatIndex: playerIndex, existingBids, dealerIndex: game.dealerIndex }).bid;
    } else if (bidType === 'GIMMICK' && gimmickType === 'BID_4_OR_NIL') {
      bid = getBid4OrNil({ hand, seatIndex: playerIndex, existingBids }).bid;
    } else if (bidType === 'GIMMICK' && gimmickType === 'BID_3') {
      bid = getBid3({ hand, seatIndex: playerIndex, existingBids }).bid;
    } else if (bidType === 'GIMMICK' && gimmickType === 'BID_HEARTS') {
      bid = getBidHearts({ hand, seatIndex: playerIndex, existingBids }).bid;
    } else if (bidType === 'GIMMICK' && gimmickType === 'CRAZY_ACES') {
      bid = getCrazyAces({ hand, seatIndex: playerIndex, existingBids }).bid;
    } else {
      bid = getRegularBid({ hand, seatIndex: playerIndex, existingBids }).bid;
    }
  } catch (e) {
    console.warn('[TIMEOUT] Heuristic bid failed; falling back to 1:', e);
    bid = 1;
  }

  // Enforce allowNil option
  const allowNil = Boolean((game as any).rules?.allowNil);
  if (!allowNil && bid === 0) {
    bid = 1;
  }

  // Record bid
  game.bidding.bids[playerIndex] = bid;
  
  // Emit timeout event
  io.to(game.id).emit('player_timeout', {
    playerId: player.id,
    playerName: player.username,
    phase: 'bidding',
    action: 'auto_bid',
    bid
  });
  
  // Check if all players have bid
  const allPlayersBid = game.bidding.bids.every(b => b !== null && b !== undefined);
  
  if (allPlayersBid) {
    // All players have bid, complete bidding
    handleBiddingComplete(game);
    io.to(game.id).emit('game_update', enrichGameForClient(game));
  } else {
    // Advance turn to next player
    const nextIndex = (playerIndex + 1) % 4;
    const nextPlayer = game.players[nextIndex];
    game.bidding.currentPlayer = nextPlayer?.id ?? '';
  
    io.to(game.id).emit('game_update', enrichGameForClient(game));
  
  // If next player is bot, trigger their move
    if (nextPlayer?.type === 'bot') {
      botMakeMove(game, nextIndex);
    } else {
      // Start timeout for human player's turn
      startTurnTimeout(game, nextIndex, 'bidding');
    }
  }
}
