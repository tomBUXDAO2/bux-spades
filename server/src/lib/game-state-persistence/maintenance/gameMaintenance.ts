import prisma from '../../prisma';

/**
 * Check for stuck games and auto-complete them
 */
export async function checkForStuckGames(): Promise<void> {
  try {
    // Only check games that have been stuck for at least 30 minutes
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    
    const stuckGames = await (prisma.game.findMany as any)({
      where: {
        status: {
          in: ['PLAYING'] as any
        },
        updatedAt: {
          lt: thirtyMinutesAgo
        }
      }
    });

    for (const stuckGame of stuckGames) {
      
      // Auto-complete the game or reset it
      await (prisma.game.update as any)({
        where: { id: stuckGame.id },
        data: {
          status: 'FINISHED',
          // updatedAt: new Date()
        }
      });
      
    }
  } catch (error) {
    console.error('[STUCK GAME] ❌ Failed to check for stuck games:', error);
  }
}
