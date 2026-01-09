import { prisma } from '../config/database.js';
import { GameService } from './GameService.js';
import { ScoringService } from './ScoringService.js';
import { GameLoggingService } from './GameLoggingService.js';
import redisGameState from './RedisGameStateService.js';
import { emitPersonalizedGameEvent } from './SocketGameBroadcastService.js';

/**
 * DATABASE-FIRST TRICK COMPLETION SERVICE
 * Single source of truth: PostgreSQL database
 * No in-memory state management
 */
export class TrickCompletionService {
  // Mutex to prevent duplicate round creation
  static startingRounds = new Set();
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

        // OPTIMIZED: Use increment instead of expensive count query
        await tx.playerRoundStats.updateMany({
          where: {
            roundId,
            seatIndex: winningSeatIndex
          },
          data: {
            tricksWon: { increment: 1 }
          }
        });
        
        // NUCLEAR: No logging for performance
      });

      // OPTIMIZED: Update Redis cache incrementally instead of full rebuild
      // Get current round stats once (used for both Redis update and round completion check)
      const currentRoundStats = await prisma.playerRoundStats.findMany({
        where: { roundId },
        select: { seatIndex: true, tricksWon: true }
      });
      
      try {
        // CRITICAL: Rebuild full game state from database to ensure completedTricks is updated
        // This ensures SpadesRuleService can find spades in completed tricks
        const freshGameState = await GameService.getFullGameStateFromDatabase(gameId);
        if (freshGameState) {
          await redisGameState.setGameState(gameId, freshGameState);
          console.log(`[TRICK COMPLETION] Updated Redis cache with full game state including completedTricks`);
        }
      } catch (error) {
        console.error(`[TRICK COMPLETION] Error updating Redis cache after trick completion:`, error);
      }

      // Check if round is complete using the same stats
      const totalTricksWon = currentRoundStats.reduce((sum, stat) => sum + stat.tricksWon, 0);
      const completedTricks = totalTricksWon;

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

      // Check if game is complete (race-free): evaluate using the RoundScore we just created
      let gameComplete = { isComplete: false };
      try {
        const gameConfig = await prisma.game.findUnique({ where: { id: gameId }, select: { mode: true, minPoints: true, maxPoints: true } });
        // CRITICAL FIX: Use the RoundScore we just created for this round (by roundId)
        // Don't query by roundNumber desc as that might get a previous round
        const currentRoundScore = await prisma.roundScore.findUnique({
          where: { id: roundId } // RoundScore.id = roundId
        });
        if (gameConfig && currentRoundScore) {
          if (gameConfig.mode === 'SOLO') {
            const pts = [
              currentRoundScore.player0Running || 0,
              currentRoundScore.player1Running || 0,
              currentRoundScore.player2Running || 0,
              currentRoundScore.player3Running || 0
            ];
            const minP = gameConfig.minPoints ?? -100;
            const maxP = gameConfig.maxPoints ?? 100;
            for (let i = 0; i < pts.length; i++) {
              const v = pts[i];
              if (v >= maxP || v <= minP) {
                gameComplete = { isComplete: true, winner: `PLAYER_${i}`, reason: v >= maxP ? `Player ${i} reached ${maxP} points` : `Player ${i} reached ${minP} points` };
                break;
              }
            }
          } else {
            // CRITICAL: Use running totals from scores object (most reliable) or currentRoundScore
            const t0 = scores.team0RunningTotal ?? currentRoundScore.team0RunningTotal ?? 0;
            const t1 = scores.team1RunningTotal ?? currentRoundScore.team1RunningTotal ?? 0;
            const minP = gameConfig.minPoints ?? -500;
            const maxP = gameConfig.maxPoints ?? 500;
            console.log(`[TRICK COMPLETION] Checking game completion - t0: ${t0}, t1: ${t1}, minP: ${minP}, maxP: ${maxP}`);
            const t0Ex = t0 >= maxP || t0 <= minP;
            const t1Ex = t1 >= maxP || t1 <= minP;
            if (t0Ex && t1Ex) {
              if (t0 !== t1) {
                const winner = t0 > t1 ? 'TEAM_0' : 'TEAM_1';
                gameComplete = { isComplete: true, winner, reason: `Both teams exceeded limits, ${winner} has most points` };
              }
            } else if (t0Ex) {
              gameComplete = { isComplete: true, winner: 'TEAM_0', reason: `Team 0 reached ${t0 >= maxP ? maxP : minP} points` };
            } else if (t1Ex) {
              gameComplete = { isComplete: true, winner: 'TEAM_1', reason: `Team 1 reached ${t1 >= maxP ? maxP : minP} points` };
            }
            console.log(`[TRICK COMPLETION] Game completion check result: isComplete=${gameComplete.isComplete}, winner=${gameComplete.winner}`);
          }
        }
      } catch {}
      
      if (gameComplete.isComplete) {
        // Complete the game
        await ScoringService.completeGame(gameId, gameComplete.winner, gameComplete.reason);
        
        // Emit game complete event if io is provided
        if (io) {
          // CRITICAL FIX: Use the running totals directly from calculateRoundScores
          // The scores object now includes team0RunningTotal and team1RunningTotal
          // This ensures we have the correct final scores including the last round
          // DO NOT use getGameStateForClient here as it may have stale scores from cache
          
          // Get the RoundScore we just created - this has the correct final scores
          const currentRoundScore = await prisma.roundScore.findUnique({
            where: { id: roundId } // RoundScore.id = roundId
          });

          // CRITICAL: Use running totals from scores object FIRST (most reliable)
          // Then fall back to RoundScore query (should match)
          // DO NOT use finalGameState scores as they may be stale
          const finalTeam1Score = scores.team0RunningTotal ?? currentRoundScore?.team0RunningTotal ?? 0;
          const finalTeam2Score = scores.team1RunningTotal ?? currentRoundScore?.team1RunningTotal ?? 0;
          
          console.log(`[TRICK COMPLETION] Final scores - scores object: team0RunningTotal=${scores.team0RunningTotal}, team1RunningTotal=${scores.team1RunningTotal}`);
          console.log(`[TRICK COMPLETION] Final scores - RoundScore query: team0RunningTotal=${currentRoundScore?.team0RunningTotal}, team1RunningTotal=${currentRoundScore?.team1RunningTotal}`);
          console.log(`[TRICK COMPLETION] Final scores - USING: team0RunningTotal=${finalTeam1Score}, team1RunningTotal=${finalTeam2Score}`);

          // Get game state for client (but we'll override the scores)
          const finalGameState = await GameService.getGameStateForClient(gameId);
          
          // For solo games, get player running totals from RoundScore
          const finalPlayerScores = (finalGameState?.gameMode === 'SOLO' && currentRoundScore) ? [
            currentRoundScore.player0Running ?? 0,
            currentRoundScore.player1Running ?? 0,
            currentRoundScore.player2Running ?? 0,
            currentRoundScore.player3Running ?? 0
          ] : undefined;

          // CRITICAL: Override the scores in finalGameState with the correct final scores
          if (finalGameState) {
            finalGameState.team1TotalScore = finalTeam1Score;
            finalGameState.team2TotalScore = finalTeam2Score;
            if (Array.isArray(finalPlayerScores)) {
              finalGameState.playerScores = finalPlayerScores;
            }
            finalGameState.team1Bags = scores.team0Bags ?? finalGameState.team1Bags ?? 0;
            finalGameState.team2Bags = scores.team1Bags ?? finalGameState.team2Bags ?? 0;
          }
          
          // Update Redis cache with correct final scores immediately
          const redisGameState = (await import('../../../services/RedisGameStateService.js')).default;
          if (finalGameState) {
            await redisGameState.setGameState(gameId, finalGameState);
            console.log(`[TRICK COMPLETION] Updated Redis cache with correct final scores`);
          }
          
          console.log(`[TRICK COMPLETION] Emitting game_complete with final scores: team1Score=${finalTeam1Score}, team2Score=${finalTeam2Score}`);
          
          emitPersonalizedGameEvent(io, gameId, 'game_complete', finalGameState, {
            winner: gameComplete.winner,
            reason: gameComplete.reason,
            scores: {
              team1Score: finalTeam1Score,
              team2Score: finalTeam2Score,
              team1Bags: scores.team0Bags,
              team2Bags: scores.team1Bags,
              playerScores: finalPlayerScores
            }
          });
        }
        
        return { isComplete: true, isGameComplete: true };
      }

      // Emit round complete event if io is provided
      if (io) {
        console.log(`[TRICK COMPLETION] Delaying round_complete event to allow trick animation to complete`);
        
        // CRITICAL: Stop any player timers until next round actually starts
        try {
          const { playerTimerService } = await import('./PlayerTimerService.js');
          playerTimerService.clearTimer(gameId);
        } catch {}

        // CRITICAL FIX: Delay round_complete event to prevent 4th card flickering on final trick
        // This allows the trick animation to complete before the game state is updated
        setTimeout(async () => {
          let updatedGameState = null;
          const safeEmit = (payload) => {
            try {
              emitPersonalizedGameEvent(io, gameId, 'round_complete', updatedGameState || { id: gameId, play: { currentTrick: [] } }, payload);
            } catch (emitError) {
              console.error('[TRICK COMPLETION] Failed to emit round_complete payload:', emitError);
            }
          };
          
          try {
            console.log(`[TRICK COMPLETION] Emitting round_complete event for game ${gameId}`);
            
            await redisGameState.setCurrentTrick(gameId, []);
            console.log(`[TRICK COMPLETION] Cleared currentTrick data to prevent re-rendering`);
            
            updatedGameState = await GameService.getFullGameStateFromDatabase(gameId);
            if (!updatedGameState) {
              console.error('[TRICK COMPLETION] Failed to retrieve full game state, using minimal fallback state');
              updatedGameState = {
                id: gameId,
                status: 'PLAYING',
                currentRound: 0,
                currentPlayer: null,
                players: [],
                play: { currentTrick: [] },
                currentTrickCards: []
              };
            }

            updatedGameState.play = {
              ...(updatedGameState.play || {}),
              currentTrick: []
            };
            updatedGameState.currentTrickCards = [];

            const baseSummary = {
              team1Score: scores?.team0Score ?? 0,
              team2Score: scores?.team1Score ?? 0,
              team1Bags: scores?.team0Bags ?? 0,
              team2Bags: scores?.team1Bags ?? 0,
              team1TotalScore: 0,
              team2TotalScore: 0,
              team1Bid: null,
              team1Tricks: null,
              team1NilPoints: 0,
              team2Bid: null,
              team2Tricks: null,
              team2NilPoints: 0,
              tricksPerPlayer: [],
              playerBids: [],
              playerNils: [],
              playerBags: [],
              playerScores: scores?.players ? scores.players.map(p => p.runningTotal ?? 0) : [],
              playerRoundScores: scores?.players ? scores.players.map(p => p.pointsThisRound ?? 0) : []
            };

            try {
              let currentRound = Array.isArray(updatedGameState.rounds)
                ? updatedGameState.rounds.find((r) => r && r.roundNumber === updatedGameState.currentRound)
                : null;
              if (!currentRound) {
                console.warn('[TRICK COMPLETION] Current round missing from full game state, querying round table');
                currentRound = await prisma.round.findFirst({
                  where: { gameId, roundNumber: updatedGameState.currentRound },
                  select: { id: true }
                });
              }

              if (currentRound) {
                const playerStats = await prisma.playerRoundStats.findMany({
                  where: { roundId: currentRound.id },
                  orderBy: { seatIndex: 'asc' }
                });

                const team0Players = playerStats.filter(p => p.seatIndex % 2 === 0);
                const team1Players = playerStats.filter(p => p.seatIndex % 2 === 1);

                baseSummary.team1Bid = team0Players.reduce((sum, p) => sum + (p.bid || 0), 0);
                baseSummary.team1Tricks = team0Players.reduce((sum, p) => sum + p.tricksWon, 0);
                baseSummary.team2Bid = team1Players.reduce((sum, p) => sum + (p.bid || 0), 0);
                baseSummary.team2Tricks = team1Players.reduce((sum, p) => sum + p.tricksWon, 0);

                baseSummary.team1NilPoints = team0Players.reduce((sum, p) => sum + ((p.bid === 0 || p.isBlindNil) ? (p.tricksWon === 0 ? 100 : -100) : 0), 0);
                baseSummary.team2NilPoints = team1Players.reduce((sum, p) => sum + ((p.bid === 0 || p.isBlindNil) ? (p.tricksWon === 0 ? 100 : -100) : 0), 0);

                baseSummary.tricksPerPlayer = playerStats.map(p => p.tricksWon);
                baseSummary.playerBids = playerStats.map(p => p.bid || 0);
                baseSummary.playerNils = playerStats.map(p => {
                  if (p.bid === 0 || p.isBlindNil) {
                    return p.tricksWon === 0 ? 100 : -100;
                  }
                  return 0;
                });
                baseSummary.playerBags = playerStats.map(p => p.bagsThisRound || 0);
              } else {
                console.warn('[TRICK COMPLETION] Still unable to resolve current round; continuing with minimal summary data');
              }
            } catch (statsError) {
              console.error('[TRICK COMPLETION] Error enriching round summary with player stats:', statsError);
            }

            try {
              const latestRoundScore = await prisma.roundScore.findFirst({
                where: { Round: { gameId } },
                orderBy: { Round: { roundNumber: 'desc' } }
              });
              if (latestRoundScore) {
                baseSummary.team1TotalScore = latestRoundScore.team0RunningTotal ?? 0;
                baseSummary.team2TotalScore = latestRoundScore.team1RunningTotal ?? 0;
                if (baseSummary.playerScores.length === 0) {
                  baseSummary.playerScores = [
                    latestRoundScore.player0Running ?? 0,
                    latestRoundScore.player1Running ?? 0,
                    latestRoundScore.player2Running ?? 0,
                    latestRoundScore.player3Running ?? 0
                  ];
                }
                if (baseSummary.playerRoundScores.length === 0) {
                  baseSummary.playerRoundScores = [
                    latestRoundScore.player0Score ?? 0,
                    latestRoundScore.player1Score ?? 0,
                    latestRoundScore.player2Score ?? 0,
                    latestRoundScore.player3Score ?? 0
                  ];
                }
              }
            } catch (roundScoreError) {
              console.error('[TRICK COMPLETION] Error fetching latest round score:', roundScoreError);
            }

            console.log(`[TRICK COMPLETION] Emitting round_complete with data:`, {
              gameId,
              gameState: updatedGameState,
              scores: baseSummary,
              tricksPerPlayer: baseSummary.tricksPerPlayer,
              playerBids: baseSummary.playerBids,
              team1Bid: baseSummary.team1Bid,
              team1Tricks: baseSummary.team1Tricks,
              team2Bid: baseSummary.team2Bid,
              team2Tricks: baseSummary.team2Tricks
            });
            
            console.log(`[TRICK COMPLETION] Skipping clear_table_cards emission - managed by card play handler`);
            // CRITICAL FIX: Pass scores in extraPayload so emitPersonalizedGameEvent can properly spread it
            const emitPayload = { extraPayload: { scores: baseSummary } };
            console.log(`[TRICK COMPLETION] Emit payload structure:`, JSON.stringify(emitPayload, null, 2));
            safeEmit(emitPayload);
          } catch (roundCompleteError) {
            console.error('[TRICK COMPLETION] Error preparing round_complete event:', roundCompleteError);
            // CRITICAL FIX: Pass scores in extraPayload so emitPersonalizedGameEvent can properly spread it
            safeEmit({ extraPayload: { scores: scores ?? {} } });
          }
        }, 900); // Short delay to allow final trick animation before summary
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
    // CRITICAL: Prevent duplicate round creation with mutex
    if (this.startingRounds.has(gameId)) {
      console.log(`[TRICK COMPLETION] Round creation already in progress for game ${gameId}, skipping duplicate`);
      return;
    }
    
    this.startingRounds.add(gameId);
    
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

      // CRITICAL FIX: Use currentRound from Game table, not rounds.length
      // This prevents phantom rounds from accumulating
      const nextRoundNumber = (game.currentRound || 0) + 1;
      
      // CRITICAL FIX: Check if round already exists to prevent duplicates
      const existingRound = game.rounds.find(r => r.roundNumber === nextRoundNumber);
      if (existingRound) {
        console.log(`[TRICK COMPLETION] Round ${nextRoundNumber} already exists, not creating duplicate`);
        return existingRound;
      }
      
      // CRITICAL FIX: Check if the current round has been completed before creating a new one
      // A round is only complete if all PlayerRoundStats have non-null bids
      if (game.currentRound && game.currentRound > 0) {
        const currentRound = game.rounds.find(r => r.roundNumber === game.currentRound);
        if (currentRound) {
          const stats = await prisma.playerRoundStats.findMany({
            where: { roundId: currentRound.id }
          });
          
          const incompleteBids = stats.filter(s => s.bid === null);
          if (incompleteBids.length > 0) {
            console.error(`[TRICK COMPLETION] ERROR: Cannot start new round - current round ${game.currentRound} has ${incompleteBids.length} players with incomplete bids`);
            throw new Error(`Current round ${game.currentRound} not complete - ${incompleteBids.length} players haven't bid yet`);
          }
        }
      }
      
      console.log(`[TRICK COMPLETION] Creating round ${nextRoundNumber} (currentRound: ${game.currentRound}, existing rounds: ${game.rounds.length})`);
      
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
      
      // CRITICAL: Reset spadesBroken to false for new round
      const currentGameState = await redisGameState.getGameState(gameId);
      if (currentGameState && currentGameState.play) {
        currentGameState.play.spadesBroken = false;
        await redisGameState.setGameState(gameId, currentGameState);
        console.log(`[TRICK COMPLETION] Reset spadesBroken to false for new round ${nextRoundNumber}`);
      }
      
      // Emit game update to notify clients of new round
      if (io) {
        const updatedGameState = await GameService.getGameStateForClient(gameId);
        
        // CRITICAL: Get the latest player scores from RoundScore table for solo games
        // NOTE: This MUST happen AFTER dealInitialHands because dealInitialHands overwrites Redis cache
        if (updatedGameState.gameMode === 'SOLO') {
          const latestRoundScore = await prisma.roundScore.findFirst({
            where: { 
              Round: { gameId }
            },
            orderBy: { Round: { roundNumber: 'desc' } }
          });
          
          if (latestRoundScore) {
            updatedGameState.playerScores = [
              latestRoundScore.player0Running || 0,
              latestRoundScore.player1Running || 0,
              latestRoundScore.player2Running || 0,
              latestRoundScore.player3Running || 0
            ];
            console.log(`[TRICK COMPLETION] Updated game state with player scores AFTER dealInitialHands:`, updatedGameState.playerScores);
            
            // CRITICAL: Update Redis cache with the new player scores so future reads have correct scores
            await redisGameState.setGameState(gameId, updatedGameState);
            console.log(`[TRICK COMPLETION] Updated Redis cache with new player scores for game ${gameId}`);
          }
        }
        
        console.log(`[TRICK COMPLETION] About to emit game_update for new round ${nextRoundNumber}. Game state:`, {
          status: updatedGameState.status,
          currentRound: updatedGameState.currentRound,
          currentPlayer: updatedGameState.currentPlayer,
          players: updatedGameState.players?.length,
          playerScores: updatedGameState.playerScores
        });
        
        emitPersonalizedGameEvent(io, gameId, 'game_update', updatedGameState);
        
        console.log(`[TRICK COMPLETION] Emitted game_update for new round ${nextRoundNumber}`);
        
        // CRITICAL FIX: Emit clear_table_cards to ensure client clears all trick-related state
        // This prevents old trick cards from persisting when the new round starts
        io.to(gameId).emit('clear_table_cards', { gameId });
        console.log(`[TRICK COMPLETION] Emitted clear_table_cards for new round ${nextRoundNumber}`);
        
        // Also emit new_hand_started event for better client handling
        emitPersonalizedGameEvent(io, gameId, 'new_hand_started', updatedGameState, {
          roundNumber: nextRoundNumber
        });
        console.log(`[TRICK COMPLETION] Emitted new_hand_started for round ${nextRoundNumber}`);
        
        // CRITICAL: Kick off bidding for the first player (bot or human)
        if (updatedGameState.currentPlayer) {
          const currentPlayerFromState = updatedGameState.players.find(
            (p) => p && (p.id === updatedGameState.currentPlayer || p.userId === updatedGameState.currentPlayer)
          );

          let currentPlayerLive = null;
          try {
            const liveGameState = await GameService.getGame(gameId);
            currentPlayerLive = liveGameState?.players?.find((p) => p && p.userId === updatedGameState.currentPlayer) || null;
          } catch (timerLookupError) {
            console.error('[TRICK COMPLETION] Error retrieving live game state for bidding timer:', timerLookupError);
          }

          const seatIndex =
            currentPlayerLive?.seatIndex ??
            currentPlayerFromState?.seatIndex ??
            0;

          const isHuman =
            currentPlayerLive?.isHuman ??
            (typeof currentPlayerFromState?.isHuman === 'boolean'
              ? currentPlayerFromState.isHuman
              : currentPlayerFromState?.type !== 'bot');

          if (isHuman) {
            try {
              const { playerTimerService } = await import('./PlayerTimerService.js');
              console.log(
                `[TRICK COMPLETION] Starting bidding timer for human player ${updatedGameState.currentPlayer} (seat ${seatIndex})`
              );
              playerTimerService.startPlayerTimer(gameId, updatedGameState.currentPlayer, seatIndex, 'bidding');
            } catch (timerError) {
              console.error('[TRICK COMPLETION] Failed to start bidding timer for new round:', timerError);
            }
            console.log(`[TRICK COMPLETION] Current player is human, bot bidding trigger not required`);
          } else {
            const botName = currentPlayerFromState?.username || currentPlayerLive?.username || updatedGameState.currentPlayer;
            console.log(`[TRICK COMPLETION] ✅ Current player is bot ${botName}, triggering bot bid for new round`);
            const { BiddingHandler } = await import('../modules/socket-handlers/bidding/biddingHandler.js');
            const biddingHandler = new BiddingHandler(io, null);
            await biddingHandler.triggerBotBidIfNeeded(gameId);
            console.log(`[TRICK COMPLETION] Bot bid trigger completed for new round`);
          }
        } else {
          console.log(`[TRICK COMPLETION] No current player set - cannot trigger bidding start for new round`);
        }
      }
    } catch (error) {
      console.error('[TRICK COMPLETION] Error starting new round:', error);
      throw error;
    } finally {
      // CRITICAL: Always release the mutex
      this.startingRounds.delete(gameId);
    }
  }
}