import { prisma } from '../config/databaseFirst.js';

/**
 * Force deletion service for stuck games that can't be deleted normally
 * This service handles all edge cases and foreign key constraints
 */
export class ForceGameDeletionService {
  
  /**
   * Force delete a game with comprehensive cleanup
   * @param {string} gameId - The game ID to delete
   * @returns {Object} - Result of the deletion attempt
   */
  static async forceDeleteGame(gameId) {
    console.log(`[FORCE DELETE] Starting force deletion of game ${gameId}`);
    
    try {
      // First, check if game exists
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          players: true,
          rounds: true,
          result: true,
          EventGame: true
        }
      });

      if (!game) {
        return { success: false, error: 'Game not found' };
      }

      console.log(`[FORCE DELETE] Game found: ${game.id} (${game.status})`);

      // Use a transaction to ensure atomicity
      const result = await prisma.$transaction(async (tx) => {
        const deletionSteps = [];
        
        try {
          // Step 1: Get all related IDs
          const rounds = await tx.round.findMany({
            where: { gameId },
            select: { id: true }
          });
          const roundIds = rounds.map(r => r.id);
          
          let trickIds = [];
          if (roundIds.length > 0) {
            const tricks = await tx.trick.findMany({
              where: { roundId: { in: roundIds } },
              select: { id: true }
            });
            trickIds = tricks.map(t => t.id);
          }

          console.log(`[FORCE DELETE] Found ${trickIds.length} tricks, ${roundIds.length} rounds`);

          // Step 2: Delete trick cards first (lowest level)
          if (trickIds.length > 0) {
            console.log(`[FORCE DELETE] Deleting ${trickIds.length} trick cards`);
            const trickCardResult = await tx.trickCard.deleteMany({
              where: { trickId: { in: trickIds } }
            });
            deletionSteps.push(`Deleted ${trickCardResult.count} trick cards`);
          }

          // Step 3: Delete tricks
          if (trickIds.length > 0) {
            console.log(`[FORCE DELETE] Deleting ${trickIds.length} tricks`);
            const trickResult = await tx.trick.deleteMany({
              where: { id: { in: trickIds } }
            });
            deletionSteps.push(`Deleted ${trickResult.count} tricks`);
          }

          // Step 4: Delete round-related data
          if (roundIds.length > 0) {
            // Delete round hand snapshots (using raw SQL for tables not in Prisma schema)
            console.log(`[FORCE DELETE] Deleting round hand snapshots`);
            await tx.$executeRaw`DELETE FROM "RoundHandSnapshot" WHERE "roundId" = ANY(${roundIds})`;
            deletionSteps.push(`Deleted round hand snapshots`);

            // Delete player round stats
            console.log(`[FORCE DELETE] Deleting player round stats`);
            await tx.$executeRaw`DELETE FROM "PlayerRoundStats" WHERE "roundId" = ANY(${roundIds})`;
            deletionSteps.push(`Deleted player round stats`);

            // Delete round scores
            console.log(`[FORCE DELETE] Deleting round scores`);
            const roundScoreResult = await tx.roundScore.deleteMany({
              where: { roundId: { in: roundIds } }
            });
            deletionSteps.push(`Deleted ${roundScoreResult.count} round scores`);

            // Try to delete any remaining round bids (if table exists)
            try {
              await tx.$executeRaw`DELETE FROM "RoundBid" WHERE "roundId" = ANY(${roundIds})`;
              deletionSteps.push(`Deleted round bids`);
            } catch (err) {
              console.log(`[FORCE DELETE] RoundBid table may not exist: ${err.message}`);
            }

            // Try to delete any remaining player trick counts (if table exists)
            try {
              await tx.$executeRaw`DELETE FROM "PlayerTrickCount" WHERE "roundId" = ANY(${roundIds})`;
              deletionSteps.push(`Deleted player trick counts`);
            } catch (err) {
              console.log(`[FORCE DELETE] PlayerTrickCount table may not exist: ${err.message}`);
            }

            // Delete rounds
            console.log(`[FORCE DELETE] Deleting ${roundIds.length} rounds`);
            const roundResult = await tx.round.deleteMany({
              where: { id: { in: roundIds } }
            });
            deletionSteps.push(`Deleted ${roundResult.count} rounds`);
          }

          // Step 5: Delete game players
          console.log(`[FORCE DELETE] Deleting game players`);
          const gamePlayerResult = await tx.gamePlayer.deleteMany({
            where: { gameId }
          });
          deletionSteps.push(`Deleted ${gamePlayerResult.count} game players`);

          // Step 6: Delete game result
          console.log(`[FORCE DELETE] Deleting game result`);
          const gameResultResult = await tx.gameResult.deleteMany({
            where: { gameId }
          });
          deletionSteps.push(`Deleted ${gameResultResult.count} game results`);

          // Step 7: Delete event games
          console.log(`[FORCE DELETE] Deleting event games`);
          const eventGameResult = await tx.eventGame.deleteMany({
            where: { gameId }
          });
          deletionSteps.push(`Deleted ${eventGameResult.count} event games`);

          // Step 8: Delete the game itself
          console.log(`[FORCE DELETE] Deleting game ${gameId}`);
          const gameResult = await tx.game.delete({
            where: { id: gameId }
          });
          deletionSteps.push(`Deleted game ${gameId}`);

          // Step 9: Clean up any orphaned bot users
          const botUserIds = game.players
            .filter(p => p.userId.startsWith('bot-'))
            .map(p => p.userId);

          if (botUserIds.length > 0) {
            console.log(`[FORCE DELETE] Cleaning up ${botUserIds.length} bot users`);
            const botResult = await tx.user.deleteMany({
              where: { id: { in: botUserIds } }
            });
            deletionSteps.push(`Deleted ${botResult.count} bot users`);
          }

          return {
            success: true,
            gameId,
            steps: deletionSteps,
            message: `Successfully force deleted game ${gameId}`
          };

        } catch (error) {
          console.error(`[FORCE DELETE] Error in transaction:`, error);
          throw error;
        }
      });

      console.log(`[FORCE DELETE] Successfully deleted game ${gameId}`);
      return result;

    } catch (error) {
      console.error(`[FORCE DELETE] Error force deleting game ${gameId}:`, error);
      return {
        success: false,
        error: error.message,
        gameId
      };
    }
  }

  /**
   * Get detailed information about a game and its related records
   * @param {string} gameId - The game ID to analyze
   * @returns {Object} - Detailed game information
   */
  static async getGameDetails(gameId) {
    try {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          players: true,
          rounds: {
            include: {
              tricks: {
                include: {
                  cards: true
                }
              },
              handSnapshots: true,
              playerStats: true,
              RoundScore: true
            }
          },
          result: true,
          EventGame: true
        }
      });

      if (!game) {
        return { found: false };
      }

      // Count all related records
      const roundIds = game.rounds.map(r => r.id);
      const trickIds = game.rounds.flatMap(r => r.tricks.map(t => t.id));

      const recordCounts = {
        game: 1,
        players: game.players.length,
        rounds: game.rounds.length,
        tricks: game.rounds.reduce((sum, r) => sum + r.tricks.length, 0),
        trickCards: game.rounds.reduce((sum, r) => sum + r.tricks.reduce((s, t) => s + t.cards.length, 0), 0),
        handSnapshots: game.rounds.reduce((sum, r) => sum + r.handSnapshots.length, 0),
        playerStats: game.rounds.reduce((sum, r) => sum + r.playerStats.length, 0),
        roundScores: game.rounds.filter(r => r.RoundScore).length,
        gameResult: game.result ? 1 : 0,
        eventGames: game.EventGame.length
      };

      return {
        found: true,
        game,
        recordCounts
      };

    } catch (error) {
      console.error(`[FORCE DELETE] Error getting game details:`, error);
      return { found: false, error: error.message };
    }
  }

  /**
   * List all games that might be stuck (have players but are in problematic states)
   * @returns {Array} - List of potentially stuck games
   */
  static async findStuckGames() {
    try {
      const stuckGames = await prisma.game.findMany({
        where: {
          OR: [
            // Games with no human players but still exist
            {
              players: {
                none: {
                  isHuman: true,
                  leftAt: null
                }
              },
              isRated: false
            },
            // Games that have been waiting too long
            {
              status: 'WAITING',
              createdAt: {
                lt: new Date(Date.now() - 30 * 60 * 1000) // 30 minutes ago
              }
            }
          ]
        },
        include: {
          players: true
        }
      });

      return stuckGames.map(game => ({
        id: game.id,
        status: game.status,
        isRated: game.isRated,
        createdAt: game.createdAt,
        humanPlayers: game.players.filter(p => p.isHuman && !p.leftAt).length,
        totalPlayers: game.players.length
      }));

    } catch (error) {
      console.error(`[FORCE DELETE] Error finding stuck games:`, error);
      return [];
    }
  }
}
