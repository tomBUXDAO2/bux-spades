/**
 * FAST GAME STATE SERVICE
 * Ultra-optimized game state retrieval with minimal database calls
 */

import { prisma } from '../config/database.js';
import redisGameState from './RedisGameStateService.js';

export class FastGameStateService {
  
  /**
   * Get minimal game state for client - ultra fast
   */
  static async getGameStateForClient(gameId) {
    try {
      // Try Redis first (fastest)
      const cached = await redisGameState.getGameState(gameId);
      if (cached) {
        return cached;
      }
      
      // Fallback to minimal database query
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: {
          id: true,
          status: true,
          currentPlayer: true,
          currentRound: true,
          currentTrick: true,
          players: {
            select: {
              userId: true,
              seatIndex: true,
              isHuman: true,
              user: {
                select: { id: true, username: true, avatarUrl: true }
              }
            },
            orderBy: { seatIndex: 'asc' }
          }
        }
      });
      
      if (!game) {
        return null;
      }
      
      // Return minimal state
      return {
        id: game.id,
        status: game.status,
        currentPlayer: game.currentPlayer,
        currentRound: game.currentRound,
        currentTrick: game.currentTrick,
        players: game.players,
        play: {
          currentTrick: [],
          spadesBroken: false
        }
      };
      
    } catch (error) {
      console.error('[FAST GAME STATE] Error:', error);
      throw error;
    }
  }
  
  /**
   * Get minimal game data - ultra fast
   */
  static async getGame(gameId) {
    try {
      // Try Redis first
      const cached = await redisGameState.getGameState(gameId);
      if (cached) {
        return cached;
      }
      
      // Fallback to minimal database query
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: {
          id: true,
          status: true,
          currentPlayer: true,
          currentRound: true,
          currentTrick: true,
          players: {
            select: {
              userId: true,
              seatIndex: true,
              isHuman: true,
              user: {
                select: { id: true, username: true, avatarUrl: true }
              }
            },
            orderBy: { seatIndex: 'asc' }
          }
        }
      });
      
      return game;
      
    } catch (error) {
      console.error('[FAST GAME STATE] Error:', error);
      throw error;
    }
  }
}
