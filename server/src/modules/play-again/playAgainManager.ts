import type { Game } from '../../types/game';
import { io } from '../../index';
import { enrichGameForClient } from '../../routes/games/shared/gameUtils';
import { addBotToSeat } from '../bot-invitation/botInvitation';
import { assignDealer, dealCards } from '../dealing/cardDealing';
import { logGameStart } from '../../routes/games/database/gameDatabase';
import { games } from '../../gamesStore';
import { deleteUnratedGameFromDatabase } from '../../lib/hand-completion/game/gameCompletion';

// Track play again responses
const playAgainResponses = new Map<string, Set<string>>();

/**
 * Handles play_again socket event
 */
export async function handlePlayAgain(socket: any, { gameId }: { gameId: string }): Promise<void> {
  console.log('[PLAY AGAIN] Received play_again event:', { gameId, userId: socket.userId });
  
  if (!socket.isAuthenticated || !socket.userId) {
    socket.emit('error', { message: 'Not authenticated' });
    return;
  }

  try {
    const game = games.find(g => g.id === gameId);
    if (!game) {
      console.log('[PLAY AGAIN] Game not found:', gameId);
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    if (game.status !== 'FINISHED') {
      console.log('[PLAY AGAIN] Game is not finished:', { gameId, status: game.status });
      socket.emit('error', { message: 'Game is not finished' });
      return;
    }

    // Initialize response tracking for this game if not exists
    if (!playAgainResponses.has(gameId)) {
      playAgainResponses.set(gameId, new Set());
    }

    // Add this player to the responses
    const responses = playAgainResponses.get(gameId)!;
    responses.add(socket.userId);
    
    console.log('[PLAY AGAIN] Player clicked play again:', socket.userId);
    console.log('[PLAY AGAIN] Responses so far:', Array.from(responses));

    // Emit confirmation to this player
    socket.emit('play_again_confirmed', { gameId });

    // Check if we should reset the game
    await checkAndResetGame(game);

  } catch (error) {
    console.error('[PLAY AGAIN ERROR]', error);
    socket.emit('error', { message: 'Internal server error' });
  }
}

/**
 * Checks if the game should be reset based on league status and player responses
 */
async function checkAndResetGame(game: Game): Promise<void> {
  const responses = playAgainResponses.get(game.id);
  if (!responses) return;

  console.log('[PLAY AGAIN] Checking reset conditions for game:', game.id);
  console.log('[PLAY AGAIN] League game:', game.league);
  console.log('[PLAY AGAIN] Current responses:', Array.from(responses));

  if (game.league) {
    // League game: requires all 4 players to click play again
    const allPlayers = game.players.filter(p => p !== null);
    const allPlayersResponded = allPlayers.every(player => responses.has(player.id));

    if (allPlayersResponded) {
      console.log('[PLAY AGAIN] All players responded in league game, resetting...');
      await resetGameForAllPlayers(game);
    } else {
      console.log('[PLAY AGAIN] Not all players responded in league game, waiting...');
    }
  } else {
    // Non-league game: reset when all human players have either responded or left
    const humanPlayers = game.players.filter(p => p && p.type === 'human');
    const humanPlayersResponded = humanPlayers.filter(player => responses.has(player.id));
    
    console.log('[PLAY AGAIN] Human players:', humanPlayers.length);
    console.log('[PLAY AGAIN] Human players responded:', humanPlayersResponded.length);

    if (humanPlayersResponded.length === humanPlayers.length) {
      console.log('[PLAY AGAIN] All human players responded in non-league game, resetting...');
      await resetGameForRespondingPlayers(game);
    } else {
      console.log('[PLAY AGAIN] Not all human players responded in non-league game, waiting...');
    }
  }
}

/**
 * Resets the game for all players (league games)
 */
async function resetGameForAllPlayers(game: Game): Promise<void> {
  console.log('[PLAY AGAIN] Resetting game for all players:', game.id);
  
  // Clear responses
  playAgainResponses.delete(game.id);

  // Reset game state
  await resetGameState(game);

  // Emit game reset event
  io.to(game.id).emit('game_reset', { gameId: game.id });
  io.to(game.id).emit('game_update', enrichGameForClient(game));
}

/**
 * Resets the game for responding players only (non-league games)
 */
async function resetGameForRespondingPlayers(game: Game): Promise<void> {
  console.log('[PLAY AGAIN] Resetting game for responding players:', game.id);
  
  const responses = playAgainResponses.get(game.id);
  if (!responses) return;

  // Clear responses
  playAgainResponses.delete(game.id);

  // Remove players who didn't respond
  const playersToRemove: number[] = [];
  for (let i = 0; i < game.players.length; i++) {
    const player = game.players[i];
    if (player && player.type === 'human' && !responses.has(player.id)) {
      playersToRemove.push(i);
    }
  }

  // Remove non-responding players
  for (const seatIndex of playersToRemove) {
    game.players[seatIndex] = null;
  }

  // Check if we have any human players left
  const remainingHumanPlayers = game.players.filter(p => p && p.type === 'human');
  if (remainingHumanPlayers.length === 0) {
    console.log('[PLAY AGAIN] No human players remaining, closing game');
    // Remove game from games array
    const gameIndex = games.findIndex(g => g.id === game.id);
    if (gameIndex !== -1) {
      games.splice(gameIndex, 1);
    }
    io.to(game.id).emit('game_closed', { gameId: game.id });
    
    // Clean up database for unrated games
    if (!game.rated && game.dbGameId) {
      console.log('[PLAY AGAIN] Cleaning up unrated game from database:', game.dbGameId);
      try {
        await deleteUnratedGameFromDatabase(game);
      } catch (error) {
        console.error('[PLAY AGAIN] Failed to clean up unrated game from database:', error);
      }
    }
    return;
  }

  // Reset game state
  await resetGameState(game);

  // Emit game reset event
  io.to(game.id).emit('game_reset', { gameId: game.id });
  io.to(game.id).emit('game_update', enrichGameForClient(game));
}

/**
 * Resets the game state to initial conditions
 */
async function resetGameState(game: Game): Promise<void> {
  console.log('[PLAY AGAIN] Resetting game state:', game.id);

  // Reset game status and state
  game.status = 'WAITING';
  game.currentRound = 1;
  game.currentTrick = 1;
  game.dealerIndex = 0;
  game.lastActivity = Date.now();
  game.updatedAt = Date.now();

  // Reset player states
  for (let i = 0; i < game.players.length; i++) {
    const player = game.players[i];
    if (player) {
      player.bid = undefined;
      player.tricks = 0;
      player.points = 0;
      player.bags = 0;
      player.isDealer = false;
    }
  }

  // Reset game scores
  game.team1TotalScore = 0;
  game.team2TotalScore = 0;
  game.team1Bags = 0;
  game.team2Bags = 0;

  // Clear game state
  game.hands = [];
  game.bidding = undefined;
  game.play = undefined;
  game.forcedBid = undefined;
  game.completedTricks = [];

  // IMPORTANT: Clear dbGameId so that when the game starts again, it creates a NEW database record
  // This preserves the finished game record in the database
  if (game.dbGameId) {
    console.log('[PLAY AGAIN] Clearing dbGameId to preserve finished game record:', game.dbGameId);
    game.dbGameId = undefined;
  }

  // Clear trick logger for this game

  console.log('[PLAY AGAIN] Game state reset complete:', game.id);
}

/**
 * Handles player leaving during play again phase
 */
export function handlePlayerLeaveDuringPlayAgain(gameId: string, userId: string): void {
  console.log('[PLAY AGAIN] Player left during play again phase:', { gameId, userId });
  
  const responses = playAgainResponses.get(gameId);
  if (responses) {
    responses.delete(userId);
    console.log('[PLAY AGAIN] Removed player from responses:', userId);
  }
}

/**
 * Cleans up play again state for a game
 */
export function cleanupPlayAgainState(gameId: string): void {
  console.log('[PLAY AGAIN] Cleaning up state for game:', gameId);
  playAgainResponses.delete(gameId);
}