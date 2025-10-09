import { prisma } from '../config/database.js';
import { GameService } from './GameService.js';
import { ScoringService } from './ScoringService.js';
import { GameLoggingService } from './GameLoggingService.js';
import redisGameState from './RedisGameStateService.js';

/**
 * DATABASE-FIRST TRICK COMPLETION SERVICE
 * Single source of truth: PostgreSQL database
 * No in-memory state management
 */
export class TrickCompletionService {
  /**
   * Check if a trick is complete (4 cards) and handle completion if it is
   * @param {string} gameId - The game ID
   * @param {string} roundId - The round ID  
   * @param {string} trickId - The trick ID
   * @param {number} trickNumber - The trick number in the round
   * @returns {Promise<{isComplete: boolean, winningSeatIndex?: number, isRoundComplete?: boolean, isGameComplete?: boolean}>}
   */
  static async checkAndCompleteTrick(gameId, roundId, trickId, trickNumber, io = null) {
    try {
      // Query the database for all cards in this trick
      const trickCards = await prisma.trickCard.findMany({
        where: { trickId },
        orderBy: { playOrder: 'asc' }
      });

      // NUCLEAR: No logging for performance

      // Trick not complete yet
      if (trickCards.length < 4) {
        return { isComplete: false };
      }

      // Calculate winner
      const winningSeatIndex = this.calculateTrickWinner(trickCards);
      // NUCLEAR: No logging for performance

      // Batch trick completion operations for performance
      await prisma.$transaction(async (tx) => {
        // 1. Update the Trick record with winner
        await tx.trick.update({
          where: { id: trickId },
          data: { winningSeatIndex }
        });

        // 2. Count tricks won and update stats in one operation
        const playerTricksWon = await tx.trick.count({
          where: {
            roundId,
            winningSeatIndex: winningSeatIndex
          }
        });
        
        // 3. Update PlayerRoundStats - increment tricksWon for the winner
        await tx.playerRoundStats.updateMany({
          where: {
            roundId,
            seatIndex: winningSeatIndex
          },
          data: {
            tricksWon: playerTricksWon
          }
        });
        
        // NUCLEAR: No logging for performance
      });

      // CRITICAL: Update Redis cache with fresh game state after trick completion
      try {
        const freshGameState = await GameService.getFullGameStateFromDatabase(gameId);
        if (freshGameState) {
          await redisGameState.setGameState(gameId, freshGameState);
          console.log(`[TRICK COMPLETION] Updated Redis cache with fresh game state after trick completion`);
        }
      } catch (error) {
        console.error(`[TRICK COMPLETION] Error updating Redis cache after trick completion:`, error);
      }

      // Check if round is complete (13 tricks)
      const completedTricks = await prisma.trick.count({
        where: {
          roundId,
          winningSeatIndex: { not: -1 } // Only count completed tricks
        }
      });

      // NUCLEAR: No logging for performance

      let isRoundComplete = false;
      let isGameComplete = false;

      if (completedTricks >= 13) {
        // NUCLEAR: No logging for performance
        isRoundComplete = true;
        // Calculate and log round scores using new ScoringService
        const roundResult = await this.completeRound(gameId, roundId, io); // Pass io for events
        isGameComplete = roundResult.isGameComplete;
        
        // CRITICAL: Do NOT automatically start new round - wait for client confirmation
        // The client will send 'hand_summary_continue' event when ready to proceed
        console.log(`[TRICK COMPLETION] Round complete, waiting for client to continue via hand_summary_continue event`);
      } else {
        // NUCLEAR: No logging for performance
      }

      // PERFORMANCE: Clear lead suit cache for completed trick
      GameLoggingService.clearLeadSuitCache(trickId);

      return {
        isComplete: true,
        winningSeatIndex,
        isRoundComplete,
        isGameComplete
      };
    } catch (error) {
      // NUCLEAR: No logging for performance
      throw error;
    }
  }

  /**
   * Calculate the winner of a trick based on the cards played
   * @param {Array} trickCards - Array of TrickCard records
   * @returns {number} - Seat index of the winner
   */
  static calculateTrickWinner(trickCards) {
    if (trickCards.length !== 4) {
      throw new Error('Cannot calculate winner with less than 4 cards');
    }

    // Sort by play order to get them in the correct sequence
    const sortedCards = [...trickCards].sort((a, b) => a.playOrder - b.playOrder);
    
    // NUCLEAR: No logging for performance
    
    const leadCard = sortedCards[0];
    const leadSuit = leadCard.suit;
    // NUCLEAR: No logging for performance

    // Find highest spade if any spades were played
    const spadesPlayed = sortedCards.filter(card => card.suit === 'SPADES');
    // NUCLEAR: No logging for performance
    
    if (spadesPlayed.length > 0) {
      const highestSpade = spadesPlayed.reduce((highest, card) => {
        return this.getCardValue(card.rank) > this.getCardValue(highest.rank) ? card : highest;
      });
      console.log(`[TRICK WINNER] Highest spade: ${highestSpade.suit}${highestSpade.rank}@${highestSpade.seatIndex}`);
      return highestSpade.seatIndex;
    }

    // No spades, find highest card in lead suit
    const leadSuitCards = sortedCards.filter(card => card.suit === leadSuit);
    console.log(`[TRICK WINNER] Lead suit cards:`, leadSuitCards.map(c => `${c.suit}${c.rank}@${c.seatIndex} (value: ${this.getCardValue(c.rank)})`));
    
    const highestLeadSuit = leadSuitCards.reduce((highest, card) => {
      const cardValue = this.getCardValue(card.rank);
      const highestValue = this.getCardValue(highest.rank);
      console.log(`[TRICK WINNER] Comparing ${card.suit}${card.rank}@${card.seatIndex} (${cardValue}) vs ${highest.suit}${highest.rank}@${highest.seatIndex} (${highestValue})`);
      return cardValue > highestValue ? card : highest;
    });

    console.log(`[TRICK WINNER] Winner: ${highestLeadSuit.suit}${highestLeadSuit.rank}@${highestLeadSuit.seatIndex}`);
    return highestLeadSuit.seatIndex;
  }

  /**
   * Get numeric value of a card rank for comparison
   */
  static getCardValue(rank) {
    const values = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
      'J': 11, 'Q': 12, 'K': 13, 'A': 14,
      'JACK': 11, 'QUEEN': 12, 'KING': 13, 'ACE': 14
    };
    const value = values[rank] || 0;
    console.log(`[CARD VALUE] ${rank} = ${value}`);
    return value;
  }

  /**
   * Complete a round by calculating scores using the new ScoringService
   * @param {string} gameId - The game ID
   * @param {string} roundId - The round ID
   * @returns {Promise<{isComplete: boolean, isGameComplete?: boolean}>}
   */
  static async completeRound(gameId, roundId, io = null) {
    try {
      console.log(`[TRICK COMPLETION] Completing round ${roundId} for game ${gameId}`);

      // Calculate scores using the new scoring service
      console.log(`[TRICK COMPLETION] Calling ScoringService.calculateRoundScores...`);
      const scores = await ScoringService.calculateRoundScores(gameId, roundId);
      console.log(`[TRICK COMPLETION] Scores calculated:`, scores);

      // Check if game is complete
      const gameComplete = await ScoringService.checkGameComplete(gameId);
      
      if (gameComplete.isComplete) {
        // Complete the game
        await ScoringService.completeGame(gameId, gameComplete.winner, gameComplete.reason);
        
        // Emit game complete event if io is provided
        if (io) {
          const finalGameState = await GameService.getGameStateForClient(gameId);
          
          // Get the final running totals from the latest RoundScore
          const latestRoundScore = await prisma.roundScore.findFirst({
            where: { 
              Round: { gameId }
            },
            orderBy: { Round: { roundNumber: 'desc' } }
          });
          
          console.log(`[TRICK COMPLETION] Final scores - team0RunningTotal: ${latestRoundScore?.team0RunningTotal}, team1RunningTotal: ${latestRoundScore?.team1RunningTotal}`);
          
          io.to(gameId).emit('game_complete', {
            gameId,
            gameState: finalGameState,
            winner: gameComplete.winner,
            reason: gameComplete.reason,
            scores: {
              team1Score: latestRoundScore?.team0RunningTotal || 0, // team0 becomes team1 in client
              team2Score: latestRoundScore?.team1RunningTotal || 0, // team1 becomes team2 in client
              team1Bags: scores.team0Bags,
              team2Bags: scores.team1Bags
            }
          });
        }
        
        return { isComplete: true, isGameComplete: true };
      }

      // Emit round complete event if io is provided
      if (io) {
        console.log(`[TRICK COMPLETION] Emitting round_complete event for game ${gameId}`);
        const updatedGameState = await GameService.getGameStateForClient(gameId);
        
        // Get detailed round data for hand summary
        const currentRound = updatedGameState.rounds.find(r => r.roundNumber === updatedGameState.currentRound);
        if (!currentRound) {
          console.error('[TRICK COMPLETION] Current round not found for hand summary');
        }

        // Get player stats for this round
        const playerStats = await prisma.playerRoundStats.findMany({
          where: { roundId: currentRound?.id },
          orderBy: { seatIndex: 'asc' }
        });

        // Calculate team data
        const team0Players = playerStats.filter(p => p.seatIndex % 2 === 0);
        const team1Players = playerStats.filter(p => p.seatIndex % 2 === 1);
        
        const team0Bid = team0Players.reduce((sum, p) => sum + (p.bid || 0), 0);
        const team0Tricks = team0Players.reduce((sum, p) => sum + p.tricksWon, 0);
        const team1Bid = team1Players.reduce((sum, p) => sum + (p.bid || 0), 0);
        const team1Tricks = team1Players.reduce((sum, p) => sum + p.tricksWon, 0);

        // Calculate nil points (100 for made nil, -100 for failed nil)
        const team0NilPoints = team0Players.reduce((sum, p) => {
          if (p.isNil || p.isBlindNil) {
            return sum + (p.tricksWon === 0 ? 100 : -100);
          }
          return sum;
        }, 0);
        
        const team1NilPoints = team1Players.reduce((sum, p) => {
          if (p.isNil || p.isBlindNil) {
            return sum + (p.tricksWon === 0 ? 100 : -100);
          }
          return sum;
        }, 0);

        // Transform scores to match client expectations
        const handSummaryData = {
          team1Score: scores.team0Score, // team0 becomes team1 in client
          team2Score: scores.team1Score, // team1 becomes team2 in client
          team1Bags: scores.team0Bags,
          team2Bags: scores.team1Bags,
          team1TotalScore: updatedGameState.team1TotalScore || scores.team0Score, // Use running total from game state
          team2TotalScore: updatedGameState.team2TotalScore || scores.team1Score, // Use running total from game state
          
          // Team breakdown data
          team1Bid: team0Bid, // team0 becomes team1 in client
          team1Tricks: team0Tricks,
          team1NilPoints: team0NilPoints,
          team2Bid: team1Bid, // team1 becomes team2 in client
          team2Tricks: team1Tricks,
          team2NilPoints: team1NilPoints,
          
          // Individual player data
          tricksPerPlayer: playerStats.map(p => p.tricksWon),
          playerBids: playerStats.map(p => p.bid || 0),
          playerNils: playerStats.map(p => (p.isNil || p.isBlindNil) ? (p.tricksWon === 0 ? 100 : -100) : 0),
          playerBags: playerStats.map(p => p.bagsThisRound || 0)
        };
        
        console.log(`[TRICK COMPLETION] Emitting round_complete with data:`, {
          gameId,
          gameState: updatedGameState,
          scores: handSummaryData
        });
        
        // CRITICAL: Clear trick cards before showing hand summary
        io.to(gameId).emit('clear_table_cards', { gameId });
        console.log(`[TRICK COMPLETION] Emitted clear_table_cards event for round completion`);
        
        io.to(gameId).emit('round_complete', {
          gameId,
          gameState: updatedGameState,
          scores: handSummaryData
        });
      } else {
        console.log(`[TRICK COMPLETION] No io instance provided, cannot emit round_complete`);
      }

      return { isComplete: true, isGameComplete: false };
    } catch (error) {
      console.error('[TRICK COMPLETION] Error completing round:', error);
      throw error;
    }
  }

  /**
   * Start a new round for a continuing game
   * @param {string} gameId - The game ID
   * @param {Object} io - Socket.IO instance for emitting events
   */
  static async startNewRound(gameId, io = null) {
    try {
      console.log(`[TRICK COMPLETION] Starting new round for game ${gameId}`);
      
      // Get current game state
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: { rounds: true }
      });

      if (!game) {
        throw new Error(`Game ${gameId} not found`);
      }

      const nextRoundNumber = game.rounds.length + 1;
      const nextDealerSeat = (game.dealer + 1) % 4;
      const firstBidderSeat = (nextDealerSeat + 1) % 4; // Player left of dealer

      // Create new round
      const newRound = await prisma.round.create({
        data: {
          gameId,
          roundNumber: nextRoundNumber,
          dealerSeatIndex: nextDealerSeat
        }
      });

      // Get the first bidder's user ID from GamePlayer table
      const firstBidder = await prisma.gamePlayer.findFirst({
        where: {
          gameId,
          seatIndex: firstBidderSeat
        }
      });
      
      if (!firstBidder) {
        throw new Error(`Player not found at seat ${firstBidderSeat}`);
      }

      // Update game state
      await prisma.game.update({
        where: { id: gameId },
        data: {
          currentRound: nextRoundNumber,
          currentTrick: 0,
          currentPlayer: firstBidder.userId, // Set to first bidder
          dealer: nextDealerSeat,
          status: 'BIDDING'
        }
      });
      
      // Deal cards for new round
      await GameService.dealInitialHands(gameId);

      console.log(`[TRICK COMPLETION] New round ${nextRoundNumber} started successfully`);
      
      // CRITICAL: Clear current trick data from Redis cache for new round
      await redisGameState.setCurrentTrick(gameId, []);
      console.log(`[TRICK COMPLETION] Cleared current trick data from Redis cache for new round`);
      
      // Emit game update to notify clients of new round
      if (io) {
        const updatedGameState = await GameService.getGameStateForClient(gameId);
        console.log(`[TRICK COMPLETION] About to emit game_update for new round ${nextRoundNumber}. Game state:`, {
          status: updatedGameState.status,
          currentRound: updatedGameState.currentRound,
          currentPlayer: updatedGameState.currentPlayer,
          players: updatedGameState.players?.length
        });
        
        io.to(gameId).emit('game_update', {
          gameId,
          gameState: updatedGameState
        });
        
        console.log(`[TRICK COMPLETION] Emitted game_update for new round ${nextRoundNumber}`);
        
        // Also emit new_hand_started event for better client handling
        io.to(gameId).emit('new_hand_started', {
          gameId,
          gameState: updatedGameState,
          roundNumber: nextRoundNumber
        });
        console.log(`[TRICK COMPLETION] Emitted new_hand_started for round ${nextRoundNumber}`);
        
        // Trigger bot bidding if current player is a bot
        if (updatedGameState.currentPlayer) {
          const currentPlayer = updatedGameState.players.find(p => p.id === updatedGameState.currentPlayer);
          if (currentPlayer && currentPlayer.type === 'bot') {
            console.log(`[TRICK COMPLETION] Current player is bot ${currentPlayer.username}, triggering bot bid`);
            const { BiddingHandler } = await import('../modules/socket-handlers/bidding/biddingHandler.js');
            const biddingHandler = new BiddingHandler(io, null);
            biddingHandler.triggerBotBidIfNeeded(gameId);
          }
        }
      }
    } catch (error) {
      console.error('[TRICK COMPLETION] Error starting new round:', error);
      throw error;
    }
  }
}