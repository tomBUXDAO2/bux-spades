import type { Game } from '../../types/game';
import { io } from '../../index';
import { turnTimeouts } from '../../gamesStore';
import { botMakeMove, botPlayCard } from '../bot-play/botLogic';

/**
 * Timeout configuration
 */
export const TIMEOUT_CONFIG = {
  BIDDING_TIMEOUT: 30000,    // 30 seconds for bidding
  PLAYING_TIMEOUT: 45000,    // 45 seconds for playing cards
  CONSECUTIVE_TIMEOUT_LIMIT: 3, // Max consecutive timeouts before auto-disconnect
} as const;

/**
 * Timeout data structure
 */
export interface TimeoutData {
  gameId: string;
  playerId: string;
  playerIndex: number;
  phase: 'bidding' | 'playing';
  timer: NodeJS.Timeout | null;
  consecutiveTimeouts: number;
  startTime: number;
}

/**
 * Starts a timeout for a player's turn
 */
export function startTurnTimeout(game: Game, playerIndex: number, phase: 'bidding' | 'playing'): void {
  const player = game.players[playerIndex];
  if (!player) {
    console.log('[TIMEOUT] No player at index', playerIndex);
    return;
  }

  const playerId = player.id;
  const timeoutKey = `${game.id}_${playerId}`;
  
  // Clear existing timeout if any
  clearTurnTimeout(game, playerId);
  
  const timeoutDuration = phase === 'bidding' ? TIMEOUT_CONFIG.BIDDING_TIMEOUT : TIMEOUT_CONFIG.PLAYING_TIMEOUT;
  
  console.log(`[TIMEOUT] Starting ${phase} timeout for player ${player.username} (${timeoutDuration}ms)`);
  
  const timer = setTimeout(() => {
    handlePlayerTimeout(game, playerIndex, phase);
  }, timeoutDuration);
  
  // Store timeout data
  turnTimeouts.set(timeoutKey, {
    gameId: game.id,
    playerId,
    playerIndex,
    phase,
    timer,
    consecutiveTimeouts: 0,
    startTime: Date.now()
  });
}

/**
 * Clears a timeout for a specific player
 */
export function clearTurnTimeout(game: Game, playerId: string): void {
  const timeoutKey = `${game.id}_${playerId}`;
  const existingTimeout = turnTimeouts.get(timeoutKey);
  
  if (existingTimeout && existingTimeout.timer) {
    console.log(`[TIMEOUT] Clearing timeout for player ${playerId}`);
    clearTimeout(existingTimeout.timer);
    turnTimeouts.delete(timeoutKey);
  }
}

/**
 * Clears timeout but keeps consecutive timeout count
 */
export function clearTurnTimeoutOnly(game: Game, playerId: string): void {
  const timeoutKey = `${game.id}_${playerId}`;
  const existingTimeout = turnTimeouts.get(timeoutKey);
  
  if (existingTimeout && existingTimeout.timer) {
    clearTimeout(existingTimeout.timer);
    turnTimeouts.set(timeoutKey, {
      ...existingTimeout,
      timer: null,
      consecutiveTimeouts: existingTimeout.consecutiveTimeouts
    });
  }
}

/**
 * Handles when a player times out
 */
function handlePlayerTimeout(game: Game, playerIndex: number, phase: 'bidding' | 'playing'): void {
  const player = game.players[playerIndex];
  if (!player) {
    console.log('[TIMEOUT] Player not found at index', playerIndex);
    return;
  }

  const timeoutKey = `${game.id}_${player.id}`;
  const timeoutData = turnTimeouts.get(timeoutKey);
  
  if (!timeoutData) {
    console.log('[TIMEOUT] No timeout data found for player', player.id);
    return;
  }

  // Increment consecutive timeouts
  const newConsecutiveTimeouts = timeoutData.consecutiveTimeouts + 1;
  
  console.log(`[TIMEOUT] Player ${player.username} timed out (${newConsecutiveTimeouts}/${TIMEOUT_CONFIG.CONSECUTIVE_TIMEOUT_LIMIT})`);
  
  // Update timeout data
  turnTimeouts.set(timeoutKey, {
    ...timeoutData,
    consecutiveTimeouts: newConsecutiveTimeouts
  });

  // Handle the timeout based on phase
  if (phase === 'bidding') {
    handleBiddingTimeout(game, playerIndex);
  } else if (phase === 'playing') {
    handlePlayingTimeout(game, playerIndex);
  }

  // Check if player should be auto-disconnected
  if (newConsecutiveTimeouts >= TIMEOUT_CONFIG.CONSECUTIVE_TIMEOUT_LIMIT) {
    handleConsecutiveTimeouts(game, playerIndex);
  }
}

/**
 * Handles bidding timeout
 */
function handleBiddingTimeout(game: Game, playerIndex: number): void {
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

/**
 * Handles playing timeout
 */
function handlePlayingTimeout(game: Game, playerIndex: number): void {
  const player = game.players[playerIndex];
  if (!player || !game.play || !game.hands || !game.hands[playerIndex]) {
    return;
  }

  console.log(`[TIMEOUT] Handling playing timeout for ${player.username}`);
  
  const hand = game.hands[playerIndex];
  if (hand.length === 0) {
    return;
  }

  // Play the first available card (simplified logic)
  const cardToPlay = hand[0];
  hand.splice(0, 1);
  
  // Add to current trick
  game.play.currentTrick.push(cardToPlay);
  
  console.log(`[TIMEOUT] Auto-played card for ${player.username}:`, cardToPlay);
  
  // Emit timeout event
  io.to(game.id).emit('player_timeout', {
    playerId: player.id,
    playerName: player.username,
    phase: 'playing',
    action: 'auto_play_card',
    card: cardToPlay
  });
  
  // Emit card played event
  io.to(game.id).emit('card_played', {
    gameId: game.id,
    playerId: player.id,
    card: cardToPlay,
    trickNumber: game.play.trickNumber
  });
  
  // Check if trick is complete
  if (game.play.currentTrick.length === 4) {
    // Trick complete logic would go here
    console.log('[TIMEOUT] Trick complete after timeout');
  } else {
    // Move to next player
    const nextPlayerIndex = (playerIndex + 1) % 4;
    game.play.currentPlayerIndex = nextPlayerIndex;
    game.play.currentPlayer = game.players[nextPlayerIndex]?.id ?? '';
    
    io.to(game.id).emit('game_update', game);
    
    // If next player is bot, trigger their move
    if (game.players[nextPlayerIndex] && game.players[nextPlayerIndex].type === 'bot') {
      botPlayCard(game, nextPlayerIndex);
    }
  }
}

/**
 * Handles consecutive timeouts
 */
function handleConsecutiveTimeouts(game: Game, playerIndex: number): void {
  const player = game.players[playerIndex];
  if (!player) {
    return;
  }

  console.log(`[TIMEOUT] Player ${player.username} has ${TIMEOUT_CONFIG.CONSECUTIVE_TIMEOUT_LIMIT} consecutive timeouts - auto-disconnecting`);
  
  // Emit auto-disconnect event
  io.to(game.id).emit('player_auto_disconnect', {
    playerId: player.id,
    playerName: player.username,
    reason: 'consecutive_timeouts'
  });
  
  // Replace player with bot or mark as disconnected
  // This would integrate with seat replacement logic
  console.log(`[TIMEOUT] Would replace ${player.username} with bot or mark as disconnected`);
}

/**
 * Gets timeout status for a player
 */
export function getTimeoutStatus(game: Game, playerId: string): TimeoutData | null {
  const timeoutKey = `${game.id}_${playerId}`;
  return turnTimeouts.get(timeoutKey) || null;
}

/**
 * Clears all timeouts for a game
 */
export function clearAllTimeoutsForGame(gameId: string): void {
  for (const [key, timeoutData] of turnTimeouts.entries()) {
    if (timeoutData.gameId === gameId) {
      if (timeoutData.timer) {
        clearTimeout(timeoutData.timer);
      }
      turnTimeouts.delete(key);
    }
  }
}

/**
 * Gets all active timeouts
 */
export function getAllActiveTimeouts(): Map<string, TimeoutData> {
  return new Map(turnTimeouts);
}
