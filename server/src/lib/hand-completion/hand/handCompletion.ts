import { io } from '../../../index';
import { calculateAndStoreGameScore, checkGameCompletion } from '../../databaseScoring';
import { enrichGameForClient } from '../../../routes/games/shared/gameUtils';
import type { Game } from '../../../types/game';
import { completeGame } from '../game/gameCompletion';
import prisma from '../../prisma';
import { newdbEnsureRound, newdbRecordRoundEnd } from '../../../newdb/writers';

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
    
    if (game.mode === 'SOLO' || game.mode === "SOLO") {
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
    
    if (game.mode === 'SOLO' || game.mode === "SOLO") {
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
    
    // NEW DB: record round end stats and score
    try {
      const roundIdNew = await newdbEnsureRound({ gameId: game.id, roundNumber: game.currentRound, dealerSeatIndex: game.dealerIndex ?? 0 });
      const playerStats = game.players.map((p: any, i: number) => {
        if (!p) return null as any;
        const bid = (game.bidding?.bids?.[i] ?? 0) as number;
        const tricksWon = (p.tricks ?? 0) as number;
        const madeNil = bid === 0 && tricksWon === 0;
        const madeBlindNil = bid === -1 && tricksWon === 0;
        const teamIndex = game.mode === 'SOLO' || game.mode === "SOLO" ? null : (i % 2);
        const bagsThisRound = Math.max(0, tricksWon - (bid > 0 ? bid : 0));
        return { userId: p.id, seatIndex: i, teamIndex, bid, tricksWon, bagsThisRound, madeNil, madeBlindNil };
      }).filter(Boolean) as any;
      const score = ((): any => {
        if (game.mode === 'SOLO' || game.mode === "SOLO") {
          return {
            player0Score: playerScores[0],
            player1Score: playerScores[1],
            player2Score: playerScores[2],
            player3Score: playerScores[3],
            player0Running: playerScores[0],
            player1Running: playerScores[1],
            player2Running: playerScores[2],
            player3Running: playerScores[3],
          };
        }
        return {
          team0Score: handSummary.team1Score ?? null,
          team1Score: handSummary.team2Score ?? null,
          team0Bags: handSummary.team1Bags ?? null,
          team1Bags: handSummary.team2Bags ?? null,
          team0RunningTotal: handSummary.team1TotalScore ?? null,
          team1RunningTotal: handSummary.team2TotalScore ?? null,
        };
      })();
      await newdbRecordRoundEnd({ roundId: roundIdNew, playerStats, score });
    } catch (e) {
      console.warn('[NEWDB] Failed to record round end:', e);
    }
    
    // Emit hand completed event with database scores
    
    // Update the game object with individual player scores for solo games
    if (game.mode === 'SOLO' || game.mode === "SOLO") {
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
    
    console.log(`[HAND COMPLETED] ${game.mode === "SOLO" || game.mode === "SOLO" ? "Solo" : "Partners"} mode - Prepared hand summary with scores:`, handSummary);
    
    // Clear the last trick cards from the table before showing hand summary
    if (game.play && game.play.currentTrick) {
      console.log('[HAND COMPLETION] Clearing last trick cards from table');
      game.play.currentTrick = [];
    }
    // Move hand_completed emission after game completion check
    
    
    // Check if game is complete BEFORE emitting hand_completed
    console.log('[HAND COMPLETION DEBUG] Checking game completion with:', {
      gameId: game.dbGameId,
      maxPoints: game.maxPoints,
      minPoints: game.minPoints
    });
    const completionCheck = await checkGameCompletion(game.dbGameId, game.maxPoints, game.minPoints);
    console.log("[HAND COMPLETION DEBUG] completionCheck result:", completionCheck);
    console.log('[HAND COMPLETION DEBUG] Game completion check result:', completionCheck);
    if (completionCheck.isGameOver) {
      console.log('[GAME COMPLETION] Game is over, winning team: - SKIPPING hand_completed', completionCheck.winningTeam);
      
      // ACTUALLY COMPLETE THE GAME
      await completeGame(game, completionCheck.winningTeam);
    } else {
      console.log('[HAND COMPLETION] Game continues, emitting hand_completed and starting next round...');

      // Only emit hand_completed if game is NOT over
      io.to(game.id).emit('hand_completed', handSummary);
      
      // Import and call startNewHand to begin the next round
      const { startNewHand } = await import('../../../modules/socket-handlers/game-state/hand/handSummaryContinue');
      // await startNewHand(game); // Let hand summary continue tracking handle this
    }
    
  } catch (error) {
    console.error('[HAND COMPLETION ERROR] Failed to complete hand:', error);
    throw error;
  }
}
