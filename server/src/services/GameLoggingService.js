import { prisma } from '../config/database.js';
import redisGameState from './RedisGameStateService.js';

export class GameLoggingService {
  /**
   * Log a game action to the database
   * @param {string} gameId - The game ID
   * @param {string} action - The action type (bid, play_card, trick_complete, etc.)
   * @param {Object} data - Action-specific data
   * @param {string} userId - User who performed the action
   * @param {number} seatIndex - Seat index of the player
   */
  static async logGameAction(gameId, action, data, userId, seatIndex) {
    try {
      // Skip logging if gameActionLog doesn't exist
      console.log(`[GAME LOGGING] Skipping action ${action} for game ${gameId}:`, data);
      return null;
    } catch (error) {
      // NUCLEAR: No logging for performance
      return null;
    }
  }

  /**
   * Log a bid action
   * @param {string} gameId - The game ID
   * @param {string} roundId - The round ID
   * @param {string} userId - User who bid
   * @param {number} seatIndex - Seat index
   * @param {number} bid - The bid amount
   * @param {boolean} isNil - Whether it's a nil bid
   * @param {boolean} isBlindNil - Whether it's a blind nil bid
   */
  static async logBid(gameId, roundId, userId, seatIndex, bid, isBlindNil = false) {
    try {
      // Update PlayerRoundStats with bid
      await prisma.playerRoundStats.updateMany({
        where: {
          roundId: roundId,
          userId: userId
        },
        data: {
          bid: bid,
          isBlindNil: isBlindNil
        }
      });
      
      // Don't clear Redis cache - we want to keep the bids in Redis
      // The Redis bids will be updated separately in the bidding handler
      
      console.log(`[GAME LOGGING] Logged bid: user=${userId}, bid=${bid}, blind=${isBlindNil}`);
      return true;
    } catch (error) {
      console.error('[GAME LOGGING] Error logging bid:', error);
      throw error;
    }
  }

  /**
   * Log a card play action
   * @param {string} gameId - The game ID
   * @param {string} roundId - The round ID
   * @param {string} trickId - The trick ID
   * @param {string} userId - User who played the card
   * @param {number} seatIndex - Seat index
   * @param {string} suit - Card suit
   * @param {string} rank - Card rank
   * @param {number} playOrder - Order in which the card was played
   * @param {number} trickNumber - Trick number in the round (default: 1)
   */
  static async logCardPlay(gameId, roundId, trickId, userId, seatIndex, suit, rank, playOrder, trickNumber = 1) {
    try {
      // First, ensure the Trick exists in the database
      let trickRecord = null;
      
      // If trickId is provided, try to find it
      if (trickId) {
        trickRecord = await prisma.trick.findUnique({
          where: { id: trickId }
        });
      }
      
      // If trick doesn't exist and trickId is provided, that's an error
      if (trickId && !trickRecord) {
        throw new Error(`Trick with id ${trickId} not found`);
      }
      
      // If no trickId provided, create a new trick
      if (!trickRecord) {
        // NUCLEAR: No logging for performance
        try {
          // First check if a trick already exists for this round/trickNumber combination
          const existingTrick = await prisma.trick.findFirst({
            where: {
              roundId: roundId,
              trickNumber: trickNumber
            }
          });

          if (existingTrick) {
            // NUCLEAR: No logging for performance
            trickRecord = existingTrick;
          } else {
            const trickData = {
              roundId: roundId,
              trickNumber: trickNumber,
              leadSeatIndex: seatIndex,
              winningSeatIndex: null
            };
            
            // Only set id if trickId is provided and not null
            if (trickId) {
              trickData.id = trickId;
            }
            
            // CRITICAL FIX: Do NOT create tricks in logging service
            // Tricks should only be created by the main game logic
            console.error(`[GAME LOGGING] ERROR: Attempted to create trick in logging service - this should not happen!`);
            throw new Error('Trick creation attempted in logging service');
            // NUCLEAR: No logging for performance
          }
        } catch (createError) {
          // NUCLEAR: No logging for performance
          throw createError;
        }
      } else {
        // NUCLEAR: No logging for performance
      }

      // Guards before inserting a card
      // 1) Do not allow more than 4 cards in a trick
      const existingCardsCount = await prisma.trickCard.count({ where: { trickId: trickRecord.id } });
      if (existingCardsCount >= 4) {
        console.log(`[GAME LOGGING] Guard: trick ${trickRecord.id} already has ${existingCardsCount} cards. Skipping insert.`);
        return { cardRecord: null, actualTrickId: trickRecord.id, playOrder: existingCardsCount, rejected: true };
      }
      // 2) Do not allow the same seat to play twice in a trick
      const seatAlreadyPlayed = await prisma.trickCard.findFirst({ where: { trickId: trickRecord.id, seatIndex } });
      if (seatAlreadyPlayed) {
        console.log(`[GAME LOGGING] Guard: seat ${seatIndex} already played in trick ${trickRecord.id}. Skipping insert.`);
        return { cardRecord: null, actualTrickId: trickRecord.id, playOrder: existingCardsCount, rejected: true };
      }
      
      // 3) CRITICAL: Enforce suit following rules
      if (existingCardsCount > 0) {
        // Get the lead suit from the first card played
        const leadCard = await prisma.trickCard.findFirst({
          where: { trickId: trickRecord.id },
          orderBy: { playOrder: 'asc' }
        });
        
        if (leadCard && leadCard.suit !== suit) {
          // Player is not following suit - check if they have cards of the lead suit
          const playerHand = await redisGameState.getPlayerHands(gameId);
          if (playerHand && playerHand[seatIndex]) {
            const hasLeadSuit = playerHand[seatIndex].some(card => 
              card.suit === leadCard.suit
            );
            
            if (hasLeadSuit) {
              console.log(`[GAME LOGGING] Guard: seat ${seatIndex} must follow suit ${leadCard.suit} but played ${suit}. Rejecting card play.`);
              return { cardRecord: null, actualTrickId: trickRecord.id, playOrder: existingCardsCount, rejected: true };
            } else {
              // Player is void in lead suit - they can play any card (spades trump or dump)
              console.log(`[GAME LOGGING] Seat ${seatIndex} is void in lead suit ${leadCard.suit}, playing ${suit} is valid`);
            }
          }
        }
      }
      const calculatedPlayOrder = existingCardsCount + 1;
      console.log(`[GAME LOGGING] Calculated playOrder from DB: ${calculatedPlayOrder} (${existingCardsCount} existing cards in trick ${trickRecord.id})`);

      // CRITICAL: Update spadesBroken flag if a spade is played
      if (suit === 'SPADES') {
        console.log(`[GAME LOGGING] Spade played - updating spadesBroken flag to true`);
        try {
          // Update Redis cache with spadesBroken = true
          const currentGameState = await redisGameState.getGameState(gameId);
          if (currentGameState) {
            if (!currentGameState.play) currentGameState.play = {};
            currentGameState.play.spadesBroken = true;
            await redisGameState.setGameState(gameId, currentGameState);
            console.log(`[GAME LOGGING] Updated Redis cache: spadesBroken = true`);
            console.log(`[GAME LOGGING] Redis cache structure after spadesBroken update:`, JSON.stringify(currentGameState, null, 2));
          }
        } catch (error) {
          console.error(`[GAME LOGGING] Error updating spadesBroken flag:`, error);
        }
      }

      // Create the trick card record (simplified - no transaction)
      const cardRecord = await prisma.trickCard.create({
        data: {
          trickId: trickRecord.id,
          seatIndex,
          suit,
          rank,
          playOrder: calculatedPlayOrder,
          playedAt: new Date()
        }
      });

      // NUCLEAR: Skip ALL logging for maximum speed
      // this.logGameAction(gameId, 'play_card', {
      //   roundId,
      //   trickId: trickRecord.id,
      //   suit,
      //   rank,
      //   playOrder: calculatedPlayOrder
      // }, userId, seatIndex).catch(err => 
      //   console.log('[GAME LOGGING] Async action log failed:', err)
      // );

      // Remove card from hand (required for game logic) - SYNCHRONOUS
      await this.removeCardFromHand(roundId, seatIndex, suit, rank);

      return { cardRecord, actualTrickId: trickRecord.id, playOrder: calculatedPlayOrder };
    } catch (error) {
      console.error('[GAME LOGGING] Error logging card play:', error);
      throw error;
    }
  }

  /**
   * Remove a played card from the player's hand in RoundHandSnapshot and Redis
   */
  static async removeCardFromHand(roundId, seatIndex, suit, rank) {
    try {
      // Find the hand snapshot for this player
      const handSnapshot = await prisma.roundHandSnapshot.findFirst({
        where: { roundId, seatIndex }
      });

      if (!handSnapshot) {
        console.error(`[GAME LOGGING] No hand snapshot found for round ${roundId}, seat ${seatIndex}`);
        return;
      }

      // Get current hand - ensure it's an array
      let currentHand = handSnapshot.cards || [];
      if (typeof currentHand === 'string') {
        try {
          currentHand = JSON.parse(currentHand);
        } catch (error) {
          console.error(`[GAME LOGGING] Failed to parse cards JSON for seat ${seatIndex}:`, error);
          currentHand = [];
        }
      }
      
      // Find and remove the played card
      const updatedHand = currentHand.filter(card => 
        !(card.suit === suit && card.rank === rank)
      );

      if (updatedHand.length === currentHand.length) {
        console.warn(`[GAME LOGGING] Card ${suit}${rank} not found in hand for seat ${seatIndex}`);
        return;
      }

      // Update the hand snapshot in database
      await prisma.roundHandSnapshot.update({
        where: { id: handSnapshot.id },
        data: { cards: updatedHand }
      });

      // Update Redis cache
      try {
        const { redisClient } = await import('../config/redis.js');
        // Get gameId from round
        const round = await prisma.round.findUnique({
          where: { id: roundId },
          select: { gameId: true }
        });
        
        if (round?.gameId) {
          // Get current hands from Redis using correct key format
          const currentRedisHands = await redisClient.get(`game:hands:${round.gameId}`);
          if (currentRedisHands) {
            const hands = JSON.parse(currentRedisHands);
            if (hands[seatIndex]) {
              hands[seatIndex] = hands[seatIndex].filter(card => 
                !(card.suit === suit && card.rank === rank)
              );
              await redisClient.set(`game:hands:${round.gameId}`, JSON.stringify(hands), { EX: 3600 });
              console.log(`[GAME LOGGING] Updated Redis hands for seat ${seatIndex}`);
              
              // CRITICAL: Also update the main game state cache with new hands
              const gameStateKey = `game:state:${round.gameId}`;
              const currentGameState = await redisClient.get(gameStateKey);
              if (currentGameState) {
                const gameState = JSON.parse(currentGameState);
                gameState.hands = hands; // Update hands in main game state
                await redisClient.set(gameStateKey, JSON.stringify(gameState), { EX: 3600 });
                console.log(`[GAME LOGGING] Updated main game state cache with new hands`);
              }
            }
          }
        }
      } catch (redisError) {
        console.error('[GAME LOGGING] Error updating Redis hands:', redisError);
      }

      console.log(`[GAME LOGGING] Removed card ${suit}${rank} from seat ${seatIndex} hand (${currentHand.length} -> ${updatedHand.length})`);
    } catch (error) {
      console.error('[GAME LOGGING] Error removing card from hand:', error);
      throw error;
    }
  }

  /**
   * Log a trick completion
   * @param {string} gameId - The game ID
   * @param {string} roundId - The round ID
   * @param {string} trickId - The trick ID
   * @param {number} trickNumber - The trick number
   * @param {number} winningSeatIndex - The winning seat index
   * @param {Array} cards - Array of cards played in the trick
   */
  static async logTrickComplete(gameId, roundId, trickId, trickNumber, winningSeatIndex, cards) {
    try {
      // Update the trick record
      const trickRecord = await prisma.trick.update({
        where: { id: trickId },
        data: {
          winningSeatIndex
        }
      });

      // Log the action
      await this.logGameAction(gameId, 'trick_complete', {
        roundId,
        trickId,
        trickNumber,
        winningSeatIndex,
        cards
      }, 'system', 0);

      return trickRecord;
    } catch (error) {
      console.error('[GAME LOGGING] Error logging trick completion:', error);
      throw error;
    }
  }

  /**
   * Log a round completion
   * @param {string} gameId - The game ID
   * @param {string} roundId - The round ID
   * @param {number} roundNumber - The round number
   * @param {Array} playerStats - Array of player statistics for the round
   */
  static async logRoundComplete(gameId, roundId, roundNumber, playerStats) {
    try {
      // No finishedAt column on Round; skip updating round timestamps
      const roundRecord = await prisma.round.findUnique({ where: { id: roundId } });

      // Update player stats for the round
      for (const stats of playerStats) {
        await prisma.playerRoundStats.upsert({
          where: {
            roundId_userId: {
              roundId,
              userId: stats.userId
            }
          },
          update: {
            seatIndex: stats.seatIndex,
            teamIndex: stats.teamIndex ?? null,
            bid: stats.bid ?? null,
            isBlindNil: stats.isBlindNil ?? false,
            tricksWon: stats.tricksWon ?? 0,
            bagsThisRound: stats.bagsThisRound ?? 0,
            madeNil: stats.madeNil ?? false,
            madeBlindNil: stats.madeBlindNil ?? false
          },
          create: {
            roundId,
            userId: stats.userId,
            seatIndex: stats.seatIndex,
            teamIndex: stats.teamIndex ?? null,
            bid: stats.bid ?? null,
            isBlindNil: stats.isBlindNil ?? false,
            tricksWon: stats.tricksWon ?? 0,
            bagsThisRound: stats.bagsThisRound ?? 0,
            madeNil: stats.madeNil ?? false,
            madeBlindNil: stats.madeBlindNil ?? false
          }
        });
      }

      // Log the action
      await this.logGameAction(gameId, 'round_complete', {
        roundId,
        roundNumber,
        playerStats
      }, 'system', 0);

      return roundRecord;
    } catch (error) {
      console.error('[GAME LOGGING] Error logging round completion:', error);
      throw error;
    }
  }

  /**
   * Log a game completion
   * @param {string} gameId - The game ID
   * @param {Object} gameResult - The final game result
   */
  static async logGameComplete(gameId, gameResult) {
    try {
      // Create the game result record
      const resultRecord = await prisma.gameResult.create({
        data: {
          gameId,
          winner: gameResult.winner,
          team0Final: gameResult.team0Final,
          team1Final: gameResult.team1Final,
          player0Final: gameResult.player0Final,
          player1Final: gameResult.player1Final,
          player2Final: gameResult.player2Final,
          player3Final: gameResult.player3Final,
          totalRounds: gameResult.totalRounds,
          totalTricks: gameResult.totalTricks,
          meta: gameResult.meta || {}
        }
      });

      // Update the game status - DISABLED - use GameService instead
      console.log(`[GAME LOGGING] WOULD mark game as FINISHED but this is DISABLED`);
      // await prisma.game.update({
      //   where: { id: gameId },
      //   data: {
      //     status: 'FINISHED',
      //     finishedAt: new Date()
      //   }
      // });

      // Log the action
      await this.logGameAction(gameId, 'game_complete', gameResult, 'system', 0);

      return resultRecord;
    } catch (error) {
      console.error('[GAME LOGGING] Error logging game completion:', error);
      throw error;
    }
  }

  /**
   * Get game state from database (single source of truth)
   * @param {string} gameId - The game ID
   * @returns {Object} Complete game state from database
   */
  static async getGameStateFromDB(gameId) {
    try {
      // First get the basic game
      const game = await prisma.game.findUnique({
        where: { id: gameId }
      });

      if (!game) {
        throw new Error('Game not found');
      }

      // Get players separately
      const players = await prisma.gamePlayer.findMany({
        where: { gameId }
      });

      // Get user info for each player
      const playersWithUsers = await Promise.all(
        players.map(async (player) => {
          const user = await prisma.user.findUnique({
            where: { id: player.userId },
            select: {
              id: true,
              username: true,
              avatarUrl: true
            }
          });
          return {
            ...player,
            user
          };
        })
      );

      // Get rounds separately
      const rounds = await prisma.round.findMany({
        where: { gameId },
        orderBy: { roundNumber: 'asc' }
      });

      // Get bids, tricks, and player stats for each round
      const roundsWithData = await Promise.all(
        rounds.map(async (round) => {
          const [bids, tricks, playerStats] = await Promise.all([
            prisma.roundBid.findMany({ where: { roundId: round.id } }),
            prisma.trick.findMany({ 
              where: { roundId: round.id },
              include: {
                cards: true
              }
            }),
            prisma.playerRoundStats.findMany({ where: { roundId: round.id } })
          ]);

          return {
            ...round,
            bids,
            tricks,
            playerStats
          };
        })
      );

      // Get result if exists
      const result = await prisma.gameResult.findUnique({
        where: { gameId }
      });

      return {
        ...game,
        players: playersWithUsers,
        rounds: roundsWithData,
        result
      };
    } catch (error) {
      console.error('[GAME LOGGING] Error getting game state from DB:', error);
      throw error;
    }
  }

  /**
   * Update game state in database
   * @param {string} gameId - The game ID
   * @param {Object} gameState - The game state to save
   */
  static async updateGameState(gameId, gameState) {
    try {
      const updatedGame = await prisma.game.update({
        where: { id: gameId },
        data: {
          gameState: JSON.stringify(gameState),
          currentRound: gameState.currentRound,
          currentTrick: gameState.currentTrick,
          currentPlayer: gameState.currentPlayer,
          lastActionAt: new Date()
        }
      });

      console.log(`[GAME LOGGING] Updated game state for ${gameId}`);
      return updatedGame;
    } catch (error) {
      console.error('[GAME LOGGING] Error updating game state:', error);
      throw error;
    }
  }

  /**
   * Get game action logs
   * @param {string} gameId - The game ID
   * @param {number} limit - Number of logs to retrieve
   * @returns {Array} Array of game action logs
   */
  static async getGameActionLogs(gameId, limit = 100) {
    try {
      const logs = await prisma.gameActionLog.findMany({
        where: { gameId },
        orderBy: { timestamp: 'desc' },
        take: limit
      });

      return logs;
    } catch (error) {
      console.error('[GAME LOGGING] Error getting game action logs:', error);
      throw error;
    }
  }
}