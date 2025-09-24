import { io } from '../../../index';
import type { Game } from '../../../types/game';
import prisma from '../../prisma';
import { CoinManager } from '../../coin-management/coinManager';
import { newdbRecordGameFinish } from "../../../newdb/writers";
import { calculateAndStoreUserStats } from "../../../newdb/simple-statistics";

/**
 * Create GameResult entry for completed game
 */
async function createGameResult(game: Game, winningTeamOrPlayer: number) {
  try {
    // Get final scores and stats
    const team1Score = game.team1TotalScore || 0;
    const team2Score = game.team2TotalScore || 0;
    const finalScore = Math.max(team1Score, team2Score);
    
    // Get total rounds and tricks from database
    const rounds = await prisma.round.findMany({
      where: { gameId: game.dbGameId },
      include: { 
        PlayerTrickCount: true,
        _count: { select: { Trick: true } }
      }
    });
    
    const totalRounds = rounds.length;
    const totalTricks = rounds.reduce((sum, round) => sum + round._count.Trick, 0);

    // Preload per-player bids across rounds for accurate bags
    const roundIds = rounds.map(r => r.id);
    const roundBids = roundIds.length > 0 ? await prisma.roundBid.findMany({
      where: { roundId: { in: roundIds } }
    }) : [];
    
    // Create player results
    const playerResults = game.players.map((player, index) => {
      if (!player) return null;

      // Total tricks made across all rounds from PlayerTrickCount
      const totalTricksWon = rounds.reduce((sum, round) => {
        const ptc = round.PlayerTrickCount.find(p => p.playerId === player.id);
        return sum + (ptc?.tricksWon || 0);
      }, 0);

      // Total bid across all rounds from RoundBid
      const totalTricksBid = roundBids
        .filter(rb => rb.playerId === player.id)
        .reduce((sum, rb) => sum + (rb.bid || 0), 0);

      // Individual bags cannot be negative
      const individualBags = Math.max(0, totalTricksWon - totalTricksBid);
      
      return {
        playerId: player.id,
        username: player.username,
        position: index,
        team: player.team,
        tricksWon: totalTricksWon,
        tricksBid: totalTricksBid,
        points: player.points || 0,
        bags: individualBags
      };
    }).filter(Boolean);
    
    // Create GameResult
    const gameResult = await prisma.gameResult.create({
      data: {
        id: `gameresult_${game.dbGameId}_${Date.now()}`,
        gameId: game.dbGameId,
        winner: winningTeamOrPlayer,
        finalScore: finalScore,
        team1Score: team1Score,
        team2Score: team2Score,
        playerResults: playerResults as any,
        totalRounds: totalRounds,
        totalTricks: totalTricks,
        specialEvents: game.rules?.specialRules || {},
        updatedAt: new Date()
      }
    });
    
    // NEW DB: record game finish
    try {
      const winnerStr = ((): string => {
        if (game.gameMode === 'SOLO') {
          return `SEAT_${winningTeamOrPlayer}`;
        }
        return winningTeamOrPlayer === 0 ? 'TEAM0' : 'TEAM1';
      })();
      await newdbRecordGameFinish({
        gameId: game.id,
        winner: winnerStr,
        finals: {
          team0Final: game.team1TotalScore ?? null,
          team1Final: game.team2TotalScore ?? null,
          player0Final: game.playerScores?.[0] ?? null,
          player1Final: game.playerScores?.[1] ?? null,
          player2Final: game.playerScores?.[2] ?? null,
          player3Final: game.playerScores?.[3] ?? null,
        },
        totalRounds: totalRounds,
        totalTricks: totalTricks,
        finishedAt: new Date(),
      });
          // Calculate and store user statistics
      await calculateAndStoreUserStats(game.id);
    } catch (e) {
      console.warn('[NEWDB] Failed to record game finish:', e);
    }
    
    console.log('[GAME COMPLETION] Created GameResult:', gameResult.id);
  } catch (error) {
    console.error('[GAME COMPLETION ERROR] Failed to create GameResult:', error);
    throw error;
  }
}

/**
 * Import and use the completeGame function from index.ts
 */
export async function completeGame(game: Game, winningTeamOrPlayer: number) {
  console.log('[GAME COMPLETION] Completing game:', game.id, 'Winner:', winningTeamOrPlayer);
  
  try {
    // Set game status to FINISHED
    game.status = 'FINISHED';
    
    // Update database status to FINISHED
    if (game.dbGameId) {
      const { prisma } = await import('../../prisma');
      await prisma.game.update({
        where: { id: game.dbGameId },
        data: { 
          status: 'FINISHED',
          completed: true,
          finalScore: Math.max(game.team1TotalScore || 0, game.team2TotalScore || 0),
          winner: winningTeamOrPlayer
        }
      });
      console.log('[GAME COMPLETION] Updated database status to FINISHED for game:', game.dbGameId);
      
      // Create GameResult entry
      await createGameResult(game, winningTeamOrPlayer);
    }
    
    // Emit game over event
    if (game.gameMode === 'SOLO') {
      io.to(game.id).emit('game_over', {
        playerScores: game.playerScores,
        winningPlayer: winningTeamOrPlayer,
      });
    } else {
      io.to(game.id).emit('game_over', {
        team1Score: game.team1TotalScore,
        team2Score: game.team2TotalScore,
        winningTeam: winningTeamOrPlayer,
      });
    }
    
    // Process coins (buy-in deductions and prize payouts)
    // This only happens when the game is FINISHED to avoid losing coins on crashes
    await CoinManager.processGameCoins(game, winningTeamOrPlayer);

    // Delete unrated games from database completely
    if (!game.rated) {
      // DISABLED FOR TESTING: await deleteUnratedGameFromDatabase(game);
    }

    // const { updateStatsAndCoins } = await import('../routes/games.routes');
    
    
  } catch (error) {
    console.error('[GAME COMPLETION ERROR] Failed to complete game:', error);
    throw error;
  }
}

/**
 * Delete unrated game and all related data from database
 */
export async function deleteUnratedGameFromDatabase(game: Game): Promise<void> {
  if (!game.dbGameId || game.rated) {
    return; // Only delete unrated games
  }
  
  console.log('[GAME DELETION] Deleting unrated game from database:', game.dbGameId);
  
  try {
    const { prisma } = await import('../../prisma');
    
    // Get all bot user IDs from this game
    const gamePlayersWithBots = await prisma.gamePlayer.findMany({
      where: { gameId: game.dbGameId },
      include: { User: true }
    });
    
    const botUserIds = gamePlayersWithBots
      .filter(gp => gp.User.username.startsWith('Bot '))
      .map(gp => gp.userId);
    
    // Delete in correct order to avoid foreign key violations
    await prisma.$transaction(async (tx) => {
      // Delete Cards
      await tx.card.deleteMany({
        where: {
          trickId: {
            in: await tx.trick.findMany({
              where: {
                roundId: {
                  in: await tx.round.findMany({
                    where: { gameId: game.dbGameId },
                    select: { id: true }
                  }).then(rounds => rounds.map(r => r.id))
                }
              },
              select: { id: true }
            }).then(tricks => tricks.map(t => t.id))
          }
        }
      });
      
      // Delete Tricks
      await tx.trick.deleteMany({
        where: {
          roundId: {
            in: await tx.round.findMany({
              where: { gameId: game.dbGameId },
              select: { id: true }
            }).then(rounds => rounds.map(r => r.id))
          }
        }
      });
      
      // Delete RoundBids
      await tx.roundBid.deleteMany({
        where: {
          roundId: {
            in: await tx.round.findMany({
              where: { gameId: game.dbGameId },
              select: { id: true }
            }).then(rounds => rounds.map(r => r.id))
          }
        }
      });
      
      // Delete PlayerTrickCount
      await tx.playerTrickCount.deleteMany({
        where: { gameId: game.dbGameId }
      });
      
      // Delete GameScore
      await tx.gameScore.deleteMany({
        where: { gameId: game.dbGameId }
      });
      
      // Delete GameResult
      await tx.gameResult.deleteMany({
        where: { gameId: game.dbGameId }
      });
      
      // Delete GamePlayer
      await tx.gamePlayer.deleteMany({
        where: { gameId: game.dbGameId }
      });
      
      // Delete Rounds
      await tx.round.deleteMany({
        where: { gameId: game.dbGameId }
      });
      
      // Delete the Game itself
      await tx.game.delete({
        where: { id: game.dbGameId }
      });
      
      // Delete bot users that were created for this game
      if (botUserIds.length > 0) {
        await tx.user.deleteMany({
          where: {
            id: { in: botUserIds },
            username: { startsWith: 'Bot ' }
          }
        });
      }
    });
    
    console.log('[GAME DELETION] Successfully deleted unrated game:', game.dbGameId);
  } catch (error) {
    console.error('[GAME DELETION ERROR] Failed to delete unrated game:', game.dbGameId, error);
  }
}
