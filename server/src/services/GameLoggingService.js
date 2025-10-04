import { prisma } from '../config/database.js';

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
      console.error('[GAME LOGGING] Error logging action:', error);
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
      console.log(`[GAME LOGGING] logBid called: gameId=${gameId}, roundId=${roundId}, userId=${userId}, seatIndex=${seatIndex}, bid=${bid}`);
      
      // Get the game player to find team index
      const gamePlayer = await prisma.gamePlayer.findFirst({
        where: { 
          gameId,
          userId 
        }
      });
      
      console.log(`[GAME LOGGING] Found gamePlayer:`, gamePlayer);
      const teamIndex = gamePlayer?.teamIndex || 0;

      // Create or update the PlayerRoundStats record with bid information
      const playerStats = await prisma.playerRoundStats.upsert({
        where: {
          roundId_userId: {
            roundId,
            userId
          }
        },
        update: {
          seatIndex,
          teamIndex,
          bid,
          isBlindNil
        },
        create: {
          roundId,
          userId,
          seatIndex,
          teamIndex,
          bid,
          isBlindNil,
          tricksWon: 0,
          bagsThisRound: 0,
          madeNil: false,
          madeBlindNil: false
        }
      });

      // Log the action
      await this.logGameAction(gameId, 'bid', {
        roundId,
        bid,
        isBlindNil
      }, userId, seatIndex);

      return playerStats;
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
        console.log(`[GAME LOGGING] Creating Trick record: ${trickId} with leadSeatIndex: ${seatIndex}`);
        try {
          // First check if a trick already exists for this round/trickNumber combination
          const existingTrick = await prisma.trick.findFirst({
            where: {
              roundId: roundId,
              trickNumber: trickNumber
            }
          });

          if (existingTrick) {
            console.log(`[GAME LOGGING] Trick already exists for round ${roundId}, trick ${trickNumber}, using existing: ${existingTrick.id}`);
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
            
            trickRecord = await prisma.trick.create({
              data: trickData
            });
            console.log(`[GAME LOGGING] Successfully created Trick record: ${trickId}`);
          }
        } catch (createError) {
          console.error('[GAME LOGGING] Error creating Trick record:', createError);
          throw createError;
        }
      } else {
        console.log(`[GAME LOGGING] Trick record already exists: ${trickId}`);
      }

      // Guards before inserting a card
      // 1) Do not allow more than 4 cards in a trick
      const existingCardsCount = await prisma.trickCard.count({ where: { trickId: trickRecord.id } });
      if (existingCardsCount >= 4) {
        console.log(`[GAME LOGGING] Guard: trick ${trickRecord.id} already has ${existingCardsCount} cards. Skipping insert.`);
        return { cardRecord: null, actualTrickId: trickRecord.id, playOrder: existingCardsCount };
      }
      // 2) Do not allow the same seat to play twice in a trick
      const seatAlreadyPlayed = await prisma.trickCard.findFirst({ where: { trickId: trickRecord.id, seatIndex } });
      if (seatAlreadyPlayed) {
        console.log(`[GAME LOGGING] Guard: seat ${seatIndex} already played in trick ${trickRecord.id}. Skipping insert.`);
        return { cardRecord: null, actualTrickId: trickRecord.id, playOrder: existingCardsCount };
      }
      const calculatedPlayOrder = existingCardsCount + 1;
      console.log(`[GAME LOGGING] Calculated playOrder from DB: ${calculatedPlayOrder} (${existingCardsCount} existing cards in trick ${trickRecord.id})`);

      // Batch all database operations in a single transaction for performance
      const results = await prisma.$transaction(async (tx) => {
        // 1. Create the trick card record
        const cardRecord = await tx.trickCard.create({
          data: {
            trickId: trickRecord.id,
            seatIndex,
            suit,
            rank,
            playOrder: calculatedPlayOrder,
            playedAt: new Date()
          }
        });

        // 2. Log the action (async, don't wait)
        tx.gameAction.create({
          data: {
            gameId,
            action: 'play_card',
            data: {
              roundId,
              trickId: trickRecord.id,
              suit,
              rank,
              playOrder: calculatedPlayOrder
            },
            userId,
            seatIndex,
            timestamp: new Date()
          }
        }).catch(err => console.log('[GAME LOGGING] Async action log failed:', err));

        // 3. Remove the played card from the player's hand
        const handSnapshot = await tx.roundHandSnapshot.findFirst({
          where: { roundId, seatIndex }
        });

        if (handSnapshot && handSnapshot.hand) {
          const hand = JSON.parse(handSnapshot.hand);
          const updatedHand = hand.filter(card => 
            !(card.suit === suit && card.rank === rank)
          );
          
          await tx.roundHandSnapshot.update({
            where: { id: handSnapshot.id },
            data: { hand: JSON.stringify(updatedHand) }
          });
        }

        return { cardRecord };
      });

      return { cardRecord: results.cardRecord, actualTrickId: trickRecord.id, playOrder: calculatedPlayOrder };
    } catch (error) {
      console.error('[GAME LOGGING] Error logging card play:', error);
      throw error;
    }
  }

  /**
   * Remove a played card from the player's hand in RoundHandSnapshot
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

      // Get current hand
      const currentHand = handSnapshot.cards || [];
      
      // Find and remove the played card
      const updatedHand = currentHand.filter(card => 
        !(card.suit === suit && card.rank === rank)
      );

      if (updatedHand.length === currentHand.length) {
        console.warn(`[GAME LOGGING] Card ${suit}${rank} not found in hand for seat ${seatIndex}`);
        return;
      }

      // Update the hand snapshot
      await prisma.roundHandSnapshot.update({
        where: { id: handSnapshot.id },
        data: { cards: updatedHand }
      });

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