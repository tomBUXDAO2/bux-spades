import prisma from '../../prisma';

/**
 * Check for stuck games and auto-complete them
 */
export async function checkForStuckGames(): Promise<void> {
  try {
    const stuckGames = await (prisma.game.findMany as any)({
      where: {
        status: {
          in: ['PLAYING'] as any
        }
      }
    });

    for (const stuckGame of stuckGames) {
      console.log(`[STUCK GAME] ⚠️ Found stuck game ${stuckGame.id} - status: ${(stuckGame as any).status}`);
      
      // Auto-complete the game or reset it
      await (prisma.game.update as any)({
        where: { id: stuckGame.id },
        data: {
          status: 'FINISHED',
          updatedAt: new Date()
        }
      });
      
      console.log(`[STUCK GAME] ✅ Auto-completed stuck game ${stuckGame.id}`);
    }
  } catch (error) {
    console.error('[STUCK GAME] ❌ Failed to check for stuck games:', error);
  }
}
