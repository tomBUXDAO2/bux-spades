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
    console.log('[HAND COMPLETION DEBUG] calculateAndStoreGameScore returned:', gameScore);
    
    if (!gameScore) {
      throw new Error('Failed to calculate game score');
    }
    
    console.log('[DATABASE SCORING] Calculated and stored game score:', gameScore);
    
    // Update game state with database scores
    game.team1TotalScore = gameScore.team1RunningTotal;
    game.team2TotalScore = gameScore.team2RunningTotal;
    game.team1Bags = gameScore.team1Bags;
    game.team2Bags = gameScore.team2Bags;

    // Update per-player bags for stats: bags = max(0, total tricks won to date - total bids to date)
    try {
      if (game.dbGameId) {
        // Fetch all rounds up to current, their bids, and trick counts
        const rounds = await prisma.round.findMany({
          where: { gameId: game.dbGameId, roundNumber: { lte: game.currentRound } },
          include: { RoundBid: true, PlayerTrickCount: true }
        });
        for (let i = 0; i < 4; i++) {
          const player = game.players[i];
          if (!player) continue;
          const playerId = player.id;
          let totalBid = 0;
          let totalTricks = 0;
          for (const r of rounds) {
            const rb = r.RoundBid.find(b => b.playerId === playerId);
            if (rb && rb.bid > 0) totalBid += rb.bid; // nil/blind nil (<=0) do not add to personal bid
            const tc = r.PlayerTrickCount.find(t => t.playerId === playerId);
            if (tc) totalTricks += tc.tricksWon;
          }
          const personalBags = Math.max(0, totalTricks - totalBid);
          await prisma.gamePlayer.updateMany({
            where: { gameId: game.dbGameId, position: i },
            data: { bags: personalBags, updatedAt: new Date() }
          });
        }
      }
    } catch (err) {
      console.error('[HAND COMPLETION] Failed to update per-player bags:', err);
    }
    
    // Set game status to indicate hand is completed
    game.status = 'PLAYING';
    (game as any).handCompletedTime = Date.now();
    
    // Log completed hand to database
    await trickLogger.logCompletedHand(game);
    
    // Create hand summary data for frontend using database scores
    const handSummary = {
      team1Score: gameScore.team1Score, // Current round score
      team2Score: gameScore.team2Score, // Current round score
      team1Bags: gameScore.team1Bags - (game.team1Bags || 0) + (gameScore.team1Bags || 0), // Bags from this round
      team2Bags: gameScore.team2Bags - (game.team2Bags || 0) + (gameScore.team2Bags || 0), // Bags from this round
      tricksPerPlayer: game.players.map((p: any) => p?.tricks || 0), // Current trick counts
      playerScores: [0, 0, 0, 0], // Not used in partners mode
      playerBags: [0, 0, 0, 0],   // Not used in partners mode
      team1TotalScore: gameScore.team1RunningTotal,
      team2TotalScore: gameScore.team2RunningTotal
    };
    
    // Emit hand completed event with database scores
    
    // Clear the last trick cards from the table before showing hand summary
    if (game.play && game.play.currentTrick) {
      console.log('[HAND COMPLETION] Clearing last trick cards from table');
      game.play.currentTrick = [];
    }
    io.to(game.id).emit('hand_completed', handSummary);
    
    console.log('[HAND COMPLETED] Partners mode - Emitted hand_completed with DATABASE scores:', {
      team1Score: gameScore.team1Score,
      team2Score: gameScore.team2Score,
      team1TotalScore: gameScore.team1RunningTotal,
      team2TotalScore: gameScore.team2RunningTotal
    });
    
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
