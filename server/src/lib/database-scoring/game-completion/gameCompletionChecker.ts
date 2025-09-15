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
  } catch (error) {
    console.error(`[DB GAME COMPLETION ERROR] Failed to check game completion for game ${gameId}:`, error);
    throw error;
  }
}
