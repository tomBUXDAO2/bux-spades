import prisma from '../../prisma';

// Check if game is complete based on running totals
export async function checkGameCompletion(gameId: string, maxPoints: number, minPoints: number) {
  try {
    const latestScore = await prisma.gameScore.findFirst({
      where: { gameId },
      orderBy: { roundNumber: 'desc' }
    });
    
    if (!latestScore) {
      return { isGameOver: false, winningTeam: null };
    }
    
    // Check if this is a solo game by looking at the game record
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { gameMode: true, solo: true }
    });
    
    const isSoloGame = game?.gameMode === 'SOLO' || game?.solo;
    
    if (isSoloGame) {
      // For solo games, check individual player scores
      const playerScores = [
        latestScore.player0RunningTotal || 0,
        latestScore.player1RunningTotal || 0,
        latestScore.player2RunningTotal || 0,
        latestScore.player3RunningTotal || 0
      ];
      
      console.log('[GAME COMPLETION CHECK] Solo game - Player scores:', playerScores);
      console.log('[GAME COMPLETION CHECK] Max points:', maxPoints, 'Min points:', minPoints);
      
      // Check if any player has reached max points or min points
      for (let i = 0; i < playerScores.length; i++) {
        if (playerScores[i] >= maxPoints) {
          console.log(`[GAME COMPLETION CHECK] Player ${i} reached max points: ${playerScores[i]}`);
          return { isGameOver: true, winningTeam: i };
        }
        if (playerScores[i] <= minPoints) {
          console.log(`[GAME COMPLETION CHECK] Player ${i} reached min points: ${playerScores[i]}`);
          return { isGameOver: true, winningTeam: i };
        }
      }
      
      return { isGameOver: false, winningTeam: null };
    } else {
      // For partners games, check team scores
      const team1Total = latestScore.team1RunningTotal;
      const team2Total = latestScore.team2RunningTotal;
      
      let isGameOver = false;
      let winningTeam: 1 | 2 | null = null;
      
      if (team1Total >= maxPoints && team1Total > team2Total) {
        isGameOver = true;
        winningTeam = 1;
      } else if (team2Total >= maxPoints && team2Total > team1Total) {
        isGameOver = true;
        winningTeam = 2;
      } else if (team1Total <= minPoints) {
        isGameOver = true;
        winningTeam = 2; // Team 1 lost, so Team 2 wins
      } else if (team2Total <= minPoints) {
        isGameOver = true;
        winningTeam = 1; // Team 2 lost, so Team 1 wins
      }
      
      return { isGameOver, winningTeam };
    }
  } catch (error) {
    console.error(`[DB GAME COMPLETION ERROR] Failed to check game completion for game ${gameId}:`, error);
    throw error;
  }
}
