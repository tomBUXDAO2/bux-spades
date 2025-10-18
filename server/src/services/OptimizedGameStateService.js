import { prisma } from '../config/database.js';
import redisGameState from './RedisGameStateService.js';

/**
 * OPTIMIZED GAME STATE SERVICE
 * Implements incremental updates and smart caching to fix performance issues
 */
export class OptimizedGameStateService {
  
  /**
   * Get game state with smart caching strategy
   */
  static async getGameState(gameId, useCache = true) {
    if (useCache) {
      const cached = await redisGameState.getGameState(gameId);
      if (cached && this.isCacheValid(cached)) {
        return cached;
      }
    }
    
    // Only rebuild from DB when necessary
    return await this.buildGameStateFromDB(gameId);
  }
  
  /**
   * Update game state incrementally instead of full rebuild
   */
  static async updateGameStateIncrementally(gameId, updates) {
    try {
      const current = await redisGameState.getGameState(gameId);
      if (!current) {
        // If no current state, build from DB
        const fullState = await this.buildGameStateFromDB(gameId);
        await redisGameState.setGameState(gameId, fullState);
        return fullState;
      }
      
      const updated = { ...current, ...updates };
      await redisGameState.setGameState(gameId, updated);
      return updated;
    } catch (error) {
      console.error('[OPTIMIZED GAME STATE] Error updating incrementally:', error);
      // Fallback to full rebuild
      const fullState = await this.buildGameStateFromDB(gameId);
      await redisGameState.setGameState(gameId, fullState);
      return fullState;
    }
  }
  
  /**
   * Update trick completion incrementally
   */
  static async updateTrickCompletion(gameId, trickData) {
    const updates = {
      play: {
        currentTrick: trickData.currentTrick || [],
        spadesBroken: trickData.spadesBroken || false
      }
    };
    
    return await this.updateGameStateIncrementally(gameId, updates);
  }
  
  /**
   * Update player stats incrementally
   */
  static async updatePlayerStats(gameId, seatIndex, tricksWon) {
    const current = await redisGameState.getGameState(gameId);
    if (!current || !current.players) return;
    
    const updatedPlayers = [...current.players];
    if (updatedPlayers[seatIndex]) {
      updatedPlayers[seatIndex] = {
        ...updatedPlayers[seatIndex],
        tricks: (updatedPlayers[seatIndex].tricks || 0) + tricksWon
      };
    }
    
    const updates = { players: updatedPlayers };
    return await this.updateGameStateIncrementally(gameId, updates);
  }
  
  /**
   * Check if cached state is still valid
   */
  static isCacheValid(cachedState) {
    if (!cachedState || !cachedState.id) return false;
    
    // Cache is valid for 30 seconds
    const cacheAge = Date.now() - (cachedState._cacheTimestamp || 0);
    return cacheAge < 30000;
  }
  
  /**
   * Build game state from database with optimized queries
   */
  static async buildGameStateFromDB(gameId) {
    try {
      // OPTIMIZED: Single query with all includes to avoid N+1 problem
      const game = await prisma.game.findUnique({
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
          }
        }
      });

      if (!game) return null;

      // Get current trick from Redis or database
      let currentTrickCards = await redisGameState.getCurrentTrick(gameId);
      if (!currentTrickCards || currentTrickCards.length === 0) {
        const currentRound = game.rounds.find(r => r.roundNumber === game.currentRound);
        if (currentRound) {
          const currentTrick = currentRound.tricks.find(t => t.trickNumber === game.currentTrick);
          if (currentTrick) {
            currentTrickCards = currentTrick.cards.map(card => ({
              suit: card.suit,
              rank: card.rank,
              seatIndex: card.seatIndex,
              playerId: game.players.find(p => p.seatIndex === card.seatIndex)?.userId
            }));
          }
        }
      }

      // Get player hands from Redis
      const playerHands = await redisGameState.getPlayerHands(gameId);
      
      // Get player bids from Redis
      const playerBids = await redisGameState.getPlayerBids(gameId);
      
      // Get spadesBroken from Redis
      let spadesBroken = false;
      try {
        const cachedGameState = await redisGameState.getGameState(gameId);
        if (cachedGameState?.play?.spadesBroken !== undefined) {
          spadesBroken = cachedGameState.play.spadesBroken;
        }
      } catch (error) {
        console.error('[OPTIMIZED GAME STATE] Error getting spadesBroken from Redis:', error);
      }

      // Build players array with nulls for empty seats
      const playersArray = [null, null, null, null];
      const spectatorsArray = [];
      
      game.players.forEach(player => {
        const playerStat = game.rounds
          .find(r => r.roundNumber === game.currentRound)
          ?.playerStats?.find(stat => stat.seatIndex === player.seatIndex);
        
        const tricksWon = playerStat?.tricksWon || 0;
        
        const playerData = {
          id: player.userId,
          userId: player.userId,
          username: player.user?.username || 'Unknown',
          avatarUrl: player.user?.avatarUrl || null,
          seatIndex: player.seatIndex,
          teamIndex: player.teamIndex,
          isHuman: player.isHuman,
          isSpectator: player.isSpectator || false,
          type: player.isHuman ? 'human' : 'bot',
          bid: playerBids[player.seatIndex] || null,
          tricks: tricksWon,
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

      // Get running totals from latest RoundScore
      let team1TotalScore = 0;
      let team2TotalScore = 0;
      let team1Bags = 0;
      let team2Bags = 0;
      
      const latestRoundScore = game.rounds
        .filter(r => r.RoundScore)
        .sort((a, b) => b.roundNumber - a.roundNumber)[0]?.RoundScore;
      
      if (latestRoundScore) {
        team1TotalScore = latestRoundScore.team0RunningTotal || 0;
        team2TotalScore = latestRoundScore.team1RunningTotal || 0;
        team1Bags = latestRoundScore.team0Bags || 0;
        team2Bags = latestRoundScore.team1Bags || 0;
      }

      // Map gimmick variants to client-friendly format
      const gimmickVariantMapping = {
        'SUICIDE': 'SUICIDE',
        'BID4NIL': '4 OR NIL',
        'BID3': 'BID 3',
        'BIDHEARTS': 'BID HEARTS',
        'CRAZY_ACES': 'CRAZY ACES'
      };

      const gameState = {
        id: game.id,
        createdById: game.createdById,
        status: game.status,
        mode: game.mode,
        format: game.format,
        gimmickVariant: gimmickVariantMapping[game.gimmickVariant] || game.gimmickVariant,
        buyIn: game.buyIn,
        minPoints: game.minPoints,
        maxPoints: game.maxPoints,
        nilAllowed: game.nilAllowed,
        blindNilAllowed: game.blindNilAllowed,
        specialRules: game.specialRules,
        isLeague: game.isLeague,
        isRated: game.isRated,
        currentPlayer: game.currentPlayer,
        currentRound: game.currentRound,
        currentTrick: game.currentTrick,
        dealer: game.dealer,
        players: playersArray,
        spectators: spectatorsArray,
        rounds: game.rounds || [],
        hands: playerHands,
        playerHands: playerHands,
        currentTrickCards: currentTrickCards,
        playerBids: playerBids,
        play: {
          currentTrick: currentTrickCards,
          spadesBroken: spadesBroken
        },
        bidding: {
          bids: playerBids,
          currentBidderIndex: game.players.findIndex(p => p.userId === game.currentPlayer) || 0,
          currentPlayer: game.currentPlayer
        },
        isGameComplete: game.status === 'FINISHED',
        team1TotalScore: team1TotalScore,
        team2TotalScore: team2TotalScore,
        team1Bags: team1Bags,
        team2Bags: team2Bags,
        gameMode: game.mode,
        rules: game.gameState?.rules || {
          gameType: game.mode === 'SOLO' ? 'SOLO' : 'PARTNERS',
          allowNil: game.nilAllowed,
          allowBlindNil: game.blindNilAllowed,
          coinAmount: game.buyIn,
          maxPoints: game.maxPoints,
          minPoints: game.minPoints,
          bidType: gimmickVariantMapping[game.gimmickVariant] || game.gimmickVariant,
          specialRules: game.specialRules || {}
        },
        _cacheTimestamp: Date.now()
      };

      return gameState;
    } catch (error) {
      console.error('[OPTIMIZED GAME STATE] Error building game state from DB:', error);
      return null;
    }
  }
  
  /**
   * Clear cache for a specific game
   */
  static async clearCache(gameId) {
    try {
      await redisGameState.cleanupGame(gameId);
      console.log(`[OPTIMIZED GAME STATE] Cleared cache for game ${gameId}`);
    } catch (error) {
      console.error('[OPTIMIZED GAME STATE] Error clearing cache:', error);
    }
  }
}