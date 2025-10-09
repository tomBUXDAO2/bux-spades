import { prisma } from '../config/databaseFirst.js';
import { gameManager } from './GameManager.js';
import { io } from '../config/server.js';

export class GameCleanupService {
  /**
   * Check if game should be cleaned up and perform cleanup if needed
   * @param {string} gameId - The game ID
   * @param {Object} game - The game instance
   * @returns {boolean} True if cleanup was performed
   */
  static async checkAndCleanupGame(gameId, game) {
    try {
      console.log(`[GAME CLEANUP] Checking if game ${gameId} should be cleaned up`);
      
      // Always confirm rating status from DB to avoid stale in-memory state
      const dbGame = await prisma.game.findUnique({ where: { id: gameId } });
      if (!dbGame) {
        console.log(`[GAME CLEANUP] Game ${gameId} not found in database, skipping cleanup`);
        return false;
      }
      
      const isRated = dbGame.isRated;
      console.log(`[GAME CLEANUP] Game ${gameId} isRated: ${isRated}`);
      
      // Check if game is unrated
      if (isRated) {
        console.log(`[GAME CLEANUP] Game ${gameId} is rated, skipping cleanup`);
        return false;
      }
      
      // Count human players using DB as source of truth (leftAt IS NULL)
      const dbHumanCount = await prisma.gamePlayer.count({
        where: { gameId, isHuman: true, leftAt: null }
      });
      // Also compute from memory if available (for logging)
      const memoryHumanCount = Array.isArray(game?.players)
        ? game.players.filter(p => p && p.isHuman !== false).length
        : 0;
      console.log(`[GAME CLEANUP] Human players - db: ${dbHumanCount}, memory: ${memoryHumanCount} for game ${gameId}`);
      
      // If no human players left, cleanup the game
      if (dbHumanCount === 0) {
        console.log(`[GAME CLEANUP] No human players left in unrated game ${gameId}, performing cleanup`);
        await this.cleanupUnratedGame(gameId, game);
        return true;
      }
      
      console.log(`[GAME CLEANUP] Game ${gameId} has ${dbHumanCount} human players remaining, not cleaning up`);
      return false;
    } catch (error) {
      console.error(`[GAME CLEANUP] Error checking game ${gameId}:`, error);
      return false;
    }
  }

  /**
   * Cleanup an unrated game completely from database
   * @param {string} gameId - The game ID
   * @param {Object} game - The game instance
   */
  static async cleanupUnratedGame(gameId, game) {
    try {
      console.log(`[GAME CLEANUP] Starting complete cleanup of unrated game ${gameId}`);
      
      // Determine bot user IDs
      let botUserIds = [];
      if (Array.isArray(game?.players)) {
        const botPlayers = game.players.filter(p => p && p.isHuman === false);
        botUserIds = botPlayers.map(p => p.userId);
      }
      // Fallback to DB if in-memory game is unavailable or incomplete
      if (botUserIds.length === 0) {
        const botGamePlayers = await prisma.gamePlayer.findMany({
          where: { gameId, isHuman: false },
          select: { userId: true }
        });
        botUserIds = botGamePlayers.map(gp => gp.userId);
      }
      
      console.log(`[GAME CLEANUP] Found ${botUserIds.length} bot players to delete:`, botUserIds);
      
      // Start a transaction to ensure atomicity
      await prisma.$transaction(async (tx) => {
        
        // 3. Resolve round and trick ids for this game
        const rounds = await tx.round.findMany({ where: { gameId }, select: { id: true } });
        const roundIds = rounds.map(r => r.id);
        
        // 4. Delete all trick cards first (foreign key constraint)
        console.log(`[GAME CLEANUP] Deleting trick cards for game ${gameId}`);
        if (roundIds.length) {
          // Get all trick IDs for this game's rounds
          const tricks = await tx.trick.findMany({ 
            where: { roundId: { in: roundIds } }, 
            select: { id: true } 
          });
          const trickIds = tricks.map(t => t.id);
          
          // Delete TrickCards by trickId if we have Tricks
          if (trickIds.length) {
            await tx.trickCard.deleteMany({ where: { trickId: { in: trickIds } } });
          }
          
          // ALSO delete any orphaned TrickCards by using raw SQL to find all TrickCards
          // whose trickId starts with 'trick_' (our in-memory trick IDs)
          // This handles the case where Trick records were never created but TrickCards were
          console.log(`[GAME CLEANUP] Deleting orphaned trick cards using raw SQL`);
          await tx.$executeRaw`
            DELETE FROM "TrickCard" 
            WHERE "trickId" IN (
              SELECT t."id" FROM "Trick" t WHERE t."roundId" = ANY(${roundIds})
            )
          `;
          
          // Also delete orphaned TrickCards that don't have a corresponding Trick record
          await tx.$executeRaw`
            DELETE FROM "TrickCard" 
            WHERE "trickId" LIKE 'trick_%' 
            AND "trickId" NOT IN (SELECT id FROM "Trick")
          `;
        }
        
        // 5. Delete all tricks
        console.log(`[GAME CLEANUP] Deleting tricks for game ${gameId}`);
        if (roundIds.length) {
          await tx.trick.deleteMany({ where: { roundId: { in: roundIds } } });
        }
        
        // 5. Delete all round bids
        console.log(`[GAME CLEANUP] Deleting round bids for game ${gameId}`);
        if (roundIds.length) {
          await tx.playerRoundStats.deleteMany({ where: { roundId: { in: roundIds } } });
        }
        
        // 5a. Delete all round hand snapshots (using raw SQL since not in Prisma client)
        console.log(`[GAME CLEANUP] Deleting round hand snapshots for game ${gameId}`);
        if (roundIds.length) {
          await tx.$executeRaw`DELETE FROM "RoundHandSnapshot" WHERE "roundId" = ANY(${roundIds})`;
        }
        
        // 5b. Delete all player round stats (using raw SQL since not in Prisma client)
        console.log(`[GAME CLEANUP] Deleting player round stats for game ${gameId}`);
        if (roundIds.length) {
          await tx.$executeRaw`DELETE FROM "PlayerRoundStats" WHERE "roundId" = ANY(${roundIds})`;
        }
        
        // 7. Delete all rounds
        console.log(`[GAME CLEANUP] Deleting rounds for game ${gameId}`);
        if (roundIds.length) {
          await tx.round.deleteMany({ where: { id: { in: roundIds } } });
        }
        
        // 8. Delete all game players
        console.log(`[GAME CLEANUP] Deleting game players for game ${gameId}`);
        await tx.gamePlayer.deleteMany({
          where: { gameId }
        });
        
        // 9. Delete game result
        console.log(`[GAME CLEANUP] Deleting game result for game ${gameId}`);
        await tx.gameResult.deleteMany({
          where: { gameId }
        });
        
        // 10. Delete the game itself
        console.log(`[GAME CLEANUP] Deleting game ${gameId}`);
        await tx.game.delete({
          where: { id: gameId }
        });
        
        // 12. Delete bot users
        if (botUserIds.length > 0) {
          console.log(`[GAME CLEANUP] Deleting ${botUserIds.length} bot users`);
          await tx.user.deleteMany({
            where: {
              id: {
                in: botUserIds
              }
            }
          });
        }
      });
      
      // Delete discord game if exists (outside transaction to avoid rollback)
      console.log(`[GAME CLEANUP] Deleting discord game for game ${gameId}`);
      try {
        await prisma.$executeRaw`DELETE FROM "DiscordGame" WHERE "gameId" = ${gameId}`;
      } catch (error) {
        // DiscordGame table might not exist, continue with cleanup
        console.log(`[GAME CLEANUP] DiscordGame table not found, skipping: ${error.message}`);
      }
      
      // Remove from memory game manager
      gameManager.removeGame(gameId);
      
      console.log(`[GAME CLEANUP] Successfully cleaned up unrated game ${gameId}`);
      
    } catch (error) {
      console.error(`[GAME CLEANUP] Error cleaning up game ${gameId}:`, error);
      throw error;
    }
  }

  /**
   * Cleanup all abandoned unrated games (games with no human players)
   * This can be run as a periodic cleanup task
   */
  static async cleanupAllAbandonedUnratedGames() {
    try {
      console.log('[GAME CLEANUP] Starting cleanup of all abandoned unrated games');
      
      // Find all unrated games
      const unratedGames = await prisma.game.findMany({
        where: {
          isRated: false,
          status: {
            in: ['WAITING', 'BIDDING', 'PLAYING']
          }
        }
      });
      
      console.log(`[GAME CLEANUP] Found ${unratedGames.length} unrated games to check`);
      
      let cleanedCount = 0;
      
      for (const game of unratedGames) {
        // Check if game has any human players by querying GamePlayer table
        const humanPlayers = await prisma.gamePlayer.findMany({
          where: {
            gameId: game.id,
            isHuman: true
          }
        });
        
        console.log(`[GAME CLEANUP] Game ${game.id} has ${humanPlayers.length} human players`);
        
        // If no human players, cleanup the game
        if (humanPlayers.length === 0) {
          console.log(`[GAME CLEANUP] Cleaning up abandoned game ${game.id}`);
          await this.cleanupUnratedGame(game.id, null);
          cleanedCount++;
        }
      }
      
      console.log(`[GAME CLEANUP] Cleaned up ${cleanedCount} abandoned unrated games`);
      return cleanedCount;
      
    } catch (error) {
      console.error('[GAME CLEANUP] Error cleaning up abandoned games:', error);
      throw error;
    }
  }

  /**
   * Cleanup old completed unrated games (older than 24 hours)
   * This helps keep the database clean
   */
  static async cleanupOldCompletedUnratedGames() {
    try {
      console.log('[GAME CLEANUP] Starting cleanup of old completed unrated games');
      
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - 24); // 24 hours ago
      
      // Find old completed unrated games
      const oldGames = await prisma.game.findMany({
        where: {
          isRated: false,
          status: 'FINISHED',
          finishedAt: {
            lt: cutoffDate
          }
        }
      });
      
      console.log(`[GAME CLEANUP] Found ${oldGames.length} old completed unrated games`);
      
      let cleanedCount = 0;
      
      for (const game of oldGames) {
        console.log(`[GAME CLEANUP] Cleaning up old completed game ${game.id}`);
        await this.cleanupUnratedGame(game.id, null);
        cleanedCount++;
      }
      
      console.log(`[GAME CLEANUP] Cleaned up ${cleanedCount} old completed unrated games`);
      return cleanedCount;
      
    } catch (error) {
      console.error('[GAME CLEANUP] Error cleaning up old games:', error);
      throw error;
    }
  }

  /**
   * Get cleanup statistics
   * @returns {Object} Cleanup statistics
   */
  static async getCleanupStats() {
    try {
      const stats = await prisma.$transaction(async (tx) => {
        // Count unrated games
        const unratedGames = await tx.game.count({
          where: { isRated: false }
        });
        
        // Count unrated games with no human players
        // Note: This is a simplified check - we'll need to check GamePlayer table separately
        const abandonedGames = await tx.game.count({
          where: {
            isRated: false,
            status: {
              in: ['WAITING', 'BIDDING', 'PLAYING']
            }
          }
        });
        
        // Count old completed unrated games
        const cutoffDate = new Date();
        cutoffDate.setHours(cutoffDate.getHours() - 24);
        
        const oldCompletedGames = await tx.game.count({
          where: {
            isRated: false,
            status: 'FINISHED',
            finishedAt: {
              lt: cutoffDate
            }
          }
        });
        
        // Count bot users
        const botUsers = await tx.user.count({
          where: {
            username: {
              startsWith: 'Bot_'
            }
          }
        });
        
        return {
          unratedGames,
          abandonedGames,
          oldCompletedGames,
          botUsers,
          totalCleanupCandidates: abandonedGames + oldCompletedGames
        };
      });
      
      return stats;
    } catch (error) {
      console.error('[GAME CLEANUP] Error getting cleanup stats:', error);
      throw error;
    }
  }

  static async deleteOrphanBotUsers() {
    try {
      console.log('[GAME CLEANUP] Checking for orphaned bot users');

      // Find all bot users
      const botUsers = await prisma.user.findMany({
        where: { username: { startsWith: 'Bot_' } },
        select: { id: true }
      });
      if (botUsers.length === 0) {
        console.log('[GAME CLEANUP] No bot users found');
        return 0;
      }

      const botIds = botUsers.map(b => b.id);

      // Find bot users that are still referenced by any GamePlayer
      const activeBotRefs = await prisma.gamePlayer.findMany({
        where: { userId: { in: botIds } },
        select: { userId: true }
      });
      const activeSet = new Set(activeBotRefs.map(r => r.userId));

      // Determine orphan bot users (no GamePlayer rows)
      const orphanIds = botIds.filter(id => !activeSet.has(id));

      if (orphanIds.length === 0) {
        console.log('[GAME CLEANUP] No orphaned bot users to delete');
        return 0;
      }

      console.log(`[GAME CLEANUP] Deleting ${orphanIds.length} orphaned bot users`);
      const result = await prisma.user.deleteMany({ where: { id: { in: orphanIds } } });
      return result.count || orphanIds.length;
    } catch (error) {
      console.error('[GAME CLEANUP] Error deleting orphaned bot users:', error);
      return 0;
    }
  }

  /**
   * Cleanup games stuck in WAITING for longer than the specified minutes
   * Deletes the game and any bot users involved, and notifies connected clients
   */
  static async cleanupStaleWaitingGames(minutes = 15) {
    try {
      const cutoff = new Date(Date.now() - minutes * 60 * 1000);
      console.log(`[GAME CLEANUP] Looking for WAITING games older than ${minutes} minutes (before ${cutoff.toISOString()})`);

      const staleGames = await prisma.game.findMany({
        where: {
          status: 'WAITING',
          createdAt: { lt: cutoff }
        },
        select: { id: true }
      });

      if (!staleGames.length) {
        console.log('[GAME CLEANUP] No stale WAITING games found');
        return 0;
      }

      console.log(`[GAME CLEANUP] Found ${staleGames.length} stale WAITING games to cleanup`);

      let cleaned = 0;
      for (const g of staleGames) {
        const gameId = g.id;
        try {
          // Determine bot user IDs from DB
          const botPlayers = await prisma.gamePlayer.findMany({
            where: { gameId, isHuman: false },
            select: { userId: true }
          });
          const botUserIds = botPlayers.map(b => b.userId);

          // Notify clients first
          try {
            io.to(gameId).emit('game_closed', {
              reason: 'inactivity_timeout',
              message: 'Your table was closed due to inactivity.'
            });
          } catch (notifyErr) {
            console.warn(`[GAME CLEANUP] Failed to notify clients for game ${gameId}:`, notifyErr);
          }

          // Perform full deletion similar to cleanupUnratedGame but regardless of rated
          await prisma.$transaction(async (tx) => {
            const rounds = await tx.round.findMany({ where: { gameId }, select: { id: true } });
            const roundIds = rounds.map(r => r.id);

            if (roundIds.length) {
              const tricks = await tx.trick.findMany({ where: { roundId: { in: roundIds } }, select: { id: true } });
              const trickIds = tricks.map(t => t.id);
              if (trickIds.length) {
                await tx.trickCard.deleteMany({ where: { trickId: { in: trickIds } } });
              }
              await tx.$executeRaw`
                DELETE FROM "TrickCard" 
                WHERE "trickId" IN (
                  SELECT t."id" FROM "Trick" t WHERE t."roundId" = ANY(${roundIds})
                )
              `;
              await tx.$executeRaw`
                DELETE FROM "TrickCard" 
                WHERE "trickId" LIKE 'trick_%' 
                AND "trickId" NOT IN (SELECT id FROM "Trick")
              `;
              await tx.trick.deleteMany({ where: { roundId: { in: roundIds } } });
              await tx.playerRoundStats.deleteMany({ where: { roundId: { in: roundIds } } });
              await tx.$executeRaw`DELETE FROM "RoundHandSnapshot" WHERE "roundId" = ANY(${roundIds})`;
              await tx.$executeRaw`DELETE FROM "PlayerRoundStats" WHERE "roundId" = ANY(${roundIds})`;
              await tx.round.deleteMany({ where: { id: { in: roundIds } } });
            }

            await tx.gamePlayer.deleteMany({ where: { gameId } });
            await tx.gameResult.deleteMany({ where: { gameId } });
            await tx.game.delete({ where: { id: gameId } });

            if (botUserIds.length) {
              await tx.user.deleteMany({ where: { id: { in: botUserIds } } });
            }
          });

          try {
            await prisma.$executeRaw`DELETE FROM "DiscordGame" WHERE "gameId" = ${gameId}`;
          } catch {}

          gameManager.removeGame(gameId);
          cleaned++;
          console.log(`[GAME CLEANUP] Cleaned stale WAITING game ${gameId}`);
        } catch (err) {
          console.error(`[GAME CLEANUP] Error cleaning stale game ${gameId}:`, err);
        }
      }

      return cleaned;
    } catch (error) {
      console.error('[GAME CLEANUP] Error finding/cleaning stale waiting games:', error);
      return 0;
    }
  }
}