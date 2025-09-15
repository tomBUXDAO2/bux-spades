import { io } from '../../../index';
import type { Game } from '../../../types/game';

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
    
    // Update stats and coins
    // const { updateStatsAndCoins } = await import('../routes/games.routes');
    // await updateStatsAndCoins(game, winningTeamOrPlayer); // TODO: Implement this function
    
  } catch (error) {
    console.error('[GAME COMPLETION ERROR] Failed to complete game:', error);
    throw error;
  }
}
