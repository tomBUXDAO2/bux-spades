import { io } from '../../../index';
import { calculateAndStoreGameScore, checkGameCompletion } from '../../databaseScoring';
import { trickLogger } from "../../trick-logging";
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
    console.log('[HAND COMPLETION DEBUG] Game mode:', game.gameMode);
    console.log('[HAND COMPLETION DEBUG] Solo flag:', game.solo);
    
    if (game.gameMode === 'SOLO' || game.solo) {
      console.log('[HAND COMPLETION] Solo mode - using database scoring');
    } else {
      console.log('[HAND COMPLETION] Partners mode - using database scoring');
    }
    
    // Calculate and store scores in database
    console.log('[HAND COMPLETION DEBUG] About to call calculateAndStoreGameScore with:', {
      gameId: game.dbGameId,
      roundNumber: game.currentRound
    });
    const gameScore = await calculateAndStoreGameScore(game.dbGameId, game.currentRound);
    
    // Create hand summary data for frontend using database scores
    let handSummary;
    let playerScores = [0, 0, 0, 0];
    let playerBags = [0, 0, 0, 0];
    
    if (game.gameMode === 'SOLO' || game.solo) {
      // For solo games, get individual player scores from database
      
      // Get running total scores from database (not current round scores)
      if (game.dbGameId && gameScore) {
        playerScores[0] = gameScore.player0RunningTotal || 0;
        playerScores[1] = gameScore.player1RunningTotal || 0;
        playerScores[2] = gameScore.player2RunningTotal || 0;
        playerScores[3] = gameScore.player3RunningTotal || 0;
        playerBags[0] = gameScore.player0Bags || 0;
        playerBags[1] = gameScore.player1Bags || 0;
        playerBags[2] = gameScore.player2Bags || 0;
        playerBags[3] = gameScore.player3Bags || 0;
        
        console.log('[HAND COMPLETION] Solo game - using database running totals:', {
          player0: playerScores[0],
          player1: playerScores[1], 
          player2: playerScores[2],
          player3: playerScores[3]
        });
      }
      
      handSummary = {
        team1Score: 0, // Not used in solo
        team2Score: 0, // Not used in solo
        team1Bags: 0,  // Not used in solo
        team2Bags: 0,  // Not used in solo
        tricksPerPlayer: game.players.map((p: any) => p?.tricks || 0),
        playerScores: playerScores,
        playerBags: playerBags,
        team1TotalScore: 0, // Not used in solo
        team2TotalScore: 0  // Not used in solo
      };
    } else {
      // For partners games, use team scores
      handSummary = {
        team1Score: gameScore.team1Score,
        team2Score: gameScore.team2Score,
        team1Bags: gameScore.team1Bags,
        team2Bags: gameScore.team2Bags,
        tricksPerPlayer: game.players.map((p: any) => p?.tricks || 0),
        playerScores: [0, 0, 0, 0],
        playerBags: [0, 0, 0, 0],
        team1TotalScore: gameScore.team1RunningTotal,
        team2TotalScore: gameScore.team2RunningTotal
      };
    }
    
    // Emit hand completed event with database scores
    
    // Update the game object with individual player scores for solo games
    if (game.gameMode === 'SOLO' || game.solo) {
      game.playerScores = playerScores;
      game.playerBags = playerBags;
      console.log('[HAND COMPLETION] Updated game object with individual player scores:');
      console.log('[HAND COMPLETION] playerScores:', playerScores);
      console.log('[HAND COMPLETION] playerBags:', playerBags);
    } else {
      // For partners games, update team scores
      game.team1TotalScore = gameScore.team1RunningTotal;
      game.team2TotalScore = gameScore.team2RunningTotal;
      game.team1Bags = gameScore.team1Bags;
      game.team2Bags = gameScore.team2Bags;
    }
    
    console.log(`[HAND COMPLETION] Updated team scores in game object:`, {
      team1TotalScore: game.team1TotalScore,
      team2TotalScore: game.team2TotalScore,
      team1Bags: game.team1Bags,
      team2Bags: game.team2Bags
    });
    
    console.log(`[HAND COMPLETED] ${game.gameMode === "SOLO" || game.solo ? "Solo" : "Partners"} mode - Emitted hand_completed with scores:`, handSummary);
    
    // Clear the last trick cards from the table before showing hand summary
    if (game.play && game.play.currentTrick) {
      console.log('[HAND COMPLETION] Clearing last trick cards from table');
      game.play.currentTrick = [];
    }
    io.to(game.id).emit('hand_completed', handSummary);
    
    // Emit game update
    io.to(game.id).emit('game_update', enrichGameForClient(game));
    
    // Check if game is complete
    console.log('[HAND COMPLETION DEBUG] Checking game completion with:', {
      gameId: game.dbGameId,
      maxPoints: game.maxPoints,
      minPoints: game.minPoints
    });
    const completionCheck = await checkGameCompletion(game.dbGameId, game.maxPoints, game.minPoints);
    console.log('[HAND COMPLETION DEBUG] Game completion check result:', completionCheck);
    if (completionCheck.isGameOver) {
      console.log('[GAME COMPLETION] Game is over, winning team:', completionCheck.winningTeam);
      
      // ACTUALLY COMPLETE THE GAME
      await completeGame(game, completionCheck.winningTeam);
    }
    
  } catch (error) {
    console.error('[HAND COMPLETION ERROR] Failed to complete hand:', error);
    throw error;
  }
}
