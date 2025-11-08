import { prisma } from '../config/database.js';
import redisGameState from './RedisGameStateService.js';
import { ScoringService } from './ScoringService.js';
// CONSOLIDATED: DatabaseGameEngine removed - using GameService directly
import { PerformanceMiddleware } from '../middleware/PerformanceMiddleware.js';

// Global mutex to prevent concurrent database operations
const databaseOperations = new Set();

/**
 * DATABASE-FIRST GAME SERVICE
 * Single source of truth: PostgreSQL database
 * No in-memory state - everything is computed from DB
 */
export class GameService {
  // Create a new game - database only
  static async createGame(gameData) {
    try {
      console.log(`[GAME SERVICE] Creating game with status: WAITING`);
      
      // Ensure creator user exists to satisfy FK on GamePlayer.userId
      if (gameData.createdById) {
        try {
          console.log('[GAME SERVICE] Upserting creator user:', {
            id: gameData.createdById,
            username: gameData.createdByUsername
          });
          await prisma.user.upsert({
            where: { id: gameData.createdById },
            update: {},
            create: {
              id: gameData.createdById,
              discordId: gameData.createdById,
              username: gameData.createdByUsername || 'Player',
              avatarUrl: gameData.createdByAvatar || null
            }
          });
          console.log('[GAME SERVICE] Upserted creator user');
        } catch (e) {
          console.error('[GAME SERVICE] Failed to upsert creator user:', e);
          // Continue; game creation can still proceed, but GamePlayer insert may fail without user
        }
      }
      
      const isLeague = gameData.eventId ? true : Boolean(gameData.isLeague);

      const dbGame = await prisma.game.create({
        data: {
          id: gameData.id,
          createdById: gameData.createdById,
          mode: gameData.mode,
          format: gameData.format,
          gimmickVariant: gameData.gimmickVariant,
          isLeague,
          isRated: gameData.isRated || false,
          maxPoints: gameData.maxPoints,
          minPoints: gameData.minPoints,
          buyIn: gameData.buyIn,
          nilAllowed: gameData.nilAllowed !== false,
          blindNilAllowed: gameData.blindNilAllowed || false,
          specialRules: gameData.specialRules,
          eventId: gameData.eventId || null,
          status: 'WAITING',
          dealer: Math.floor(Math.random() * 4), // Random dealer 0-3
          currentRound: 1,
          currentTrick: 0,
          currentPlayer: null,
          gameState: gameData,
          createdAt: new Date()
        }
      });
      
      console.log(`[GAME SERVICE] Game created in DB with status:`, dbGame.status);

      // Add creator as first player (seat 0)
      await prisma.gamePlayer.create({
        data: {
          gameId: gameData.id,
          userId: gameData.createdById,
          seatIndex: 0,
          teamIndex: 0,
          isHuman: true,
          joinedAt: new Date()
        }
      });

      console.log(`[GAME SERVICE] Created game ${gameData.id} with creator ${gameData.createdById} in seat 0`);
      
      // CRITICAL FIX: Immediately cache the game state in Redis for instant access
      try {
        const fullGameState = await this.getFullGameStateFromDatabase(gameData.id);
        if (fullGameState) {
          await redisGameState.setGameState(gameData.id, fullGameState);
          console.log(`[GAME SERVICE] Cached newly created game ${gameData.id} in Redis`);
        }
      } catch (cacheError) {
        console.error(`[GAME SERVICE] Error caching newly created game ${gameData.id}:`, cacheError);
        // Don't throw - game creation should succeed even if caching fails
      }
      
      // Return the database game object (no in-memory Game object)
      return dbGame;
    } catch (error) {
      console.error('[GAME SERVICE] Error creating game:', error);
      throw error;
    }
  }

  // Get ultra-lightweight game state for bidding/card play (ULTRA FAST)
  static async getGameForAction(gameId) {
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        // Simplified mutex - just wait briefly if operation is in progress
        if (databaseOperations.has(gameId)) {
          console.log(`[GAME SERVICE] Database operation already in progress for game ${gameId}, waiting briefly...`);
          // Wait briefly and then proceed anyway to prevent blocking
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        databaseOperations.add(gameId);
        
        // ULTRA LIGHTWEIGHT: Only get absolute essentials for bidding/card play
        const game = await PerformanceMiddleware.timeOperation('getGameForAction_database_query', () => 
          prisma.game.findUnique({
            where: { id: gameId },
            select: {
              id: true,
              status: true,
              currentPlayer: true,
              currentRound: true,
              currentTrick: true,
              dealer: true,
              format: true,
              gimmickVariant: true,
              players: {
                select: {
                  id: true,
                  userId: true,
                  seatIndex: true,
                  teamIndex: true,
                  isHuman: true
                },
                orderBy: { seatIndex: 'asc' }
              },
              rounds: {
                where: { roundNumber: { gte: 1 } },
                select: {
                  id: true,
                  roundNumber: true,
                  dealerSeatIndex: true
                },
                orderBy: { roundNumber: 'desc' },
                take: 1
              }
            }
          })
        );

        if (!game) {
          return null;
        }

        return game;
        
      } catch (error) {
        retryCount++;
        console.error(`[GAME SERVICE] Error getting game for action (attempt ${retryCount}/${maxRetries}):`, error);
        
        if (retryCount >= maxRetries) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 100 * retryCount));
      } finally {
        databaseOperations.delete(gameId);
      }
    }
  }

  // Get lightweight game state from database (FAST - only essential data)
  static async getGame(gameId) {
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        // Simplified mutex - just wait briefly if operation is in progress
        if (databaseOperations.has(gameId)) {
          console.log(`[GAME SERVICE] Database operation already in progress for game ${gameId}, waiting briefly...`);
          // Wait briefly and then proceed anyway to prevent blocking
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        databaseOperations.add(gameId);
        
        // LIGHTWEIGHT: Only get essential game data - no tricks, cards, or heavy data
        const game = await PerformanceMiddleware.timeOperation('getGame_database_query', () => 
          prisma.game.findUnique({
            where: { id: gameId },
            include: {
              players: {
                include: {
                  user: {
                    select: { id: true, username: true, avatarUrl: true }
                  }
                },
                orderBy: { seatIndex: 'asc' }
              },
              rounds: {
                select: {
                  id: true,
                  roundNumber: true,
                  dealerSeatIndex: true,
                  createdAt: true,
                  playerStats: {
                    select: {
                      seatIndex: true,
                      bid: true,
                      tricksWon: true,
                      isBlindNil: true,
                      madeNil: true,
                      madeBlindNil: true
                    },
                    orderBy: { seatIndex: 'asc' }
                  }
                },
                orderBy: { roundNumber: 'asc' }
              },
              result: true
            }
          })
        );

        if (!game) {
          return null;
        }

        return game;
        
      } catch (error) {
        retryCount++;
        console.error(`[GAME SERVICE] Error getting game (attempt ${retryCount}/${maxRetries}):`, error);
        
        // Always clean up on error
        databaseOperations.delete(gameId);
        
        // Check if it's a database connection error (P1017, P1001, or connection closed)
        if ((error.code === 'P1017' || error.code === 'P1001' || 
             error.message?.includes('Server has closed the connection') ||
             error.message?.includes('Can\'t reach database server')) && 
            retryCount < maxRetries) {
          console.log(`[GAME SERVICE] Database connection error, retrying in ${retryCount * 1000}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryCount * 1000));
          continue;
        }
        
        // If we've exhausted retries or it's not a connection error, throw
        if (retryCount >= maxRetries) {
          console.error(`[GAME SERVICE] Failed to get game after ${maxRetries} attempts`);
          throw error;
        }
        
        // For non-connection errors, throw immediately
        throw error;
      } finally {
        databaseOperations.delete(gameId);
      }
    }
  }

  // Update game in database with retry logic to prevent games from getting stuck
  static async updateGame(gameId, updates) {
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        console.log(`[GAME SERVICE] updateGame called for ${gameId}:`, {
          updateKeys: Object.keys(updates)
        });
        
        // Filter out related models that can't be updated directly
        const { players, rounds, result: gameResult, ...gameUpdates } = updates;
        
        const updatedGame = await prisma.game.update({
          where: { id: gameId },
          data: {
            ...gameUpdates,
            updatedAt: new Date()
          }
        });

        console.log(`[GAME SERVICE] Game updated successfully:`, updatedGame.id);
        return updatedGame;
        
      } catch (error) {
        retryCount++;
        console.error(`[GAME SERVICE] Error updating game (attempt ${retryCount}/${maxRetries}):`, error);
        
        // Check if it's a database connection error
        if (error.code === 'P1017' || error.message?.includes('Server has closed the connection')) {
          if (retryCount < maxRetries) {
            console.log(`[GAME SERVICE] Database connection error, retrying in ${retryCount * 1000}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryCount * 1000));
            continue;
          }
        }
        
        // If we've exhausted retries or it's not a connection error, throw
        if (retryCount >= maxRetries) {
          console.error(`[GAME SERVICE] Failed to update game after ${maxRetries} attempts`);
          throw error;
        }
      }
    }
  }

  // Get all active games - database only
  static async getActiveGames() {
    try {
      const dbGames = await prisma.game.findMany({
        where: {
          status: {
            in: ['WAITING', 'BIDDING', 'PLAYING']
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Get players for all games
      const gameIds = dbGames.map(g => g.id);
      const allPlayers = await prisma.gamePlayer.findMany({
        where: { gameId: { in: gameIds } },
        orderBy: [{ gameId: 'asc' }, { seatIndex: 'asc' }]
      });

      // Get user info for all players
      const allUserIds = Array.from(new Set(allPlayers.map(p => p.userId)));
      const allUsers = await prisma.user.findMany({
        where: { id: { in: allUserIds } },
        select: { id: true, username: true, avatarUrl: true }
      });
      const userMap = new Map(allUsers.map(u => [u.id, u]));

      // Build games with players
      return dbGames.map(dbGame => {
        const gamePlayers = allPlayers.filter(p => p.gameId === dbGame.id);
        const playersWithUsers = gamePlayers.map(player => ({
          ...player,
          user: userMap.get(player.userId)
        }));

        return {
          ...dbGame,
          players: playersWithUsers
        };
      });
    } catch (error) {
      // NUCLEAR: No logging for performance
      throw error;
    }
  }

  // Delete game
  static async deleteGame(gameId) {
    try {
      // Gather related entity IDs
      const rounds = await prisma.round.findMany({
        where: { gameId },
        select: { id: true }
      });
      const roundIds = rounds.map(r => r.id);

      let trickIds = [];
      if (roundIds.length > 0) {
        const tricks = await prisma.trick.findMany({
          where: { roundId: { in: roundIds } },
          select: { id: true }
        });
        trickIds = tricks.map(t => t.id);
      }

      // Delete lowest-level children first to satisfy FKs
      if (trickIds.length > 0) {
        await prisma.trickCard.deleteMany({ where: { trickId: { in: trickIds } } }).catch(err => console.log('[DELETE] trickCard error:', err.message));
      }
      if (roundIds.length > 0) {
        await prisma.trick.deleteMany({ where: { roundId: { in: roundIds } } }).catch(err => console.log('[DELETE] trick error:', err.message));
        
        // Use raw SQL for tables not in Prisma schema
        await prisma.$executeRaw`DELETE FROM "RoundHandSnapshot" WHERE "roundId" = ANY(${roundIds})`.catch(err => console.log('[DELETE] roundHandSnapshot error:', err.message));
        await prisma.$executeRaw`DELETE FROM "PlayerRoundStats" WHERE "roundId" = ANY(${roundIds})`.catch(err => console.log('[DELETE] playerRoundStats error:', err.message));
        
        await prisma.roundScore.deleteMany({ where: { roundId: { in: roundIds } } }).catch(err => console.log('[DELETE] roundScore error:', err.message));
        await prisma.round.deleteMany({ where: { id: { in: roundIds } } }).catch(err => console.log('[DELETE] round error:', err.message));
      }

      // Delete direct children of Game
      await prisma.eventGame.deleteMany({ where: { gameId } }).catch(() => {});
      await prisma.gameResult.deleteMany({ where: { gameId } }).catch(() => {});
      await prisma.gamePlayer.deleteMany({ where: { gameId } }).catch(() => {});

      // Finally delete the Game
      await prisma.game.delete({ where: { id: gameId } });

      return true;
    } catch (error) {
      console.error('[GAME SERVICE] Error deleting game:', error);
      throw error;
    }
  }

  // Database-first game operations (replacing in-memory Game methods)

  /**
   * Start a game - database only
   */
  static async startGame(gameId) {
    try {
      console.log(`[GAME SERVICE] Starting game ${gameId}`);
      
      // Read existing game to keep assigned dealer
      const existing = await prisma.game.findUnique({ where: { id: gameId } });
      const dealerSeatIndex = existing?.dealer ?? 0;

      // Update game status (do not overwrite dealer here)
      await prisma.game.update({
        where: { id: gameId },
        data: {
          status: 'BIDDING',
          startedAt: new Date(),
          currentPlayer: null // Will be set by bidding logic
        }
      });

      // Create first round
      const round = await prisma.round.create({
        data: {
          gameId,
          roundNumber: 1,
          dealerSeatIndex
        }
      });

      console.log(`[GAME SERVICE] Game ${gameId} started, round ${round.id} created`);
      return round;
    } catch (error) {
      console.error('[GAME SERVICE] Error starting game:', error);
      throw error;
    }
  }

  /**
   * Join game - database only
   */
  static async joinGame(gameId, userId, seatIndex = null) {
    try {
      console.log(`[GAME SERVICE] User ${userId} joining game ${gameId}`);
      
      const transaction = await prisma.$transaction(async (tx) => {
        // Get current players
        const existingPlayers = await tx.gamePlayer.findMany({
          where: { gameId },
          orderBy: { seatIndex: 'asc' }
        });

        // Check if user already in game
        const existingPlayer = existingPlayers.find(p => p.userId === userId);
        if (existingPlayer) {
          throw new Error('User already in game');
        }

        // Find available seat
        const takenSeats = existingPlayers.map(p => p.seatIndex);
        
        if (seatIndex === null) {
          // Auto-assign first available seat
          seatIndex = 0;
          while (takenSeats.includes(seatIndex) && seatIndex < 4) {
            seatIndex++;
          }
        } else {
          // Validate requested seat is available
          if (takenSeats.includes(seatIndex)) {
            throw new Error(`Seat ${seatIndex} is already taken`);
          }
        }

        if (seatIndex >= 4) {
          throw new Error('Game is full');
        }

        // Add player
        const player = await tx.gamePlayer.create({
          data: {
            gameId,
            userId,
            seatIndex,
            teamIndex: seatIndex % 2,
            isHuman: true,
            joinedAt: new Date()
          }
        });

        return player;
      });

      console.log(`[GAME SERVICE] User ${userId} joined game ${gameId} in seat ${transaction.seatIndex}`);
      return {
        success: true,
        seatIndex: transaction.seatIndex,
        teamIndex: transaction.teamIndex
      };
    } catch (error) {
      console.error('[GAME SERVICE] Error joining game:', error);
      throw error;
    }
  }

  /**
   * Leave game - database only
   */
  static async leaveGame(gameId, userId) {
    try {
      console.log(`[GAME SERVICE] User ${userId} leaving game ${gameId}`);
      
      // Determine if the game is rated to decide leave strategy
      const game = await prisma.game.findUnique({ where: { id: gameId }, select: { isRated: true } });
      const isRated = !!game?.isRated;

      if (isRated) {
        // For rated games, keep the row for auditing; mark as left
      await prisma.gamePlayer.updateMany({
        where: { gameId, userId },
        data: { leftAt: new Date() }
      });
      } else {
        // For unrated games, fully remove the player row
        await prisma.gamePlayer.deleteMany({
          where: { gameId, userId }
        });
      }

      console.log(`[GAME SERVICE] User ${userId} left game ${gameId} (${isRated ? 'rated' : 'unrated'})`);
      return true;
    } catch (error) {
      console.error('[GAME SERVICE] Error leaving game:', error);
      throw error;
    }
  }

  /**
   * Sanitize game state for a specific user - only show their own cards
   */
  static sanitizeGameStateForUser(gameState, userId) {
    if (!gameState) return gameState;

    const sanitizedState = JSON.parse(JSON.stringify(gameState));

    const scrubAllHands = () => {
      if (Array.isArray(sanitizedState.hands)) {
        sanitizedState.hands = sanitizedState.hands.map(() => []);
      }
      if (Array.isArray(sanitizedState.playerHands)) {
        sanitizedState.playerHands = sanitizedState.playerHands.map(() => []);
      }
    };

    if (!userId) {
      scrubAllHands();
      return sanitizedState;
    }

    const userPlayer = sanitizedState.players?.find(p => p && p.userId === userId);

    if (!userPlayer || userPlayer.seatIndex === undefined || userPlayer.seatIndex === null || userPlayer.seatIndex < 0) {
      scrubAllHands();
      return sanitizedState;
    }

    const userSeatIndex = userPlayer.seatIndex;

    if (Array.isArray(sanitizedState.hands)) {
      sanitizedState.hands = sanitizedState.hands.map((hand, index) =>
        index === userSeatIndex ? hand || [] : []
      );
    }

    if (Array.isArray(sanitizedState.playerHands)) {
      sanitizedState.playerHands = sanitizedState.playerHands.map((hand, index) =>
        index === userSeatIndex ? hand || [] : []
      );
    }

    // SECRET ASSASSIN: Do not reveal assassin seat to non-assassin players
    try {
      const secretSeat = sanitizedState.play?.secretAssassinSeat ?? sanitizedState.specialRules?.secretAssassinSeat;
      const rule1 = sanitizedState.specialRules?.specialRule1;
      const isAssassin = (rule1 === 'ASSASSIN') || (rule1 === 'SECRET_ASSASSIN' && secretSeat === userSeatIndex);
      if (!isAssassin) {
        if (sanitizedState.play && 'secretAssassinSeat' in sanitizedState.play) {
          delete sanitizedState.play.secretAssassinSeat;
        }
      }
    } catch {}

    return sanitizedState;
  }

  /**
   * Get current trick cards from database
   */
  static async getCurrentTrick(gameId) {
    try {
      // Fetch game to get current round and trick number
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: { currentRound: true, currentTrick: true, rounds: { select: { id: true, roundNumber: true } } }
      });
      if (!game) return [];
      const round = game.rounds.find(r => r.roundNumber === game.currentRound);
      if (!round) return [];

      // Find the trick for the current round/trickNumber
      const trick = await prisma.trick.findFirst({
        where: { roundId: round.id, trickNumber: game.currentTrick || 1 },
        select: { id: true }
      });
      if (!trick) return [];

      const currentTrick = await prisma.trickCard.findMany({
        where: { trickId: trick.id },
        orderBy: { playOrder: 'asc' },
        select: { suit: true, rank: true, seatIndex: true }
      });
      
      return currentTrick;
    } catch (error) {
      console.error('[GAME SERVICE] Error getting current trick:', error);
      return [];
    }
  }

  /**
   * Get FAST game state for client - optimized for table loading
   */
  static async getFastGameStateForClient(gameId, userId = null) {
    try {
      console.log(`[GAME SERVICE] Getting FAST game state for client: ${gameId}, user: ${userId}`);
      
      // Try Redis cache first - this should be instant
      const cachedGameState = await redisGameState.getGameState(gameId);
      if (cachedGameState) {
        console.log(`[GAME SERVICE] Using cached game state for game ${gameId} - INSTANT LOAD`);
        
        // Only get hands data from Redis - no database calls
        const playerHands = await redisGameState.getPlayerHands(gameId);
        if (playerHands && playerHands.length > 0) {
          cachedGameState.hands = playerHands;
        }
        
        // CRITICAL: Get fresh bidding data from database if in bidding phase
        if (cachedGameState.status === 'BIDDING') {
          try {
            const currentRound = await prisma.round.findFirst({
              where: {
                gameId: gameId,
                roundNumber: cachedGameState.currentRound
              },
              include: {
                playerStats: {
                  select: {
                    seatIndex: true,
                    bid: true
                  }
                }
              }
            });
            
            if (currentRound && currentRound.playerStats) {
              const bids = Array.from({length: 4}, () => null);
              currentRound.playerStats.forEach(stat => {
                if (stat.seatIndex !== null && stat.seatIndex !== undefined) {
                  bids[stat.seatIndex] = stat.bid;
                }
              });
              
              cachedGameState.bidding = {
                bids: bids,
                currentBidderIndex: 0,
                currentPlayer: cachedGameState.currentPlayer
              };
              
              // Also update player bids in the players array
              if (cachedGameState.players) {
                cachedGameState.players = cachedGameState.players.map(p => ({
                  ...p,
                  bid: bids[p.seatIndex] || null
                }));
              }
              
              console.log(`[GAME SERVICE] Updated bidding from database:`, {
                gameId,
                bids,
                bidding: cachedGameState.bidding,
                players: cachedGameState.players?.map(p => ({ seatIndex: p.seatIndex, bid: p.bid }))
              });
            }
          } catch (error) {
            console.error(`[GAME SERVICE] Error getting bidding data:`, error);
            // Fallback to existing bidding data if database query fails
          }
        }
        
        return cachedGameState;
      }
      
      // If no cache, fall back to regular getGameStateForClient
      console.log(`[GAME SERVICE] No cache, falling back to regular game state for game ${gameId}`);
      return await this.getGameStateForClient(gameId, userId);
    } catch (error) {
      console.error('[GAME SERVICE] Error getting FAST game state for client:', error);
      return null;
    }
  }

  /**
   * Get game state for client - Redis first, database fallback
   */
  static async getGameStateForClient(gameId, userId = null) {
    try {
      // REAL-TIME: Try to get game state from Redis first (instant)
      let cachedGameState = await redisGameState.getGameState(gameId);
      if (cachedGameState) {
        // CRITICAL FIX: For WAITING games, skip all database queries - just return cached state
        if (cachedGameState.status === 'WAITING') {
          console.log(`[GAME SERVICE] Game ${gameId} is WAITING, returning cached state without database queries`);
          return userId ? this.sanitizeGameStateForUser(cachedGameState, userId) : cachedGameState;
        }
        
        // PERFORMANCE FIX: Only fetch lightweight data from database instead of full state
        const lightweightState = await this.getLightweightGameState(gameId);
        if (!lightweightState) {
          console.log(`[GAME SERVICE] Lightweight query failed for ${gameId}, falling back to full database query`);
          // Fall back to full database query if lightweight fails
          const fullGameState = await this.getFullGameStateFromDatabase(gameId);
          if (!fullGameState) {
            console.log(`[GAME SERVICE] No game found in database for ${gameId}`);
            return null;
          }
          // Use full state instead of cached state and return it immediately
          console.log(`[GAME SERVICE] Using full database state for ${gameId}`);
          return userId ? this.sanitizeGameStateForUser(fullGameState, userId) : fullGameState;
        }
        
        // CRITICAL: Ensure currentPlayer is always from database (single source of truth)
        cachedGameState.currentPlayer = lightweightState.currentPlayer;
        cachedGameState.status = lightweightState.status;
        cachedGameState.currentRound = lightweightState.currentRound;
        cachedGameState.currentTrick = lightweightState.currentTrick;
        
        // CRITICAL: Update Redis cache with corrected currentPlayer to prevent future null issues
        await redisGameState.setGameState(gameId, cachedGameState);
        console.log(`[GAME SERVICE] Updated Redis cache with corrected currentPlayer: ${lightweightState.currentPlayer}`);
        // CRITICAL: Always map gimmick variants to client-friendly format
        const gimmickVariantMapping = {
          'SUICIDE': 'SUICIDE',
          'BID4NIL': '4 OR NIL',
          'BID3': 'BID 3',
          'BIDHEARTS': 'BID HEARTS',
          'CRAZY_ACES': 'CRAZY ACES'
        };
        
        if (cachedGameState.gimmickVariant) {
          cachedGameState.gimmickVariant = gimmickVariantMapping[cachedGameState.gimmickVariant] || cachedGameState.gimmickVariant;
        }
        
        if (cachedGameState.rules?.bidType) {
          cachedGameState.rules.bidType = gimmickVariantMapping[cachedGameState.rules.bidType] || cachedGameState.rules.bidType;
        }
        // CRITICAL: Get current trick data from Redis and add it to the game state
        let currentTrickCards = await redisGameState.getCurrentTrick(gameId);
        if (!currentTrickCards || currentTrickCards.length === 0) {
          // FALLBACK: If Redis doesn't have trick data, get it from database
          currentTrickCards = await this.getCurrentTrick(gameId);
          
          if (currentTrickCards && currentTrickCards.length > 0) {
            // Format cards with playerId
            currentTrickCards = currentTrickCards.map(card => ({
              suit: card.suit,
              rank: card.rank,
              seatIndex: card.seatIndex,
              playerId: cachedGameState.players.find(p => p.seatIndex === card.seatIndex)?.userId
            }));
            // Also store in Redis for future requests
            await redisGameState.setCurrentTrick(gameId, currentTrickCards);
          }
        }
        
        if (currentTrickCards && currentTrickCards.length > 0) {
          cachedGameState.play = cachedGameState.play || {};
          cachedGameState.play.currentTrick = currentTrickCards;
          cachedGameState.currentTrickCards = currentTrickCards;
        } else {
          // No trick data in Redis or database, ensure empty arrays
          cachedGameState.play = cachedGameState.play || {};
          cachedGameState.play.currentTrick = [];
          cachedGameState.currentTrickCards = [];
        }
        
        // CRITICAL: Ensure spadesBroken flag is included from Redis cache
        if (cachedGameState.play && cachedGameState.play.spadesBroken !== undefined) {
          // Found spadesBroken in Redis cache
        } else {
          cachedGameState.play = cachedGameState.play || {};
          cachedGameState.play.spadesBroken = false; // Default to false if not set
        }
        
        // CRITICAL: Get fresh bidding data from database (single source of truth)
        // OPTIMIZATION: Only fetch bidding data if we're in bidding phase
        if (cachedGameState.status === 'BIDDING') {
          try {
            const currentRound = await prisma.round.findFirst({
              where: {
                gameId: gameId,
                roundNumber: cachedGameState.currentRound
              },
              include: {
                playerStats: {
                  select: {
                    seatIndex: true,
                    bid: true
                  }
                }
              }
            });
          
          if (currentRound && currentRound.playerStats) {
            const bids = Array.from({length: 4}, () => null);
            currentRound.playerStats.forEach(stat => {
              if (stat.seatIndex !== null && stat.seatIndex !== undefined) {
                bids[stat.seatIndex] = stat.bid;
              }
            });
            
            cachedGameState.bidding = {
              bids: bids,
              currentBidderIndex: 0,
              currentPlayer: cachedGameState.currentPlayer
            };
            
            // Also update player bids in the players array
            if (cachedGameState.players) {
              cachedGameState.players = cachedGameState.players.map(p => ({
                ...p,
                bid: bids[p.seatIndex] || null
              }));
            }
            
            console.log(`[GAME SERVICE] Updated bidding from database:`, {
              gameId,
              bids,
              bidding: cachedGameState.bidding,
              players: cachedGameState.players?.map(p => ({ seatIndex: p.seatIndex, bid: p.bid }))
            });
          }
          } catch (error) {
            console.error(`[GAME SERVICE] Error getting bidding data:`, error);
            // Fallback to existing bidding data if database query fails
          }
        }
        
        // CRITICAL: Ensure hands data is included from Redis
        const playerHands = await redisGameState.getPlayerHands(gameId);
        if (playerHands && playerHands.length > 0) {
          cachedGameState.hands = playerHands;
          cachedGameState.playerHands = playerHands; // Also set playerHands field
          console.log(`[GAME SERVICE] Updated hands from Redis:`, playerHands.map((hand, i) => `Seat ${i}: ${hand.length} cards`));
        }
        
        // Use cached data as-is for performance - no database refresh needed
        console.log(`[GAME SERVICE] Using cached game state for ${gameId} - no database refresh`);
        
        // CRITICAL: Ensure players data is included from database if not in cache
        if (!cachedGameState.players || cachedGameState.players.length === 0) {
          const dbPlayers = await prisma.gamePlayer.findMany({
            where: { gameId },
            include: { user: true }
          });
          if (dbPlayers && dbPlayers.length > 0) {
            cachedGameState.players = dbPlayers.map(p => ({
              id: p.id,
              userId: p.userId,
              username: p.user?.username,
              avatarUrl: p.user?.avatarUrl,
              seatIndex: p.seatIndex,
              teamIndex: p.teamIndex,
              isHuman: p.isHuman,
              isSpectator: p.isSpectator,
              type: p.isHuman ? 'human' : 'bot',
              bid: null,
              tricks: 0
            }));
          }
        }
        
        // Returning cached state from Redis
        // CRITICAL: Sanitize game state to only show user's own cards
        return userId ? this.sanitizeGameStateForUser(cachedGameState, userId) : cachedGameState;
      }

      // FALLBACK: Use database state directly
      console.log(`[GAME SERVICE] Redis miss for game ${gameId} - using database state`);
      const fullGameState = await this.getFullGameStateFromDatabase(gameId);
      if (fullGameState) {
        console.log(`[GAME SERVICE] Found game ${gameId} in database, status: ${fullGameState.status}`);
        // CRITICAL: Get current trick data from Redis and add it to the game state
        const currentTrickCards = await redisGameState.getCurrentTrick(gameId);
        if (currentTrickCards && currentTrickCards.length > 0) {
          fullGameState.play = fullGameState.play || {};
          fullGameState.play.currentTrick = currentTrickCards;
          fullGameState.currentTrickCards = currentTrickCards;
        }
        
        // CRITICAL: Get bidding data from database (single source of truth)
        const currentRound = fullGameState.rounds.find(r => r.roundNumber === fullGameState.currentRound);
        if (currentRound && currentRound.playerStats) {
          const bids = Array.from({length: 4}, () => null);
          currentRound.playerStats.forEach(stat => {
            if (stat.seatIndex !== null && stat.seatIndex !== undefined) {
              bids[stat.seatIndex] = stat.bid;
            }
          });
          
          fullGameState.bidding = {
            bids: bids,
            currentBidderIndex: 0,
            currentPlayer: fullGameState.currentPlayer
          };
          
          // Also update player bids in the players array
          if (fullGameState.players) {
            fullGameState.players = fullGameState.players.map(p => ({
              ...p,
              bid: bids[p.seatIndex] || null
            }));
          }
          
          console.log(`[GAME SERVICE] Database bidding data - bids:`, bids);
        }
        
        // Cache the full state in Redis for future requests
        await redisGameState.setGameState(gameId, fullGameState);
        console.log(`[GAME SERVICE] Cached full game state in Redis for game ${gameId} with currentPlayer: ${fullGameState.currentPlayer}`);
        // CRITICAL: Sanitize game state to only show user's own cards
        return userId ? this.sanitizeGameStateForUser(fullGameState, userId) : fullGameState;
      }

      // Last resort: return null to trigger proper error handling
      console.log(`[GAME SERVICE] No game found for ${gameId} - returning null to trigger error handling`);
      return null;
    } catch (error) {
      console.error('[GAME SERVICE] Error getting game state for client:', error);
      throw error;
    }
  }

  /**
   * Get lightweight game state with only essential fields (for performance)
   */
  static async getLightweightGameState(gameId) {
    try {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: {
          id: true,
          currentPlayer: true,
          status: true,
          currentRound: true,
          currentTrick: true
        }
      });
      return game;
    } catch (error) {
      console.error('[GAME SERVICE] Error getting lightweight game state:', error);
      return null;
    }
  }

  /**
   * Get FULL game state from database only (for populating Redis cache)
   * OPTIMIZED: Reduced database queries and improved performance
   */
  static async getFullGameStateFromDatabase(gameId) {
    try {
      // OPTIMIZED: Use single query with all includes to avoid N+1 problem
      const game = await PerformanceMiddleware.timeOperation('getFullGameStateFromDatabase', () => 
        prisma.game.findUnique({
          where: { id: gameId },
          include: {
            players: {
              include: {
                user: {
                  select: { id: true, username: true, avatarUrl: true }
                }
              },
              orderBy: { seatIndex: 'asc' }
            },
            rounds: {
              include: {
                tricks: {
                  include: {
                    cards: {
                      orderBy: { playOrder: 'asc' }
                    }
                  },
                  orderBy: { trickNumber: 'asc' }
                },
                playerStats: {
                  orderBy: { seatIndex: 'asc' }
                },
                RoundScore: true
              },
              orderBy: { roundNumber: 'asc' }
            },
            result: true
          }
        })
      );
      
      if (!game) {
        return null;
      }

      // CRITICAL: Get player hands from Redis or database - ensure consistency
      let playerHands = await redisGameState.getPlayerHands(gameId);
      if (!playerHands || !playerHands.some(hand => hand && hand.length > 0)) {
        console.log(`[GAME SERVICE] No valid hands in Redis, calculating from database`);
        // If no hands in Redis, calculate from database
        // CONSOLIDATED: Using GameService directly instead of DatabaseGameEngine
        playerHands = this.computePlayerHands(game);
        
        // Store the calculated hands in Redis for consistency
        if (playerHands && playerHands.some(hand => hand && hand.length > 0)) {
          await redisGameState.setPlayerHands(gameId, playerHands);
          console.log(`[GAME SERVICE] Stored calculated hands in Redis for consistency`);
        }
      } else {
        console.log(`[GAME SERVICE] Using hands from Redis cache for consistency:`, {
          handsLengths: playerHands.map((hand, i) => `Seat ${i}: ${hand.length} cards`)
        });
      }

      // OPTIMIZED: Get current trick from Redis or use data already loaded
      let currentTrickCards = await redisGameState.getCurrentTrick(gameId);
      if (!currentTrickCards || currentTrickCards.length === 0) {
        // OPTIMIZED: Use data already loaded instead of additional database queries
        const currentRound = game.rounds.find(r => r.roundNumber === game.currentRound);
        if (currentRound && currentRound.tricks) {
          const currentTrick = currentRound.tricks.find(t => t.trickNumber === game.currentTrick);
          if (currentTrick && currentTrick.cards) {
            currentTrickCards = currentTrick.cards.map(card => ({
              suit: card.suit,
              rank: card.rank,
              seatIndex: card.seatIndex,
              playerId: game.players.find(p => p.seatIndex === card.seatIndex)?.userId
            }));
          } else {
            currentTrickCards = [];
          }
        } else {
          currentTrickCards = [];
        }
      }

      // Get spadesBroken flag and secretAssassinSeat from Redis cache
      let spadesBroken = false;
      let secretAssassinSeat = null;
      try {
        const cachedGameState = await redisGameState.getGameState(gameId);
        if (cachedGameState && cachedGameState.play) {
          if (cachedGameState.play.spadesBroken !== undefined) {
            spadesBroken = cachedGameState.play.spadesBroken;
            console.log(`[GAME SERVICE] Retrieved spadesBroken from Redis cache:`, spadesBroken);
          }
          if (cachedGameState.play.secretAssassinSeat !== undefined) {
            secretAssassinSeat = cachedGameState.play.secretAssassinSeat;
            console.log(`[GAME SERVICE] Retrieved secretAssassinSeat from Redis cache:`, secretAssassinSeat);
          }
        }
      } catch (error) {
        console.error('[GAME SERVICE] Error getting game state from Redis:', error);
      }

      // Get player bids from Redis or database
      let playerBids = await redisGameState.getPlayerBids(gameId);
      
      // Get player stats (tricks won) and bids from database
      let playerStats = [];
      if (game.currentRound > 0) {
        const currentRound = game.rounds.find(r => r.roundNumber === game.currentRound);
        if (currentRound) {
          playerStats = await prisma.playerRoundStats.findMany({
            where: { roundId: currentRound.id },
            orderBy: { seatIndex: 'asc' }
          });
          
          console.log(`[GAME SERVICE] Retrieved player stats for round ${currentRound.id}:`, 
            playerStats.map(stat => `Seat ${stat.seatIndex}: ${stat.tricksWon} tricks won`));
          
          // CRITICAL FIX: If Redis doesn't have bids, try to get them from PlayerRoundStats
          if (!playerBids || playerBids.every(b => b === null || b === undefined)) {
            playerBids = Array.from({length: 4}, () => null);
            playerStats.forEach(stat => {
              if (stat.bid !== null && stat.bid !== undefined) {
                playerBids[stat.seatIndex] = stat.bid;
              }
            });
            console.log(`[GAME SERVICE] Restored bids from PlayerRoundStats:`, playerBids);
          }
        }
      }
      
      // Final fallback: if still no bids, use empty array
      if (!playerBids) {
        playerBids = Array.from({length: 4}, () => null);
      }

      // Get running totals from the latest RoundScore
      let team1TotalScore = 0;
      let team2TotalScore = 0;
      let team1Bags = 0;
      let team2Bags = 0;
      
      const latestRoundScore = await prisma.roundScore.findFirst({
        where: { 
          Round: { gameId }
        },
        orderBy: { Round: { roundNumber: 'desc' } }
      });
      
      if (latestRoundScore) {
        // CRITICAL FIX: team0RunningTotal and team1RunningTotal already include bag penalties
        // from ScoringService.calculatePartnersScores, so we should NOT recalculate or subtract again
        team1TotalScore = latestRoundScore.team0RunningTotal || 0; // team0 becomes team1 in client
        team2TotalScore = latestRoundScore.team1RunningTotal || 0; // team1 becomes team2 in client
        team1Bags = latestRoundScore.team0Bags || 0;
        team2Bags = latestRoundScore.team1Bags || 0;
      }
      
      // Calculate total accumulated bags across all rounds (for display purposes only)
      // Bag penalties are already included in team0RunningTotal/team1RunningTotal from ScoringService
      const allRoundScores = await prisma.roundScore.findMany({
        where: { 
          Round: { gameId }
        },
        include: { Round: true },
        orderBy: { Round: { roundNumber: 'asc' } }
      });
      
      let accumulatedTeam1Bags = 0;
      let accumulatedTeam2Bags = 0;
      
      // Calculate accumulated bags for display (penalties already applied in running totals)
      for (const roundScore of allRoundScores) {
        accumulatedTeam1Bags += roundScore.team0Bags || 0;
        accumulatedTeam2Bags += roundScore.team1Bags || 0;
        
        // Apply bag penalties when reaching 10+ bags (for bag count reset only)
        if (accumulatedTeam1Bags >= 10) {
          accumulatedTeam1Bags = accumulatedTeam1Bags % 10; // Reset bags after penalty
        }
        if (accumulatedTeam2Bags >= 10) {
          accumulatedTeam2Bags = accumulatedTeam2Bags % 10; // Reset bags after penalty
        }
      }
      
      // Use accumulated bags for display (current remainder after all penalties)
      team1Bags = accumulatedTeam1Bags;
      team2Bags = accumulatedTeam2Bags;
      
      // DO NOT subtract penalties again - they're already in team0RunningTotal/team1RunningTotal

      // Map database enum values back to client-friendly format
      const gimmickVariantMapping = {
        'SUICIDE': 'SUICIDE',
        'BID4NIL': '4 OR NIL',
        'BID3': 'BID 3',
        'BIDHEARTS': 'BID HEARTS',
        'CRAZY_ACES': 'CRAZY ACES'
      };
      
      // CRITICAL: Build players array with nulls for empty seats (client expects 4-element array)
      const playersArray = [null, null, null, null];
      const spectatorsArray = [];
      
      game.players.forEach(player => {
        const playerStat = playerStats.find(stat => stat.seatIndex === player.seatIndex);
        const tricksWon = playerStat?.tricksWon || 0;
        console.log(`[GAME SERVICE] Player ${player.seatIndex} (${player.user?.username}): tricks=${tricksWon}, stat=${playerStat ? 'found' : 'not found'}`);
        const playerData = {
          id: player.userId,
          userId: player.userId, // CRITICAL: Add userId field for player lookups
          username: player.user?.username || 'Unknown',
          avatarUrl: player.user?.avatarUrl || null,
          seatIndex: player.seatIndex,
          teamIndex: player.teamIndex,
          isHuman: player.isHuman,
          isSpectator: player.isSpectator || false,
          type: player.isHuman ? 'human' : 'bot',
          bid: playerBids[player.seatIndex] || null,
          tricks: tricksWon,
          isBlindNil: playerStat?.isBlindNil || false, // Include blind nil information
          // CRITICAL: Ensure user object is included for client
          user: player.user ? {
            id: player.user.id,
            username: player.user.username,
            avatarUrl: player.user.avatarUrl
          } : null
        };
        
        if (player.isSpectator) {
          spectatorsArray.push(playerData);
        } else {
          playersArray[player.seatIndex] = playerData;
        }
      });

      // Format for client
      const gameState = {
        id: game.id,
        createdById: game.createdById, // CRITICAL: Add createdById for creator checks
        status: game.status,
        mode: game.mode,
        format: game.format,
        gimmickVariant: gimmickVariantMapping[game.gimmickVariant] || game.gimmickVariant,
        buyIn: game.buyIn,
        minPoints: game.minPoints,
        maxPoints: game.maxPoints,
        nilAllowed: game.nilAllowed,
        blindNilAllowed: game.blindNilAllowed,
        specialRules: {
          ...game.specialRules,
          secretAssassinSeat: game.specialRules?.secretAssassinSeat
        },
        isLeague: game.isLeague,
        isRated: game.isRated,
        currentPlayer: game.currentPlayer,
        currentRound: game.currentRound,
        currentTrick: game.currentTrick,
        dealer: game.dealer,
        players: playersArray,
        spectators: spectatorsArray,
        rounds: game.rounds || [],
        hands: playerHands, // Frontend expects 'hands', not 'playerHands'
        playerHands: playerHands, // Keep both for compatibility
        currentTrickCards: currentTrickCards,
        playerBids: playerBids,
        play: {
          currentTrick: currentTrickCards,
          spadesBroken: spadesBroken,
          secretAssassinSeat: secretAssassinSeat || game.specialRules?.secretAssassinSeat,
          // CRITICAL: Build completedTricks array from current round's completed tricks
          completedTricks: (() => {
            const currentRound = game.rounds.find(r => r.roundNumber === game.currentRound);
            if (!currentRound || !currentRound.tricks) return [];
            // Get all completed tricks (tricks with 4 cards) from current round
            return currentRound.tricks
              .filter(trick => trick.cards && trick.cards.length === 4)
              .map(trick => ({
                cards: trick.cards.map(card => ({
                  suit: card.suit,
                  rank: card.rank,
                  seatIndex: card.seatIndex,
                  playerId: game.players.find(p => p.seatIndex === card.seatIndex)?.userId
                })),
                winningSeatIndex: trick.winningSeatIndex,
                trickNumber: trick.trickNumber
              }));
          })()
        },
        bidding: {
          bids: playerBids,
          currentBidderIndex: game.players.findIndex(p => p.userId === game.currentPlayer) || 0,
          currentPlayer: game.currentPlayer
        },
        isGameComplete: game.status === 'FINISHED',
        // Include running totals for scoreboard
        team1TotalScore: team1TotalScore,
        team2TotalScore: team2TotalScore,
        team1Bags: team1Bags,
        team2Bags: team2Bags,
        // Solo game scoring
        gameMode: game.mode,
        playerScores: game.mode === 'SOLO' ? await this.getPlayerScores(gameId) : [],
        playerBags: game.mode === 'SOLO' ? await this.getPlayerBags(gameId) : [],
        // Include rules object for client compatibility
        rules: game.gameState?.rules || {
          gameType: game.mode === 'SOLO' ? 'SOLO' : 'PARTNERS',
          allowNil: game.nilAllowed,
          allowBlindNil: game.blindNilAllowed,
          coinAmount: game.buyIn,
          maxPoints: game.maxPoints,
          minPoints: game.minPoints,
          bidType: gimmickVariantMapping[game.gimmickVariant] || game.gimmickVariant,
          specialRules: game.specialRules || {}
        }
      };

      return gameState;
    } catch (error) {
      console.error('[GAME SERVICE] Error getting full game state from database:', error);
      return null;
    }
  }

  /**
   * Get player scores for solo games
   */
  static async getPlayerScores(gameId) {
    try {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: { rounds: { include: { RoundScore: true } } }
      });
      
      if (!game || game.mode !== 'SOLO') return [];
      
      // Get the latest round score which has running totals
      const lastRound = game.rounds[game.rounds.length - 1];
      if (lastRound && lastRound.RoundScore) {
        return [
          lastRound.RoundScore.player0Running || 0,
          lastRound.RoundScore.player1Running || 0,
          lastRound.RoundScore.player2Running || 0,
          lastRound.RoundScore.player3Running || 0
        ];
      }
      
      return [0, 0, 0, 0];
    } catch (error) {
      console.error('[GAME SERVICE] Error getting player scores:', error);
      return [0, 0, 0, 0];
    }
  }

  /**
   * Get player bags for solo games
   */
  static async getPlayerBags(gameId) {
    try {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: { rounds: { include: { playerStats: true } } }
      });
      
      if (!game || game.mode !== 'SOLO') return [];
      
      const playerBags = [0, 0, 0, 0];
      
      // Sum up all bags from all rounds, applying solo bag resets (every 5 bags -> reset to 0)
      // Note: ScoringService applies -50 at 5 bags; the UI should show remaining bags after resets
      game.rounds.forEach(round => {
        round.playerStats.forEach(stats => {
          if (stats.seatIndex >= 0 && stats.seatIndex < 4) {
            const bagsThisRound = stats.bagsThisRound || 0;
            playerBags[stats.seatIndex] += bagsThisRound;
            if (playerBags[stats.seatIndex] >= 5) {
              // Handle multiple penalties (e.g., 10 bags across many rounds)
              playerBags[stats.seatIndex] = playerBags[stats.seatIndex] % 5;
            }
          }
        });
      });
      
      return playerBags;
    } catch (error) {
      console.error('[GAME SERVICE] Error getting player bags:', error);
      return [0, 0, 0, 0];
    }
  }

  static async dealInitialHands(gameId) {
    try {
      console.log(`[GAME SERVICE] Dealing initial hands for game ${gameId}`);

      // Load game, players, and current round
      const game = await this.getGame(gameId);
      if (!game) throw new Error('Game not found');

      const round = game.rounds.find(r => r.roundNumber === game.currentRound);
      if (!round) throw new Error('Current round not found');

      // Build seatIndex -> userId map
      const seatToUserId = Array.from({length: 4}, () => null);
      game.players.forEach(p => { seatToUserId[p.seatIndex] = p.userId; });
      
      console.log(`[GAME SERVICE] Deal hands - seatToUserId mapping:`, seatToUserId);
      console.log(`[GAME SERVICE] Deal hands - game.players:`, game.players.map(p => ({
        seatIndex: p.seatIndex,
        userId: p.userId,
        isHuman: p.isHuman
      })));

      // Create and shuffle a standard 52-card deck
      const suits = ['HEARTS', 'DIAMONDS', 'CLUBS', 'SPADES'];
      const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
      const deck = [];
      for (const s of suits) {
        for (const r of ranks) deck.push({ suit: s, rank: r });
      }
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }

      // Deal 13 cards to each seat in order
      const hands = [[], [], [], []];
      for (let i = 0; i < 52; i++) {
        const seatIndex = i % 4;
        hands[seatIndex].push(deck[i]);
      }
      
      console.log(`[GAME SERVICE] Deal hands - Created hands:`, {
        deckLength: deck.length,
        handsLengths: hands.map((hand, i) => `Seat ${i}: ${hand.length} cards`),
        sampleCards: hands[0].slice(0, 3) // Show first 3 cards of seat 0
      });

      // Assign Secret Assassin on deal (Ace of Spades holder)
      try {
        const rule1 = game.specialRules?.specialRule1 || game.specialRule1 || 'NONE';
        console.log(`[GAME SERVICE] Secret Assassin Check - rule1: ${rule1}, specialRule1: ${game.specialRule1}, specialRules:`, game.specialRules);
        if (rule1 === 'SECRET_ASSASSIN') {
          console.log(`[GAME SERVICE] SECRET_ASSASSIN detected, looking for Ace of Spades...`);
          let secretAssassinSeat = null;
          for (let s = 0; s < 4; s++) {
            if (hands[s].some(c => c.suit === 'SPADES' && c.rank === 'A')) {
              secretAssassinSeat = s;
              break;
            }
          }
          if (secretAssassinSeat !== null) {
            const mergedSpecial = { ...(game.specialRules || {}), specialRule1: 'SECRET_ASSASSIN', secretAssassinSeat };
            await prisma.game.update({ where: { id: gameId }, data: { specialRules: mergedSpecial } });
            try {
              const gs = await redisGameState.getGameState(gameId);
              if (gs) {
                gs.play = gs.play || {};
                gs.play.secretAssassinSeat = secretAssassinSeat;
                gs.specialRules = gs.specialRules || {};
                gs.specialRules.secretAssassinSeat = secretAssassinSeat;
                await redisGameState.setGameState(gameId, gs);
              }
              console.log(`[GAME SERVICE] Secret Assassin set to seat ${secretAssassinSeat}`);
            } catch (e) {
              console.warn('[GAME SERVICE] Could not cache secretAssassinSeat:', e?.message || e);
            }
          }
        }
      } catch (e) {
        console.warn('[GAME SERVICE] Secret Assassin assignment error:', e?.message || e);
      }

        // Set current bidder to dealer+1 (wrap 0..3) and clear currentTrick for bidding phase
        const dealerSeatIndex = game.dealer ?? 0;
        const bidderSeat = (dealerSeatIndex + 1) % 4;
        const currentPlayer = seatToUserId[bidderSeat] || null;
        
        console.log(`[GAME SERVICE] Deal hands - Setting currentPlayer:`, {
          gameDealer: game.dealer,
          dealerSeatIndex,
          bidderSeat,
          currentPlayer,
          seatToUserId,
          bidderSeatUserId: seatToUserId[bidderSeat]
        });

        // Persist RoundHandSnapshot and PlayerRoundStats for each occupied seat
        await prisma.$transaction(async (tx) => {
        for (let seatIndex = 0; seatIndex < 4; seatIndex++) {
          const userId = seatToUserId[seatIndex];
          const cards = hands[seatIndex];

          // Save snapshot (always save per seat; UI hides empty seats via players list)
          await tx.roundHandSnapshot.create({
            data: {
              roundId: round.id,
              seatIndex,
              cards
            }
          });

          // Ensure player stats row exists for the round when a user is seated
          if (userId) {
            await tx.playerRoundStats.upsert({
              where: {
                roundId_userId: { roundId: round.id, userId }
              },
              update: {},
              create: {
                seatIndex,
                teamIndex: seatIndex % 2,
                bid: null,
                isBlindNil: false,
                tricksWon: 0,
                bagsThisRound: 0,
                madeNil: false,
                madeBlindNil: false,
                round: { connect: { id: round.id } },
                user: { connect: { id: userId } }
              }
            });
          }
        }

        // EMERGENCY: Removed excessive logging for performance

        await tx.game.update({
          where: { id: gameId },
          data: {
            currentPlayer,
            currentTrick: 0,
            status: 'BIDDING',
            updatedAt: new Date()
          }
        });
      }, {
        timeout: 10000, // Increase timeout to 10 seconds
        isolationLevel: 'ReadCommitted'
      });

      console.log(`[GAME SERVICE] Deal hands - Database updated with currentPlayer: ${currentPlayer}`);

      // REAL-TIME: Cache hands in Redis for instant access FIRST
      console.log(`[GAME SERVICE] Deal hands - Storing hands in Redis:`, {
        handsLengths: hands.map((hand, i) => `Seat ${i}: ${hand.length} cards`),
        handsData: hands
      });
      await redisGameState.setPlayerHands(gameId, hands);
      
      // Initialize empty bids array in Redis for new round
      // CRITICAL FIX: Use Array.from to create separate null values for each player
      await redisGameState.setPlayerBids(gameId, Array.from({length: 4}, () => null));

      // CRITICAL: Update Redis cache with full game state AFTER hands are stored
      const fullGameState = await this.getFullGameStateFromDatabase(gameId);
      if (fullGameState) {
        await redisGameState.setGameState(gameId, fullGameState);
        console.log(`[GAME SERVICE] Updated Redis cache with full game state after dealing hands`);
      }
      
      // ASYNC: Sync hands to database (non-blocking)
      await redisGameState.syncHandsToDatabase(gameId, round.id, hands);

      // NUCLEAR: No logging for performance
      return true;
    } catch (error) {
      console.error('[GAME SERVICE] Error dealing initial hands:', error);
      console.error('[GAME SERVICE] Error stack:', error.stack);
      throw error;
    }
  }

  /**
   * Mark a player as disconnected in the database
   * @param {string} gameId - The game ID
   * @param {string} userId - The user ID
   */
  static async markPlayerDisconnected(gameId, userId) {
    try {
      await prisma.gamePlayer.updateMany({
        where: { gameId, userId },
        data: { 
          leftAt: new Date(),
          // Don't remove them completely - keep them in the game for reconnection
        }
      });
      console.log(`[GAME SERVICE] Marked player ${userId} as disconnected in game ${gameId}`);
    } catch (error) {
      console.error('[GAME SERVICE] Error marking player as disconnected:', error);
      throw error;
    }
  }

  /**
   * Mark a player as reconnected in the database
   * @param {string} gameId - The game ID
   * @param {string} userId - The user ID
   */
  static async markPlayerReconnected(gameId, userId) {
    try {
      await prisma.gamePlayer.updateMany({
        where: { gameId, userId },
        data: { 
          leftAt: null // Remove the disconnect timestamp
        }
      });
      console.log(`[GAME SERVICE] Marked player ${userId} as reconnected in game ${gameId}`);
    } catch (error) {
      console.error('[GAME SERVICE] Error marking player as reconnected:', error);
      throw error;
    }
  }

  /**
   * Get a player in a specific game
   * @param {string} gameId - The game ID
   * @param {string} userId - The user ID
   */
  static async getPlayerInGame(gameId, userId) {
    try {
      const player = await prisma.gamePlayer.findFirst({
        where: { gameId, userId },
        include: { user: true }
      });
      return player;
    } catch (error) {
      console.error('[GAME SERVICE] Error getting player in game:', error);
      return null;
    }
  }

  /**
   * Rotate dealer to next player
   * @param {string} gameId - The game ID
   */
  static async rotateDealer(gameId) {
    try {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: { players: true }
      });

      if (!game || !game.players || game.players.length === 0) {
        console.log(`[GAME SERVICE] Cannot rotate dealer - no players found for game ${gameId}`);
        return;
      }

      // Find current dealer
      const currentDealer = game.players.find(p => p.seatIndex === game.dealer);
      if (!currentDealer) {
        console.log(`[GAME SERVICE] Current dealer not found, setting dealer to seat 0`);
        await prisma.game.update({
          where: { id: gameId },
          data: { dealer: 0 }
        });
        return;
      }

      // Rotate to next seat (0->1->2->3->0)
      const nextDealer = (currentDealer.seatIndex + 1) % 4;
      
      await prisma.game.update({
        where: { id: gameId },
        data: { dealer: nextDealer }
      });

      console.log(`[GAME SERVICE] Rotated dealer from seat ${currentDealer.seatIndex} to seat ${nextDealer} for game ${gameId}`);
    } catch (error) {
      console.error('[GAME SERVICE] Error rotating dealer:', error);
      throw error;
    }
  }

  /**
   * Compute player hands from game data
   */
  static computePlayerHands(game) {
    if (!game || !game.rounds || game.rounds.length === 0) {
      return [];
    }

    const currentRound = game.rounds[game.rounds.length - 1];
    if (!currentRound || !currentRound.playerStats) {
      return [];
    }

    // Calculate hands based on dealt cards minus played cards
    const playerHands = [];
    for (let seatIndex = 0; seatIndex < 4; seatIndex++) {
      const playerStat = currentRound.playerStats.find(ps => ps.seatIndex === seatIndex);
      if (playerStat) {
        const dealtCards = playerStat.dealtCards || [];
        const playedCards = currentRound.tricks?.flatMap(trick => 
          trick.cards?.filter(card => card.seatIndex === seatIndex) || []
        ) || [];
        
        const remainingCards = dealtCards.filter(dealtCard => 
          !playedCards.some(playedCard => 
            playedCard.suit === dealtCard.suit && playedCard.rank === dealtCard.rank
          )
        );
        
        playerHands[seatIndex] = remainingCards;
      } else {
        playerHands[seatIndex] = [];
      }
    }

    return playerHands;
  }
}
