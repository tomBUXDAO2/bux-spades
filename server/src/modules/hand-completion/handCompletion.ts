import type { Game } from '../../types/game';
import { io } from '../../index';
import { calculateAndStoreGameScore, checkGameCompletion } from '../../lib/databaseScoring';
import { trickLogger } from '../../lib/trickLogger';
import { enrichGameForClient } from '../../routes/games.routes';
import { dealNewHand } from '../dealing/cardDealing';
import { isGameComplete, getWinningTeam } from '../game-rules/gameRules';

/**
 * Handles completion of a single hand/round
 */
export async function handleHandCompletion(game: Game): Promise<void> {
  try {
    console.log('[HAND COMPLETION] Starting hand completion for game:', game.id);
    
    if (game.gameMode === 'SOLO') {
      await handleSoloHandCompletion(game);
    } else {
      await handlePartnersHandCompletion(game);
    }
    
    // Check if game is complete
    if (isGameComplete(game)) {
      await handleGameCompletion(game);
    } else {
      // Start new hand
      await startNewHand(game);
    }
    
  } catch (error) {
    console.error('[HAND COMPLETION] Error:', error);
    throw error;
  }
}

/**
 * Handles solo game hand completion
 */
async function handleSoloHandCompletion(game: Game): Promise<void> {
  console.log('[HAND COMPLETION] Solo mode - calculating scores');
  
  // Solo mode scoring logic
  const player = game.players[0]; // Solo player is always at position 0
  if (!player) {
    throw new Error('No solo player found');
  }
  
  const tricksWon = player.tricks || 0;
  const bid = player.bid || 0;
  
  // Calculate solo score
  let handScore = 0;
  if (tricksWon === bid) {
    handScore = bid * 10; // Made bid exactly
  } else if (tricksWon > bid) {
    handScore = (bid * 10) + (tricksWon - bid); // Made bid + bags
  } else {
    handScore = -(bid * 10); // Failed bid
  }
  
  // Update game score
  game.team1TotalScore = (game.team1TotalScore || 0) + handScore;
  
  // Log completed hand
  await trickLogger.logCompletedHand(game);
  
  // Emit hand summary
  emitHandSummary(game, {
    handNumber: game.currentRound || 1,
    scores: {
      team1: game.team1TotalScore,
      team2: 0
    },
    tricks: {
      team1: tricksWon,
      team2: 0
    },
    bids: {
      team1: bid,
      team2: 0
    }
  });
}

/**
 * Handles partners game hand completion
 */
async function handlePartnersHandCompletion(game: Game): Promise<void> {
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
    handNumber: game.currentRound || 1,
    scores: {
      team1: gameScore.team1RunningTotal,
      team2: gameScore.team2RunningTotal
    },
    tricks: {
      team1: gameScore.team1Tricks,
      team2: gameScore.team2Tricks
    },
    bids: {
      team1: gameScore.team1Bid,
      team2: gameScore.team2Bid
    },
    bags: {
      team1: gameScore.team1Bags,
      team2: gameScore.team2Bags
    }
  };
  
  // Emit hand summary
  emitHandSummary(game, handSummary);
}

/**
 * Handles game completion
 */
async function handleGameCompletion(game: Game): Promise<void> {
  console.log('[GAME COMPLETION] Game completed:', game.id);
  
  const winningTeam = getWinningTeam(game);
  if (winningTeam === null) {
    throw new Error('Game completed but no winning team determined');
  }
  
  // Update game status
  game.status = 'FINISHED';
  game.completed = true;
  game.winner = winningTeam;
  game.finalScore = winningTeam === 1 ? game.team1TotalScore : game.team2TotalScore;
  
  // Log game completion
  await trickLogger.logCompletedHand(game);
  
  // Emit game completion
  io.to(game.id).emit('game_complete', {
    gameId: game.id,
    winner: winningTeam,
    finalScore: game.finalScore,
    scores: {
      team1: game.team1TotalScore,
      team2: game.team2TotalScore
    }
  });
  
  console.log('[GAME COMPLETION] Game finished, winner:', winningTeam);
}

/**
 * Starts a new hand
 */
async function startNewHand(game: Game): Promise<void> {
  console.log('[NEW HAND] Starting new hand for game:', game.id);
  
  // Check if all seats are filled
  const filledSeats = game.players.filter(p => p !== null).length;
  if (filledSeats < 4) {
    console.log('[NEW HAND] Not all seats are filled, cannot start new hand');
    return;
  }
  
  // Deal new hand
  dealNewHand(game);
  
  // Reset bidding state
  game.status = 'BIDDING';
  game.bidding = {
    currentBidderIndex: (game.dealerIndex + 1) % 4,
    currentPlayer: game.players[(game.dealerIndex + 1) % 4]?.id ?? '',
    bids: [null, null, null, null],
    nilBids: {}
  };
  game.play = undefined;
  
  // Start a new round in DB for this hand
  if (game.dbGameId) {
    try {
      const roundNumber = ((trickLogger.getCurrentRoundNumber(game.dbGameId) || 0) + 1);
      await trickLogger.startRound(game.dbGameId, roundNumber);
    } catch (err) {
      console.error('Failed to start round logging for new hand:', err);
    }
  }
  
  // Emit new hand started event
  console.log('[NEW HAND] Emitting new_hand_started event');
  io.to(game.id).emit('new_hand_started', {
    dealerIndex: game.dealerIndex,
    hands: game.hands,
    currentBidderIndex: game.bidding.currentBidderIndex
  });
  
  // Emit game update
  io.to(game.id).emit('game_update', enrichGameForClient(game));
}

/**
 * Emits hand summary to all players
 */
function emitHandSummary(game: Game, summary: any): void {
  io.to(game.id).emit('hand_summary', {
    gameId: game.id,
    ...summary
  });
  
  console.log('[HAND SUMMARY] Emitted hand summary:', summary);
}

/**
 * Calculates hand statistics
 */
export function calculateHandStats(game: Game): {
  totalTricks: number;
  team1Tricks: number;
  team2Tricks: number;
  team1Bid: number;
  team2Bid: number;
} {
  const team1Tricks = (game.players[0]?.tricks || 0) + (game.players[2]?.tricks || 0);
  const team2Tricks = (game.players[1]?.tricks || 0) + (game.players[3]?.tricks || 0);
  const team1Bid = (game.players[0]?.bid || 0) + (game.players[2]?.bid || 0);
  const team2Bid = (game.players[1]?.bid || 0) + (game.players[3]?.bid || 0);
  
  return {
    totalTricks: team1Tricks + team2Tricks,
    team1Tricks,
    team2Tricks,
    team1Bid,
    team2Bid
  };
}
