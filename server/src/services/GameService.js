import { prisma } from '../config/database.js';
import redisGameState from './RedisGameStateService.js';
import { ScoringService } from './ScoringService.js';

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
      
      const dbGame = await prisma.game.create({
        data: {
          id: gameData.id,
          createdById: gameData.createdById,
          mode: gameData.mode,
          format: gameData.format,
          gimmickVariant: gameData.gimmickVariant,
          isLeague: gameData.isLeague || false,
          isRated: gameData.isRated || false,
          maxPoints: gameData.maxPoints,
          minPoints: gameData.minPoints,
          buyIn: gameData.buyIn,
          nilAllowed: gameData.nilAllowed !== false,
          blindNilAllowed: gameData.blindNilAllowed || false,
          specialRules: gameData.specialRules,
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
      
      // Return the database game object (no in-memory Game object)
      return dbGame;
    } catch (error) {
      console.error('[GAME SERVICE] Error creating game:', error);
      throw error;
    }
  }

  // Get complete game state from database (single source of truth)
  static async getGame(gameId) {
    try {
      // Get main game record
      const game = await prisma.game.findUnique({
        where: { id: gameId }
      });

      if (!game) {
        return null;
      }

      // Get players separately
      const players = await prisma.gamePlayer.findMany({
        where: { gameId },
        orderBy: { seatIndex: 'asc' }
      });

      // Get user info for each player
      const playersWithUsers = await Promise.all(
        players.map(async (player) => {
          const user = await prisma.user.findUnique({
            where: { id: player.userId },
            select: { id: true, username: true, avatarUrl: true }
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
          const [tricks, playerStats] = await Promise.all([
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
      console.error('[GAME SERVICE] Error getting game:', error);
      throw error;
    }
  }

  // Update game in database
  static async updateGame(gameId, updates) {
    try {
      console.log(`[GAME SERVICE] updateGame called for ${gameId}:`, {
        updateKeys: Object.keys(updates)
      });
      
      const result = await prisma.game.update({
        where: { id: gameId },
        data: {
          ...updates,
          updatedAt: new Date()
        }
      });

      console.log(`[GAME SERVICE] Game updated successfully:`, result.id);
      return result;
    } catch (error) {
      console.error('[GAME SERVICE] Error updating game:', error);
      throw error;
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
        await prisma.trickCard.deleteMany({ where: { trickId: { in: trickIds } } });
      }
      if (roundIds.length > 0) {
        await prisma.trick.deleteMany({ where: { roundId: { in: roundIds } } });
        await prisma.roundBid.deleteMany({ where: { roundId: { in: roundIds } } });
        await prisma.roundHandSnapshot.deleteMany({ where: { roundId: { in: roundIds } } });
        await prisma.roundScore.deleteMany({ where: { roundId: { in: roundIds } } });
        await prisma.playerRoundStats.deleteMany({ where: { roundId: { in: roundIds } } });
        await prisma.round.deleteMany({ where: { id: { in: roundIds } } });
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

        // Find available seat
        if (seatIndex === null) {
          const takenSeats = existingPlayers.map(p => p.seatIndex);
          seatIndex = 0;
          while (takenSeats.includes(seatIndex) && seatIndex < 4) {
            seatIndex++;
          }
        }

        if (seatIndex >= 4) {
          throw new Error('Game is full');
        }

        // Check if user already in game
        const existingPlayer = existingPlayers.find(p => p.userId === userId);
        if (existingPlayer) {
          throw new Error('User already in game');
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
      return transaction;
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
   * Get game state for client - database only
   */
  static async getGameStateForClient(gameId) {
    try {
      // REAL-TIME: Try to get game state from Redis first (instant)
      let cachedGameState = await redisGameState.getGameState(gameId);
      if (cachedGameState) {
        console.log(`[GAME SERVICE] Returning cached state from Redis for game ${gameId}`);
        return cachedGameState;
      }

      // Fallback to database if Redis miss
      console.log(`[GAME SERVICE] Redis miss, fetching from database for game ${gameId}`);
      const game = await this.getGame(gameId);
      if (!game) {
        return null;
      }

      // Get current round data
      const currentRound = game.rounds.find(r => r.roundNumber === game.currentRound);
      
      // Get player hands from hand snapshots
      // NUCLEAR: Skip hand snapshots for maximum speed - use empty hands
      const handSnapshots = [];

      // Get player stats from database for bidding display
      let playerStats = [];
      if (currentRound) {
        playerStats = await prisma.playerRoundStats.findMany({
          where: { roundId: currentRound.id }
        });
      }

      // REAL-TIME: Get bids from Redis first, then update playerStats with Redis data
      const redisBids = await redisGameState.getPlayerBids(gameId);
      console.log(`🔥🔥🔥 [GAME SERVICE] CRITICAL DEBUG - Redis bids for game ${gameId}:`, redisBids);
      if (redisBids) {
        console.log(`[GAME SERVICE] Using Redis bids for game ${gameId}:`, redisBids);
        // Update playerStats with Redis bid data
        playerStats.forEach(stats => {
          if (redisBids[stats.seatIndex] !== null && redisBids[stats.seatIndex] !== undefined) {
            stats.bid = redisBids[stats.seatIndex];
          }
        });
      } else {
        console.log(`[GAME SERVICE] No Redis bids found for game ${gameId}, using database only`);
      }

        // Get current trick cards from database
        let currentTrickCards = [];
        if (currentRound) {
          console.log(`[GAME SERVICE] Fetching current trick cards for round ${currentRound.id}, trick ${game.currentTrick || 1}`);
          
          const currentTrick = await prisma.trick.findFirst({
            where: {
              roundId: currentRound.id,
              trickNumber: game.currentTrick || 1
            },
            include: {
              cards: {
                select: { seatIndex: true, suit: true, rank: true, playOrder: true },
                orderBy: { playOrder: 'asc' }
              }
            }
          });
          
          console.log(`[GAME SERVICE] Current trick query result:`, currentTrick ? {
            id: currentTrick.id,
            trickNumber: currentTrick.trickNumber,
            cardsCount: currentTrick.cards?.length || 0,
            cards: currentTrick.cards
          } : 'No trick found');
          
          if (currentTrick && currentTrick.cards) {
            currentTrickCards = currentTrick.cards;
            console.log(`[GAME SERVICE] Loaded ${currentTrickCards.length} cards for current trick`);
          }
        }

      // REAL-TIME: Get hands from Redis first (instant)
      let hands = await redisGameState.getPlayerHands(gameId);
      
      // Fallback to database if Redis miss
      if (!hands) {
        console.log(`[GAME SERVICE] Redis miss for hands, fetching from database for game ${gameId}`);
        hands = new Array(4).fill([]);
        handSnapshots.forEach(snapshot => {
          if (snapshot.seatIndex >= 0 && snapshot.seatIndex < 4) {
            hands[snapshot.seatIndex] = snapshot.cards || [];
          }
        });
      } else {
        console.log(`[GAME SERVICE] Using hands from Redis for game ${gameId}`);
        console.log(`[GAME SERVICE] Redis hands:`, hands.map((hand, i) => `Seat ${i}: ${hand.length} cards`));
        console.log(`[GAME SERVICE] Redis hands data:`, hands);
      }
      
      // EMERGENCY: Removed excessive logging for performance

      // Build players with stats
      const players = game.players.map((p, index) => {
        const stats = playerStats.find(s => s.seatIndex === p.seatIndex);
        const playerData = {
          id: p.userId,
          username: p.user?.username || 'Player',
          avatarUrl: p.user?.avatarUrl || null,
          seatIndex: p.seatIndex,
          team: p.teamIndex,
          type: p.isHuman ? 'human' : 'bot',
          connected: !p.leftAt,
          hand: hands[p.seatIndex] || [],
          bid: stats?.bid || null,
          tricks: stats?.tricksWon || 0,
          bags: stats?.bagsThisRound || 0,
          nil: stats?.madeNil || false,
          blindNil: stats?.madeBlindNil || false
        };
        console.log(`[GAME SERVICE] Built player for seat ${p.seatIndex}:`, {
          seatIndex: p.seatIndex,
          userId: p.userId,
          username: p.user?.username,
          isHuman: p.isHuman,
          type: playerData.type
        });
        return playerData;
      });

      // Build bidding state - use Redis bids if available, otherwise use database
      const bidsArray = new Array(4).fill(null);
      
      // Use Redis bids first (most up-to-date)
      if (redisBids) {
        console.log(`[GAME SERVICE] Using Redis bids for bidding object:`, redisBids);
        for (let i = 0; i < 4; i++) {
          bidsArray[i] = redisBids[i];
        }
      } else {
        // Fallback to database bids
        playerStats.forEach(stats => {
          if (stats.seatIndex >= 0 && stats.seatIndex < 4) {
            bidsArray[stats.seatIndex] = stats.bid;
          }
        });
      }
      
      const bidding = {
        bids: bidsArray, // Properly ordered by seat index
        nilBids: {},
        currentPlayer: game.currentPlayer,
        currentBidderIndex: players.findIndex(p => p.id === game.currentPlayer)
      };
      
      // DEBUG: Log bidding state
      console.log(`[GAME SERVICE] DEBUG - Bidding state for game ${gameId}:`, {
        redisBids,
        playerStats: playerStats.map(s => ({ seatIndex: s.seatIndex, bid: s.bid })),
        bidsArray,
        bidding
      });
      

      // Build play state
      const play = {
        tricks: [], // Will be populated from completed tricks
        trickNumber: game.currentTrick,
        currentTrick: currentTrickCards.map(card => ({
          suit: card.suit,
          rank: card.rank,
          seatIndex: card.seatIndex,
          playerId: players[card.seatIndex]?.id
        })),
        spadesBroken: false, // Will be calculated from completed tricks
        currentPlayer: game.currentPlayer,
        currentPlayerIndex: players.findIndex(p => p.id === game.currentPlayer)
      };
      console.log(`[GAME SERVICE] Built play object:`, JSON.stringify(play, null, 2));

      // Get completed tricks for this round
      const completedTricks = await prisma.trick.findMany({
        where: { 
          roundId: currentRound?.id,
          winningSeatIndex: { not: -1 }
        },
        include: { cards: true },
        orderBy: { trickNumber: 'asc' }
      });

      play.tricks = completedTricks.map(trick => ({
        cards: trick.cards.map(card => ({
          suit: card.suit,
          rank: card.rank,
          seatIndex: card.seatIndex,
          playerId: players[card.seatIndex]?.id
        })),
        winner: trick.winningSeatIndex,
        trickNumber: trick.trickNumber
      }));

      // Check if spades are broken
      play.spadesBroken = play.tricks.some(trick => 
        trick.cards.some(card => card.suit === 'SPADES')
      );

      // Get current scores from RoundScore entries
      const roundScores = await prisma.roundScore.findMany({
        where: { 
          Round: { gameId } 
        },
        orderBy: { Round: { roundNumber: 'asc' } }
      });

      // Calculate running totals
      let team0Total = 0;
      let team1Total = 0;
      let team0Bags = 0;
      let team1Bags = 0;
      
      for (const score of roundScores) {
        team0Total += score.team0Score || 0;
        team1Total += score.team1Score || 0;
        team0Bags += score.team0Bags || 0;
        team1Bags += score.team1Bags || 0;
      }

      const currentScores = {
        team0Total,
        team1Total,
        team0Bags,
        team1Bags,
        currentRound: game.currentRound
      };

      // Transform database state to client format
      const clientState = {
        id: game.id,
        status: game.status,
        mode: game.mode,
        format: game.format,
        maxPoints: game.maxPoints,
        minPoints: game.minPoints,
        buyIn: game.buyIn,
        nilAllowed: game.nilAllowed,
        blindNilAllowed: game.blindNilAllowed,
        specialRules: game.specialRules,
        currentPlayer: game.currentPlayer,
        currentRound: game.currentRound,
        currentTrick: game.currentTrick,
        dealer: game.dealer,
        players,
        hands,
        bidding,
        play,
        rounds: game.rounds,
        result: game.result,
        team1TotalScore: currentScores.team0Total, // team0 becomes team1 in client
        team2TotalScore: currentScores.team1Total, // team1 becomes team2 in client
        team1Bags: currentScores.team0Bags || 0, // team0 becomes team1 in client
        team2Bags: currentScores.team1Bags || 0, // team1 becomes team2 in client
        createdAt: game.createdAt,
        startedAt: game.startedAt,
        finishedAt: game.finishedAt
      };
      
      console.log(`[GAME SERVICE] Returning client state for game ${gameId}:`, {
        status: clientState.status,
        currentPlayer: clientState.currentPlayer,
        handsLength: clientState.hands.length,
        playersCount: clientState.players.length,
        handsCardCounts: clientState.hands.map((hand, i) => ({ seat: i, cards: hand.length }))
      });
      
      // DEBUG: Log the actual hands being sent to client
      console.log(`[GAME SERVICE] Hands being sent to client:`, {
        hands: clientState.hands,
        handsStringified: clientState.hands.map((hand, i) => `Seat ${i}: ${hand.length} cards`)
      });
      
      // REAL-TIME: Cache the state in Redis for instant future reads
      await redisGameState.setGameState(gameId, clientState);
      
      return clientState;
    } catch (error) {
      console.error('[GAME SERVICE] Error getting game state for client:', error);
      console.error('[GAME SERVICE] Error stack:', error.stack);
      throw error;
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
      const seatToUserId = new Array(4).fill(null);
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
      });

      console.log(`[GAME SERVICE] Deal hands - Database updated with currentPlayer: ${currentPlayer}`);

      // REAL-TIME: Clear ALL Redis cache for this game to force fresh rebuild
      await redisGameState.cleanupGame(gameId);
      console.log(`[GAME SERVICE] Cleared ALL Redis cache for fresh game state rebuild`);
      
      // Initialize empty bids array in Redis for new round
      await redisGameState.setPlayerBids(gameId, new Array(4).fill(null));
      
      // REAL-TIME: Cache hands in Redis for instant access
      console.log(`[GAME SERVICE] Deal hands - Storing hands in Redis:`, {
        handsLengths: hands.map((hand, i) => `Seat ${i}: ${hand.length} cards`),
        handsData: hands
      });
      await redisGameState.setPlayerHands(gameId, hands);
      
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
}
