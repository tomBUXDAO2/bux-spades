import { io } from '../index';
import { calculateAndStoreGameScore, checkGameCompletion } from './databaseScoring';
import { trickLogger } from './trickLogger';
import { enrichGameForClient } from '../routes/games.routes';
import type { Game } from '../types/game';

// SINGLE HAND COMPLETION FUNCTION - NO MORE DUPLICATION
export async function handleHandCompletion(game: Game): Promise<void> {
  try {
    console.log('[HAND COMPLETION] Starting hand completion for game:', game.id);
    
    if (game.gameMode === 'SOLO') {
      // Solo mode - use existing solo logic
      console.log('[HAND COMPLETION] Solo mode - using existing solo scoring');
      // Keep existing solo logic for now
      return;
    }
    
    // Partners mode - USE DATABASE AS SOURCE OF TRUTH
    console.log('[HAND COMPLETION] Partners mode - using database scoring');
    
    // Calculate and store scores in database
    const gameScore = await calculateAndStoreGameScore(game.dbGameId, game.currentRound);
    
    if (!gameScore) {
      throw new Error('Failed to calculate game score');
    }
    
    console.log('[DATABASE SCORING] Calculated and stored game score:', gameScore);
    
    // Update game state with database scores
    game.team1TotalScore = gameScore.team1RunningTotal;
    game.team2TotalScore = gameScore.team2RunningTotal;
    game.team1Bags = gameScore.team1Bags;
    game.team2Bags = gameScore.team2Bags;
    
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
      tricksPerPlayer: game.players.map(p => p?.tricks || 0), // Current trick counts
      playerScores: [0, 0, 0, 0], // Not used in partners mode
      playerBags: [0, 0, 0, 0],   // Not used in partners mode
      team1TotalScore: gameScore.team1RunningTotal,
      team2TotalScore: gameScore.team2RunningTotal
    };
    
    // Emit hand completed event with database scores
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
    const completionCheck = await checkGameCompletion(game.dbGameId, game.maxPoints, game.minPoints);
    if (completionCheck.isGameOver) {
      console.log('[GAME COMPLETION] Game is over, winning team:', completionCheck.winningTeam);
      // Handle game completion here
    }
    
  } catch (error) {
    console.error('[HAND COMPLETION ERROR] Failed to complete hand:', error);
    throw error;
  }
}
