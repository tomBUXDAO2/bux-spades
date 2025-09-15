import type { Game } from '../../../../types/game';
import { io } from '../../../../index';
import { botMakeMove } from '../../../bot-play/botLogic';

/**
 * Handles bidding timeout
 */
export function handleBiddingTimeout(game: Game, playerIndex: number): void {
  const player = game.players[playerIndex];
  if (!player || !game.bidding) {
    return;
  }

  console.log(`[TIMEOUT] Handling bidding timeout for ${player.username}`);
  
  // Make a default bid (1)
  game.bidding.bids[playerIndex] = 1;
  
  // Emit timeout event
  io.to(game.id).emit('player_timeout', {
    playerId: player.id,
    playerName: player.username,
    phase: 'bidding',
    action: 'default_bid'
  });
  
  // Continue with normal bidding flow
  const nextPlayerIndex = (playerIndex + 1) % 4;
  game.bidding.currentBidderIndex = nextPlayerIndex;
  game.bidding.currentPlayer = game.players[nextPlayerIndex]?.id ?? '';
  
  io.to(game.id).emit('bidding_update', {
    currentBidderIndex: nextPlayerIndex,
    bids: game.bidding.bids,
  });
  
  // If next player is bot, trigger their move
  if (game.players[nextPlayerIndex] && game.players[nextPlayerIndex].type === 'bot') {
    botMakeMove(game, nextPlayerIndex);
  }
}
