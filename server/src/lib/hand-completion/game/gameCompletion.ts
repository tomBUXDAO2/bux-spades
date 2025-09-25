import { io } from '../../../index';
import type { Game } from '../../../types/game';
import prisma from '../../prisma';
import { CoinManager } from '../../coin-management/coinManager';
import { newdbRecordGameFinish } from "../../../newdb/writers";
import { calculateAndStoreUserStats } from "../../../newdb/simple-statistics";
import { enrichGameForClient } from '../../../routes/games/shared/gameUtils';

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
      select: { id: true }
    });
    const totalRounds = rounds.length;
    
    const tricks = await prisma.trick.findMany({
      where: {
        roundId: { in: rounds.map(r => r.id) }
      },
      select: { id: true }
    });
    const totalTricks = tricks.length;

    // Create game result in old database  
    const gameResultId = `gameresult_${game.dbGameId}_${Date.now()}`;
    await prisma.gameResult.create({
      data: {
        id: gameResultId,
        gameId: game.dbGameId,
        winningTeam: winningTeamOrPlayer,
        finalScore: finalScore,
        totalRounds: totalRounds,
        totalTricks: totalTricks,
        team1Score: team1Score,
        team2Score: team2Score,
        team1Bags: game.team1Bags || 0,
        team2Bags: game.team2Bags || 0,
        gameMode: game.gameMode || 'PARTNERS',
        completed: true
      }
    });

    // NEW DB: record game finish
    try {
      const winnerStr = ((): string => {
        if (game.gameMode === 'SOLO') {
          return `SEAT_${winningTeamOrPlayer}`;
        }
        // Partners mode uses 1 for Team 0 (seats 0 & 2) and 2 for Team 1 (seats 1 & 3)
        return winningTeamOrPlayer === 1 ? 'TEAM0' : 'TEAM1';
      })();

      await newdbRecordGameFinish({
        gameId: game.dbGameId,
        winner: winnerStr,
        team1Score,
        team2Score,
        team1Bags: game.team1Bags || 0,
        team2Bags: game.team2Bags || 0,
        totalRounds,
        totalTricks,
        finalScore,
        gameMode: game.gameMode || 'PARTNERS'
      });

      // Calculate and store user statistics
      // Skip user stats for unrated games
      if (!game.rated) {
        console.log("[GAME COMPLETION] Skipping user stats for unrated game");
        return;
      }
      await calculateAndStoreUserStats(game.dbGameId);
    } catch (e) {
      console.warn('[NEWDB] Failed to record game finish:', e);
    }

    console.log('[GAME COMPLETION] Created GameResult:', gameResultId);
  } catch (error) {
    console.error('[GAME COMPLETION] Failed to create game result:', error);
    throw error;
  }
}

/**
 * Import and use the completeGame function from index.ts
 */
export async function completeGame(game: Game, winningTeamOrPlayer: number) {
  console.log('[GAME COMPLETION] Completing game:', game.dbGameId, 'Winner:', winningTeamOrPlayer);
  
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
      
      // Create GameResult entry (also records stats)
      await createGameResult(game, winningTeamOrPlayer);
    }
    
    // Emit game over event
    if (game.gameMode === 'SOLO') {
      // Fetch latest running totals to ensure final round is included
      try {
        const { default: prisma } = await import('../../prisma');
        const latest = await prisma.gameScore.findFirst({ where: { gameId: game.dbGameId as any }, orderBy: { roundNumber: 'desc' } });
        const finalPlayerScores = latest ? [
          latest.player0RunningTotal || 0,
          latest.player1RunningTotal || 0,
          latest.player2RunningTotal || 0,
          latest.player3RunningTotal || 0,
        ] : (game.playerScores || [0,0,0,0]);
        // Update in-memory state so clients see correct finals
        game.playerScores = finalPlayerScores as any;
        // Emit a final game_update with the final scores before winners modal
        io.to(game.dbGameId).emit('game_update', enrichGameForClient(game));
        // Now emit winners modal payload
        io.to(game.dbGameId).emit('game_over', { playerScores: finalPlayerScores, winningPlayer: winningTeamOrPlayer });
      } catch (e) {
        console.warn('[GAME COMPLETION] Failed to fetch latest solo running totals, falling back', e);
        // Ensure current in-memory scores are sent to clients first
        io.to(game.dbGameId).emit('game_update', enrichGameForClient(game));
        io.to(game.dbGameId).emit('game_over', { playerScores: game.playerScores, winningPlayer: winningTeamOrPlayer });
      }
    } else {
      io.to(game.dbGameId).emit('game_over', {
        team1Score: game.team1TotalScore,
        team2Score: game.team2TotalScore,
        winningTeam: winningTeamOrPlayer,
      });
    }
    
    // Process coins (buy-in deductions and prize payouts)
    // This only happens when the game is FINISHED to avoid losing coins on crashes
    await CoinManager.processGameCoins(game, winningTeamOrPlayer);

    // If unrated, delete all traces from NEW DB after completion and close the room
    if (!game.rated) {
      try {
        await deleteUnratedGameFromDatabase(game);
        io.to(game.id).emit('game_deleted', { reason: 'unrated_game_completed' });
        // Remove from memory
        // const idx = games.findIndex(g => g.id === game.id); // This line was commented out in the original file
        // if (idx !== -1) games.splice(idx, 1); // This line was commented out in the original file
        console.log('[GAME COMPLETION] Unrated game deleted and removed from memory:', game.id);
      } catch (e) {
        console.error('[GAME COMPLETION] Failed to delete unrated game on completion:', e);
      }
    }
  } catch (error) {
    console.error('[GAME COMPLETION ERROR] Failed to complete game:', error);
    throw error;
  }
}

/**
 * Delete unrated game and all related data from NEW database
 * This prevents user stats from being recorded and cleans up all data
 */
export async function deleteUnratedGameFromDatabase(game: Game): Promise<void> {
  if (!game.dbGameId || game.rated) {
    console.log("[GAME DELETION DEBUG] Early return check:", { hasDbGameId: !!game.dbGameId, rated: game.rated });    return; // Only delete unrated games
  }
  
  console.log('[GAME DELETION] Deleting unrated game from NEW database:', game.dbGameId);
    console.log("[GAME DELETION DEBUG] Game details:", { id: game.id, dbGameId: game.dbGameId, rated: game.rated });  
  try {
    const { prismaNew } = await import('../../../newdb/client');
    
    // Get all bot user IDs from this game first (no include: User relationship in new schema)
    const gamePlayers = await prismaNew.gamePlayer.findMany({
      where: { gameId: game.dbGameId },
      select: { userId: true }
    });

    const userIds = gamePlayers.map(gp => gp.userId).filter(Boolean) as string[];

    let botUserIds: string[] = [];
    if (userIds.length > 0) {
      const bots = await prismaNew.user.findMany({
        where: { id: { in: userIds as any }, username: { startsWith: 'Bot ' } },
        select: { id: true }
      });
      botUserIds = bots.map(b => b.id);
    }
    
    // Get round IDs for this game
    const rounds = await prismaNew.round.findMany({
      where: { gameId: game.dbGameId },
      select: { id: true }
    });
    const roundIds = rounds.map(r => r.id);
    
    // Get trick IDs for these rounds
    let trickIds: string[] = [];
    if (roundIds.length > 0) {
      const tricks = await prismaNew.trick.findMany({
        where: { roundId: { in: roundIds as any } },
        select: { id: true }
      });
      trickIds = tricks.map(t => t.id);
    }
    
    // Delete in correct order to avoid foreign key violations
    await prismaNew.$transaction(async (tx) => {
      // Delete TrickCards (deepest level)
      if (trickIds.length > 0) {
        await tx.trickCard.deleteMany({
          where: { trickId: { in: trickIds as any } }
        });
        console.log('[GAME DELETION] Deleted TrickCards');
      }
      
      // Delete Tricks
      if (trickIds.length > 0) {
        await tx.trick.deleteMany({
          where: { id: { in: trickIds as any } }
        });
        console.log('[GAME DELETION] Deleted Tricks');
      }
      
      // Delete round-related data
      if (roundIds.length > 0) {
        await tx.roundBid.deleteMany({
          where: { roundId: { in: roundIds as any } }
        });
        await tx.roundHandSnapshot.deleteMany({
          where: { roundId: { in: roundIds as any } }
        });
        await tx.roundScore.deleteMany({
          where: { roundId: { in: roundIds as any } }
        });
        await tx.playerRoundStats.deleteMany({
          where: { roundId: { in: roundIds as any } }
        });
        console.log('[GAME DELETION] Deleted round-related data');
      }
      
      // Delete Rounds
      if (roundIds.length > 0) {
        await tx.round.deleteMany({
          where: { id: { in: roundIds as any } }
        });
        console.log('[GAME DELETION] Deleted Rounds');
      }
      
      // Delete game-related data
      await tx.gameResult.deleteMany({
        where: { gameId: game.dbGameId }
      });
      await tx.eventGame.deleteMany({
        where: { gameId: game.dbGameId }
      });
      await tx.gamePlayer.deleteMany({
        where: { gameId: game.dbGameId }
      });
      console.log('[GAME DELETION] Deleted game-related data');
      
      // Delete the Game itself
      await tx.game.deleteMany({
        where: { id: game.dbGameId }
      });
      console.log('[GAME DELETION] Deleted Game');
      
      // Delete bot users that were created for this game
      if (botUserIds.length > 0) {
        await tx.user.deleteMany({
          where: {
            id: { in: botUserIds as any },
            username: { startsWith: 'Bot ' }
          }
        });
        console.log('[GAME DELETION] Deleted bot users:', botUserIds.length);
      }
    });
    
    console.log('[GAME DELETION] Successfully deleted unrated game from NEW database:', game.dbGameId);
  } catch (error) {
    console.error('[GAME DELETION ERROR] Failed to delete unrated game from NEW database:', game.dbGameId, error);
  }
}
