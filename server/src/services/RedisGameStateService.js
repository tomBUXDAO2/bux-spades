import { redisClient } from '../config/redis.js';
import { prisma } from '../config/database.js';

class RedisGameStateService {
  constructor() {
    this.gameStatePrefix = 'game:state:';
    this.gameHandsPrefix = 'game:hands:';
    this.gameBidsPrefix = 'game:bids:';
    this.gameTrickPrefix = 'game:trick:';
  }

  // Generate Redis keys
  getGameStateKey(gameId) {
    return `${this.gameStatePrefix}${gameId}`;
  }

  getGameHandsKey(gameId) {
    return `${this.gameHandsPrefix}${gameId}`;
  }

  getGameBidsKey(gameId) {
    return `${this.gameBidsPrefix}${gameId}`;
  }

  getGameTrickKey(gameId) {
    return `${this.gameTrickPrefix}${gameId}`;
  }

  // REAL-TIME: Get game state from Redis (instant)
  async getGameState(gameId) {
    try {
      const key = this.getGameStateKey(gameId);
      const state = await redisClient.get(key);
      return state ? JSON.parse(state) : null;
    } catch (error) {
      console.error('[REDIS] Error getting game state:', error);
      return null;
    }
  }

  // REAL-TIME: Set game state in Redis (instant)
  async setGameState(gameId, gameState) {
    try {
      const key = this.getGameStateKey(gameId);
      await redisClient.setEx(key, 3600, JSON.stringify(gameState)); // 1 hour TTL
      return true;
    } catch (error) {
      console.error('[REDIS] Error setting game state:', error);
      return false;
    }
  }

  // REAL-TIME: Get player hands from Redis (instant)
  async getPlayerHands(gameId) {
    try {
      const key = this.getGameHandsKey(gameId);
      const hands = await redisClient.get(key);
      return hands ? JSON.parse(hands) : null;
    } catch (error) {
      console.error('[REDIS] Error getting player hands:', error);
      return null;
    }
  }

  // REAL-TIME: Set player hands in Redis (instant)
  async setPlayerHands(gameId, hands) {
    try {
      const key = this.getGameHandsKey(gameId);
      await redisClient.setEx(key, 3600, JSON.stringify(hands)); // 1 hour TTL
      return true;
    } catch (error) {
      console.error('[REDIS] Error setting player hands:', error);
      return false;
    }
  }

  // REAL-TIME: Get current trick from Redis (instant)
  async getCurrentTrick(gameId) {
    try {
      const key = this.getGameTrickKey(gameId);
      const trick = await redisClient.get(key);
      return trick ? JSON.parse(trick) : null;
    } catch (error) {
      console.error('[REDIS] Error getting current trick:', error);
      return null;
    }
  }

  // REAL-TIME: Set current trick in Redis (instant)
  async setCurrentTrick(gameId, trick) {
    try {
      const key = this.getGameTrickKey(gameId);
      await redisClient.setEx(key, 3600, JSON.stringify(trick)); // 1 hour TTL
      return true;
    } catch (error) {
      console.error('[REDIS] Error setting current trick:', error);
      return false;
    }
  }

  // REAL-TIME: Get player bids from Redis (instant)
  async getPlayerBids(gameId) {
    try {
      const key = this.getGameBidsKey(gameId);
      const bids = await redisClient.get(key);
      return bids ? JSON.parse(bids) : null;
    } catch (error) {
      console.error('[REDIS] Error getting player bids:', error);
      return null;
    }
  }

  // REAL-TIME: Set player bids in Redis (instant)
  async setPlayerBids(gameId, bids) {
    try {
      const key = this.getGameBidsKey(gameId);
      await redisClient.setEx(key, 3600, JSON.stringify(bids)); // 1 hour TTL
      return true;
    } catch (error) {
      console.error('[REDIS] Error setting player bids:', error);
      return false;
    }
  }

  // ASYNC: Sync game state to database (non-blocking)
  async syncToDatabase(gameId, gameState) {
    try {
      // This runs in background, doesn't block real-time operations
      setImmediate(async () => {
        try {
          await prisma.game.update({
            where: { id: gameId },
            data: {
              status: gameState.status,
              currentPlayer: gameState.currentPlayer,
              currentTrick: gameState.currentTrick || 0,
              dealer: gameState.dealer
            }
          });
        } catch (error) {
          console.error('[REDIS] Background DB sync failed:', error);
        }
      });
    } catch (error) {
      console.error('[REDIS] Error scheduling DB sync:', error);
    }
  }

  // ASYNC: Sync player hands to database (non-blocking)
  async syncHandsToDatabase(gameId, roundId, hands) {
    try {
      setImmediate(async () => {
        try {
          // Update hand snapshots in database
          for (let seatIndex = 0; seatIndex < 4; seatIndex++) {
            if (hands[seatIndex] && hands[seatIndex].length > 0) {
              // First try to find existing record
              const existing = await prisma.roundHandSnapshot.findFirst({
                where: {
                  roundId: roundId,
                  seatIndex: seatIndex
                }
              });

              if (existing) {
                // Update existing record
                await prisma.roundHandSnapshot.update({
                  where: { id: existing.id },
                  data: {
                    cards: JSON.stringify(hands[seatIndex])
                  }
                });
              } else {
                // Create new record
                await prisma.roundHandSnapshot.create({
                  data: {
                    roundId: roundId,
                    seatIndex: seatIndex,
                    cards: JSON.stringify(hands[seatIndex])
                  }
                });
              }
            }
          }
          console.log(`[REDIS] Background hands sync to DB complete for game ${gameId}`);
        } catch (error) {
          console.error('[REDIS] Background hands sync failed:', error);
        }
      });
    } catch (error) {
      console.error('[REDIS] Error scheduling hands sync:', error);
    }
  }

  // ASYNC: Sync bids to database (non-blocking)
  async syncBidsToDatabase(gameId, roundId, bids) {
    try {
      setImmediate(async () => {
        try {
          for (let seatIndex = 0; seatIndex < 4; seatIndex++) {
            if (bids[seatIndex] !== null && bids[seatIndex] !== undefined) {
              await prisma.playerRoundStats.upsert({
                where: {
                  roundId_seatIndex: {
                    roundId: roundId,
                    seatIndex: seatIndex
                  }
                },
                update: {
                  bid: bids[seatIndex]
                },
                create: {
                  roundId: roundId,
                  seatIndex: seatIndex,
                  bid: bids[seatIndex],
                  tricksWon: 0,
                  bagsThisRound: 0
                }
              });
            }
          }
        } catch (error) {
          console.error('[REDIS] Background bids sync failed:', error);
        }
      });
    } catch (error) {
      console.error('[REDIS] Error scheduling bids sync:', error);
    }
  }

  // Clean up Redis keys when game ends
  async cleanupGame(gameId) {
    try {
      const keys = [
        this.getGameStateKey(gameId),
        this.getGameHandsKey(gameId),
        this.getGameBidsKey(gameId),
        this.getGameTrickKey(gameId)
      ];
      
      await redisClient.del(keys);
      return true;
    } catch (error) {
      console.error('[REDIS] Error cleaning up game:', error);
      return false;
    }
  }

  // Health check
  async isHealthy() {
    try {
      await redisClient.ping();
      return true;
    } catch (error) {
      console.error('[REDIS] Health check failed:', error);
      return false;
    }
  }
}

export default new RedisGameStateService();
