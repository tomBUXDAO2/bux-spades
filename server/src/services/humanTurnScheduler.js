import { GameService } from './GameService.js';
import { gamePresenceService } from './GamePresenceService.js';
import { playerTimerService } from './PlayerTimerService.js';
import { shouldApplyBiddingTimer } from './biddingTimerRules.js';

/**
 * After turn advances to a human bidder: autoplay if AWAY, else optional timer.
 */
export async function scheduleHumanBiddingTurn(io, gameId, nextPlayer, gameStateForTimer) {
  if (!nextPlayer?.isHuman) return;

  const away = await gamePresenceService.isAway(gameId, nextPlayer.userId);
  if (away) {
    setImmediate(() => {
      playerTimerService
        .runAutoActionImmediate(gameId, nextPlayer.userId, 'bidding')
        .catch((err) => console.error('[HUMAN TURN SCHEDULER] away auto-bid failed:', err));
    });
    return;
  }

  if (shouldApplyBiddingTimer(gameStateForTimer)) {
    playerTimerService.startPlayerTimer(gameId, nextPlayer.userId, nextPlayer.seatIndex, 'bidding');
  }
}

/**
 * After turn advances to a human in PLAYING: autoplay if AWAY, else start turn timer.
 */
export async function scheduleHumanPlayingTurn(gameId, player) {
  if (!player?.isHuman) return;

  const away = await gamePresenceService.isAway(gameId, player.userId);
  if (away) {
    setImmediate(() => {
      playerTimerService
        .runAutoActionImmediate(gameId, player.userId, 'playing')
        .catch((err) => console.error('[HUMAN TURN SCHEDULER] away auto-play failed:', err));
    });
    return;
  }

  playerTimerService.startPlayerTimer(gameId, player.userId, player.seatIndex, 'playing');
}

/**
 * New trick just started; lead might be an AWAY human (bots handled by triggerBotPlayIfNeeded).
 */
export async function scheduleAwayHumanPlayingLead(gameId) {
  const game = await GameService.getGame(gameId);
  if (!game?.currentPlayer) return;
  const p = game.players?.find((x) => x.userId === game.currentPlayer);
  if (!p?.isHuman) return;
  const away = await gamePresenceService.isAway(gameId, p.userId);
  if (!away) return;
  setImmediate(() => {
    playerTimerService
      .runAutoActionImmediate(gameId, p.userId, 'playing')
      .catch((err) => console.error('[HUMAN TURN SCHEDULER] away lead auto-play failed:', err));
  });
}

/**
 * After I'm back: if it's still this user's turn, start normal timer / autoplay rules.
 */
export async function resumeTimerAfterImBack(io, gameId, userId) {
  const game = await GameService.getGame(gameId);
  if (!game || game.currentPlayer !== userId) return;
  const p = game.players?.find((x) => x.userId === userId);
  if (!p?.isHuman) return;

  if (game.status === 'BIDDING') {
    await scheduleHumanBiddingTurn(io, gameId, p, game);
  } else if (game.status === 'PLAYING') {
    await scheduleHumanPlayingTurn(gameId, p);
  }
}
