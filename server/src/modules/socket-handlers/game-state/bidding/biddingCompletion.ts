import type { Game } from '../../../../types/game';
import { io } from '../../../../index';
import { enrichGameForClient } from '../../../../routes/games/shared/gameUtils';
import { botPlayCard } from '../../../bot-play/botLogic';

/**
 * Handles bidding completion
 */
export async function handleBiddingComplete(game: Game): Promise<void> {
  console.log('[BIDDING COMPLETE] All bids received, starting play phase');
  
  if (typeof game.dealerIndex !== 'number') {
    io.to(game.id).emit('error', { message: 'Invalid game state: no dealer assigned' });
    return;
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
  }
}
