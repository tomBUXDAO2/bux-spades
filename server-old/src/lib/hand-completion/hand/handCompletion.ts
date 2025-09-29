import { io } from '../../../index';
import { calculateAndStoreGameScore, checkGameCompletion } from '../../databaseScoring';
import { enrichGameForClient } from '../../../routes/games/shared/gameUtils';
import type { Game } from '../../../types/game';
import { completeGame } from '../game/gameCompletion';
import prisma from '../../prisma';

// Import startTurnTimeout function
declare function startTurnTimeout(game: Game, playerIndex: number, phase: string): void;

/**
 * SINGLE HAND COMPLETION FUNCTION - NO MORE DUPLICATION
 */
export async function handleHandCompletion(game: Game): Promise<void> {
  console.log('[HAND COMPLETION DEBUG] ===== HAND COMPLETION STARTED =====');
  console.log('[HAND COMPLETION DEBUG] Game ID:', game.id);
  console.log('[HAND COMPLETION DEBUG] Game status:', game.status);
  console.log('[HAND COMPLETION DEBUG] Current round:', game.currentRound);
  console.log('[HAND COMPLETION DEBUG] DB Game ID:', game.dbGameId);
  
  try {
    console.log('[HAND COMPLETION] Starting hand completion for game:', game.id);
    console.log('[HAND COMPLETION DEBUG] Game mode:', game.mode);
    console.log('[HAND COMPLETION DEBUG] Solo flag:', game.mode === "SOLO");
    
    if (game.mode === 'SOLO') {
      console.log('[HAND COMPLETION] Solo mode - using database scoring');
    } else {
      console.log('[HAND COMPLETION] Partners mode - using database scoring');
    }
    
    // Calculate and store scores in database
    console.log('[HAND COMPLETION DEBUG] About to call calculateAndStoreGameScore with:', {
      gameId: game.dbGameId,
      roundNumber: game.currentRound
    });
    const gameScore = await calculateAndStoreGameScore(game.dbGameId);
    
    // Create hand summary data for frontend using database scores
    let handSummary;
    let playerScores = [0, 0, 0, 0];
    let playerBags = [0, 0, 0, 0];
    
    if (game.mode === 'SOLO') {
      // For solo games, get individual player scores from database
      
      // Get running total scores from database (not current round scores)
      if (game.dbGameId && gameScore && typeof gameScore === 'object' && 'success' in gameScore) {
        const scoreData = gameScore as any;
        playerScores[0] = scoreData.player0RunningTotal || 0;
        playerScores[1] = scoreData.player1RunningTotal || 0;
        playerScores[2] = scoreData.player2RunningTotal || 0;
        playerScores[3] = scoreData.player3RunningTotal || 0;
        playerBags[0] = scoreData.player0Bags || 0;
        playerBags[1] = scoreData.player1Bags || 0;
        playerBags[2] = scoreData.player2Bags || 0;
        playerBags[3] = scoreData.player3Bags || 0;
        
        console.log('[HAND COMPLETION] Solo game - using database running totals:', {
          player0: playerScores[0],
          player1: playerScores[1],
          player2: playerScores[2],
          player3: playerScores[3]
        });
      } else {
        console.log('[HAND COMPLETION] Solo game - no database scores available, using zeros');
      }
    } else {
      // For partners games, get team scores from database
      if (game.dbGameId && gameScore && typeof gameScore === 'object' && 'success' in gameScore) {
        const scoreData = gameScore as any;
        const team0Score = scoreData.team0Score || 0;
        const team1Score = scoreData.team1Score || 0;
        const team0Bags = scoreData.team0Bags || 0;
        const team1Bags = scoreData.team1Bags || 0;
        
        // Assign team scores to players
        playerScores[0] = team0Score; // Player 0 (team 0)
        playerScores[1] = team1Score; // Player 1 (team 1)
        playerScores[2] = team0Score; // Player 2 (team 0)
        playerScores[3] = team1Score; // Player 3 (team 1)
        playerBags[0] = team0Bags;
        playerBags[1] = team1Bags;
        playerBags[2] = team0Bags;
        playerBags[3] = team1Bags;
        
        console.log('[HAND COMPLETION] Partners game - using database team scores:', {
          team0: team0Score,
          team1: team1Score,
          team0Bags: team0Bags,
          team1Bags: team1Bags
        });
      } else {
        console.log('[HAND COMPLETION] Partners game - no database scores available, using zeros');
      }
    }
    
    // Create hand summary for frontend
    handSummary = {
      round: game.currentRound,
      playerScores,
      playerBags,
      gameMode: game.mode,
      isGameComplete: false
    };
    
    console.log('[HAND COMPLETION DEBUG] Hand summary created:', handSummary);
    
    // Emit hand summary to all players
    console.log('[HAND COMPLETION DEBUG] Emitting hand_summary to game room:', game.id);
    io.to(game.id).emit('hand_summary', handSummary);
    
    // Check if game is complete
    console.log('[HAND COMPLETION DEBUG] Checking game completion...');
    const completionResult = await checkGameCompletion(game.dbGameId, 500, -500);
    console.log('[HAND COMPLETION DEBUG] Game completion check result:', completionResult);
    
    if (completionResult.isGameOver) {
      console.log('[HAND COMPLETION] Game is complete, calling completeGame...');
      // Fix: Pass all 5 required arguments to completeGame
      await completeGame(game, completionResult.winningTeam || 0, {}, game.currentRound || 1, 13);
    } else {
      console.log('[HAND COMPLETION] Game continues, starting next round...');
      
      // Start next round
      game.currentRound += 1;
      game.currentTrick = 1;
      game.currentPlayer = null;
      
      // Reset player states for next round
      game.players.forEach(player => {
        if (player) {
          player.hand = [];
          player.bid = 0;
          player.tricks = 0;
          player.nil = false;
          player.blindNil = false;
        }
      });
      
      // Emit game update
      io.to(game.id).emit('game_update', enrichGameForClient(game));
      
      // Start next round after delay
      setTimeout(() => {
        console.log('[HAND COMPLETION] Starting next round...');
        io.to(game.id).emit('start_round', { round: game.currentRound });
      }, 3000);
    }
    
  } catch (error) {
    console.error('[HAND COMPLETION ERROR] Error in handleHandCompletion:', error);
    if (error instanceof Error) {
      console.error('[HAND COMPLETION ERROR] Stack trace:', error.stack);
    }
  }
}
