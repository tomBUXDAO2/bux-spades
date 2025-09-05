import { io } from '../server';
import { games, turnTimeouts } from '../gamesStore';
import { botMakeMove, botPlayCard, handleHumanTimeout } from '../routes/games.routes';
import type { Game } from '../types/game';

export function startTurnTimeout(game: Game, playerIndex: number, phase: 'bidding' | 'playing') {
  const player = game.players[playerIndex];
  if (!player) {
    console.log('[TIMEOUT] Cannot start timeout - player not found at index:', playerIndex);
    return;
  }

  const timeoutKey = `${game.id}-${player.id}`;
  const existingTimeout = turnTimeouts.get(timeoutKey);
  
  if (existingTimeout) {
    clearTimeout(existingTimeout.timer);
    console.log('[TIMEOUT] Cleared existing timeout for player:', player.username);
  }

  const timeoutDuration = phase === 'bidding' ? 30000 : 45000; // 30s for bidding, 45s for playing
  
  const timer = setTimeout(() => {
    console.log(`[TIMEOUT] ${phase} timeout for player:`, player.username, 'in game:', game.id);
    
    if (player.type === 'human') {
      handleHumanTimeout(game, playerIndex, phase);
    } else if (player.type === 'bot') {
      // Bot timeout - trigger bot action
      if (phase === 'bidding') {
        botMakeMove(game, playerIndex);
      } else {
        botPlayCard(game, playerIndex);
      }
    }
    
    turnTimeouts.delete(timeoutKey);
  }, timeoutDuration);

  turnTimeouts.set(timeoutKey, {
    timer,
    gameId: game.id,
    playerId: player.id,
    playerIndex,
    phase,
    consecutiveTimeouts: existingTimeout?.consecutiveTimeouts || 0
  });

  console.log(`[TIMEOUT] Started ${phase} timeout for player:`, player.username, 'duration:', timeoutDuration);
}

export function clearTurnTimeout(game: Game, playerId: string) {
  const timeoutKey = `${game.id}-${playerId}`;
  const existingTimeout = turnTimeouts.get(timeoutKey);
  
  if (existingTimeout) {
    clearTimeout(existingTimeout.timer);
    turnTimeouts.delete(timeoutKey);
    console.log('[TIMEOUT] Cleared timeout for player:', playerId);
  }
}

export function clearTurnTimeoutOnly(game: Game, playerId: string) {
  const timeoutKey = `${game.id}-${playerId}`;
  const existingTimeout = turnTimeouts.get(timeoutKey);
  
  if (existingTimeout) {
    clearTimeout(existingTimeout.timer);
    turnTimeouts.set(timeoutKey, { 
      ...existingTimeout, 
      timer: null, 
      consecutiveTimeouts: existingTimeout.consecutiveTimeouts 
    });
  }
}
