import type { Game } from '../../types/game';
import { io } from '../../index';
import { enrichGameForClient } from '../../routes/games/shared/gameUtils';
import { addBotToSeat } from '../bot-invitation/botInvitation';
import { assignDealer, dealCards } from '../dealing/cardDealing';
import { logGameStart } from '../../routes/games/database/gameDatabase';
import { deleteUnratedGameFromDatabase } from '../../lib/hand-completion/game/gameCompletion';
import { prisma } from '../../lib/prisma';

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
    // Fetch game from database instead of in-memory
    const dbGame = await prisma.game.findUnique({
      where: { id: gameId }
    });

    if (!dbGame) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Get players from database
    const players = await prisma.gamePlayer.findMany({
      where: { gameId: gameId },
      orderBy: { seatIndex: 'asc' }
    });

    // Check if user is in this game
    const player = players.find(p => p.userId === socket.userId);
    if (!player) {
      socket.emit('error', { message: 'You are not in this game' });
      return;
    }

    // Add user to play again responses
    if (!playAgainResponses.has(gameId)) {
      playAgainResponses.set(gameId, new Set());
    }
    playAgainResponses.get(gameId)!.add(socket.userId);

    console.log('[PLAY AGAIN] User wants to play again:', { gameId, userId: socket.userId });
    console.log('[PLAY AGAIN] Current responses:', Array.from(playAgainResponses.get(gameId) || []));

    // Check if all human players want to play again
    const humanPlayers = players.filter(p => p.isHuman);
    const humanPlayerIds = humanPlayers.map(p => p.userId);
    const responses = playAgainResponses.get(gameId) || new Set();
    
    const allHumanPlayersResponded = humanPlayerIds.every(id => responses.has(id));
    
    if (allHumanPlayersResponded) {
      console.log('[PLAY AGAIN] All human players want to play again, starting new game');
      
      // Clear play again responses
      playAgainResponses.delete(gameId);
      
      // Create new game with same settings
      const newGameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Create new game in database
      const newGame = await prisma.game.create({
        data: {
          id: newGameId,
          createdById: dbGame.createdById,
          mode: dbGame.mode,
          format: dbGame.format,
          gimmickVariant: dbGame.gimmickVariant,
          isLeague: dbGame.isLeague,
          isRated: dbGame.isRated,
          specialRules: dbGame.specialRules,
          status: 'WAITING',
          createdAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Add all human players to new game
      for (const player of humanPlayers) {
        await prisma.gamePlayer.create({
          data: {
            gameId: newGameId,
            userId: player.userId,
            seatIndex: player.seatIndex,
            teamIndex: player.teamIndex,
            isHuman: true,
            joinedAt: new Date(),
            leftAt: new Date()
          }
        });
      }

      // Fill remaining seats with bots
      const occupiedSeats = humanPlayers.map(p => p.seatIndex);
      for (let i = 0; i < 4; i++) {
        if (!occupiedSeats.includes(i)) {
          await addBotToSeat({ id: newGameId, dbGameId: newGameId } as any, i);
        }
      }

      // Notify all players about new game
      io.to(gameId).emit('play_again_new_game', { 
        newGameId,
        message: 'New game created! Redirecting...' 
      });

      console.log('[PLAY AGAIN] New game created:', newGameId);
    } else {
      console.log('[PLAY AGAIN] Waiting for more players to respond');
      
      // Notify players about current status
      io.to(gameId).emit('play_again_status', {
        responded: Array.from(responses),
        total: humanPlayerIds.length,
        message: `${responses.size}/${humanPlayerIds.length} players want to play again`
      });
    }

  } catch (error) {
    console.error('[PLAY AGAIN] Error handling play again:', error);
    socket.emit('error', { message: 'Failed to process play again request' });
  }
}

/**
 * Handle player leaving during play again
 */
export async function handlePlayerLeaveDuringPlayAgain(gameId: string, userId: string): Promise<void> {
  console.log('[PLAY AGAIN] Player left during play again:', { gameId, userId });
  
  try {
    // Remove user from play again responses
    if (playAgainResponses.has(gameId)) {
      playAgainResponses.get(gameId)!.delete(userId);
    }

    // Check if we should cancel play again
    const responses = playAgainResponses.get(gameId) || new Set();
    if (responses.size === 0) {
      playAgainResponses.delete(gameId);
      console.log('[PLAY AGAIN] No more responses, clearing play again state');
    }

  } catch (error) {
    console.error('[PLAY AGAIN] Error handling player leave during play again:', error);
  }
}

/**
 * Clear play again responses for a game
 */
export function clearPlayAgainResponses(gameId: string): void {
  playAgainResponses.delete(gameId);
  console.log('[PLAY AGAIN] Cleared play again responses for game:', gameId);
}

/**
 * Get play again responses for a game
 */
export function getPlayAgainResponses(gameId: string): string[] {
  return Array.from(playAgainResponses.get(gameId) || []);
}

/**
 * Check if all human players have responded to play again
 */
export function allHumanPlayersResponded(gameId: string, humanPlayerIds: string[]): boolean {
  const responses = playAgainResponses.get(gameId) || new Set();
  return humanPlayerIds.every(id => responses.has(id));
}

/**
 * Cleanup play again state
 */
export function cleanupPlayAgainState(gameId: string): void {
  clearPlayAgainResponses(gameId);
}
