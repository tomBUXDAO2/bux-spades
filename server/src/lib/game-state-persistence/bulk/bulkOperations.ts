import type { Game } from '../../../types/game';
import { restoreGameState } from '../restore/gameStateRestorer';
import { saveGameState } from '../save/gameStateSaver';
import prisma from '../../prisma';

/**
 * Check for games that need to be restored after server restart
 */
export async function restoreAllActiveGames(): Promise<Game[]> {
  try {
    const activeGames = await (prisma.game.findMany as any)({
      where: {
        status: {
          in: ['PLAYING']
        }
      }
    });

    const restoredGames: Game[] = [];
    
    for (const dbGame of activeGames) {
      const restoredGame = await restoreGameState(dbGame.id);
      if (restoredGame) {
        restoredGames.push(restoredGame);
      }
    }

    console.log(`[GAME STATE] ✅ Restored ${restoredGames.length} active games after server restart`);
    return restoredGames;
  } catch (error) {
    console.error('[GAME STATE] ❌ Failed to restore active games:', error);
    return [];
  }
}

/**
 * Auto-save game state periodically
 */
export function startGameStateAutoSave(games: Game[]): void {
  setInterval(() => {
    games.forEach(game => {
      if (game.status === 'PLAYING') {
        saveGameState(game);
      }
    });
  }, 30000); // Save every 30 seconds
}
