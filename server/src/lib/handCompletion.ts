import { io } from '../index';
import { calculateAndStoreGameScore, checkGameCompletion } from './databaseScoring';
import { trickLogger } from './trickLogger';
import { enrichGameForClient } from '../routes/games.routes';
import type { Game } from '../types/game';

// Import startTurnTimeout function
declare function startTurnTimeout(game: Game, playerIndex: number, phase: string): void;

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
      
      // ACTUALLY COMPLETE THE GAME
      await completeGame(game, completionCheck.winningTeam);
    }
    
  } catch (error) {
    console.error('[HAND COMPLETION ERROR] Failed to complete hand:', error);
    throw error;
  }
}

// TRICK COMPLETION FUNCTION - FIXES TRICK LEADER ASSIGNMENT
export async function handleTrickCompletion(game: Game, socketId?: string): Promise<void> {
  try {
    console.log('[TRICK COMPLETION] Starting trick completion for game:', game.id);
    
    if (!game.play || !game.play.currentTrick || game.play.currentTrick.length !== 4) {
      console.log('[TRICK COMPLETION] Invalid trick state, skipping');
      return;
    }
    
    // Store the completed trick data for animation
    const completedTrick = [...game.play.currentTrick];
    
    // Determine trick winner
    const winnerIndex = determineTrickWinner(game.play.currentTrick);
    console.log('[TRICK COMPLETION] Trick winner determined:', winnerIndex);
    
    // Award trick to winner
    if (game.players[winnerIndex]) {
      game.players[winnerIndex]!.tricks = (game.players[winnerIndex]!.tricks || 0) + 1;
      console.log('[TRICK COMPLETION] Awarded trick to player', winnerIndex, 'new count:', game.players[winnerIndex]!.tricks);
    }
    
    // Store completed trick
    game.play.tricks.push({
      cards: completedTrick,
      winnerIndex: winnerIndex,
    });
    
    // Increment trick number
    game.play.trickNumber = (game.play.trickNumber || 0) + 1;
    
    // Emit trick complete with the stored trick data for animation
    io.to(game.id).emit('trick_complete', {
      trick: {
        cards: completedTrick,
        winnerIndex,
      },
      trickNumber: game.play.trickNumber,
    });
    
    // CRITICAL: Set winner as next trick leader BEFORE any delays
    game.play.currentPlayerIndex = winnerIndex;
    console.log('[TRICK COMPLETION] Set currentPlayerIndex to winner:', winnerIndex);
    
    // Defer clearing the trick until after clients have started the animation
    setTimeout(async () => {
      if (!game.play) return;
      game.play.currentTrick = []; // Clear the trick for proper game state
      
      // Emit game update with new status
      io.to(game.id).emit('game_update', enrichGameForClient(game));
      
      // If all tricks played, move to hand summary/scoring
      if (game.play.trickNumber === 13) {
        await handleHandCompletion(game);
      } else {
        // If the winner is a bot, trigger their move for the next trick
        const winnerPlayer = game.players[winnerIndex];
        if (winnerPlayer && winnerPlayer.type === 'bot') {
          console.log('[BOT TURN] Winner is bot, triggering next turn for:', winnerPlayer.username, 'at index:', winnerIndex);
          console.log('[BOT TURN DEBUG] Current player index is:', game.play.currentPlayerIndex);
          // Add a small delay to allow the trick completion animation
          setTimeout(async () => {
            // Double-check that it's still this bot's turn before playing
            if (game.play && game.play.currentPlayerIndex === winnerIndex &&
                game.players[winnerIndex] && game.players[winnerIndex]!.type === 'bot') {
              console.log('[BOT TURN DEBUG] Calling botPlayCard for bot at index:', winnerIndex);
              const { botPlayCard } = await import('../routes/games.routes');
              botPlayCard(game, winnerIndex);
            } else {
              console.log('[BOT TURN DEBUG] Bot turn conditions not met:', {
                hasGamePlay: !!game.play,
                currentPlayerIndex: game.play?.currentPlayerIndex,
                expectedIndex: winnerIndex,
                playerExists: !!game.players[winnerIndex],
                playerType: game.players[winnerIndex]?.type
              });
            }
          }, 100); // Reduced delay for faster gameplay
        } else if (winnerPlayer && winnerPlayer.type === 'human') {
          // Human player's turn - they will play when ready
          console.log('[HUMAN TURN] Human player', winnerPlayer.username, 'at index', winnerIndex, 'can now play');
        }
      }
    }, 1000); // 1 second delay to match frontend animation
    
  } catch (error) {
    console.error('[TRICK COMPLETION ERROR] Failed to complete trick:', error);
    throw error;
  }
}

// Helper function to determine trick winner
function determineTrickWinner(trick: any[]): number {
  if (!trick || trick.length !== 4) return 0;
  
  const leadSuit = trick[0]?.suit;
  let winningCard = trick[0];
  let winnerIndex = 0;
  
  for (let i = 1; i < trick.length; i++) {
    const card = trick[i];
    if (!card) continue;
    
    // Spades always win
    if (card.suit === 'S' && winningCard.suit !== 'S') {
      winningCard = card;
      winnerIndex = i;
    }
    // If both are spades, higher rank wins
    else if (card.suit === 'S' && winningCard.suit === 'S') {
      if (getCardValue(card) > getCardValue(winningCard)) {
        winningCard = card;
        winnerIndex = i;
      }
    }
    // If neither is spades, follow suit and higher rank wins
    else if (card.suit === leadSuit && winningCard.suit === leadSuit) {
      if (getCardValue(card) > getCardValue(winningCard)) {
        winningCard = card;
        winnerIndex = i;
      }
    }
  }
  
  return winnerIndex;
}

// Helper function to get card value for comparison
function getCardValue(card: any): number {
  const values: { [key: string]: number } = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return values[card.rank] || 0;
}

// Import and use the completeGame function from index.ts
async function completeGame(game: Game, winningTeamOrPlayer: number) {
  console.log('[GAME COMPLETION] Completing game:', game.id, 'Winner:', winningTeamOrPlayer);
  
  try {
    // Set game status to FINISHED
    game.status = 'FINISHED';
    
    // Update database status to FINISHED
    if (game.dbGameId) {
      const { prisma } = await import('./prisma');
      await prisma.game.update({
        where: { id: game.dbGameId },
        data: { 
          status: 'FINISHED',
          completed: true,
          finalScore: Math.max(game.team1TotalScore || 0, game.team2TotalScore || 0),
          winner: winningTeamOrPlayer
        }
      });
      console.log('[GAME COMPLETION] Updated database status to FINISHED for game:', game.dbGameId);
    }
    
    // Emit game over event
    if (game.gameMode === 'SOLO') {
      io.to(game.id).emit('game_over', {
        playerScores: game.playerScores,
        winningPlayer: winningTeamOrPlayer,
      });
    } else {
      io.to(game.id).emit('game_over', {
        team1Score: game.team1TotalScore,
        team2Score: game.team2TotalScore,
        winningTeam: winningTeamOrPlayer,
      });
    }
    
    // Update stats and coins
    const { updateStatsAndCoins } = await import('../routes/games.routes');
    await updateStatsAndCoins(game, winningTeamOrPlayer);
    
  } catch (error) {
    console.error('[GAME COMPLETION ERROR] Failed to complete game:', error);
    throw error;
  }
}
