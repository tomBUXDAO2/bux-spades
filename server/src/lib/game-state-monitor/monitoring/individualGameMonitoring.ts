import type { Game } from '../../../types/game';
import { CrashPrevention } from '../../crashPrevention';
import { isGameStuck, recoverStuckGame } from '../recovery/stuckGameRecovery';

/**
 * Monitor individual game
 */
export async function monitorGame(game: Game): Promise<void> {
  // Validate game integrity
  const validation = CrashPrevention.validateGameIntegrity(game);
  if (!validation.isValid) {
    console.error(`[GAME MONITOR] Game ${game.id} has integrity issues:`, validation.issues);
    await CrashPrevention.emergencyRecovery(game);
  }

  // Check for stuck states
  if (isGameStuck(game)) {
    console.warn(`[GAME MONITOR] Game ${game.id} appears to be stuck, attempting recovery`);
    await recoverStuckGame(game);
  }

  // Periodic state save for rated games
  const now = Date.now();
  const lastSaved = (game as any).lastSaved || 0;
  const PROTECTION_INTERVAL = 30000; // 30 seconds
  if (now - lastSaved > PROTECTION_INTERVAL) {
    console.log(`[GAME MONITOR] Periodic state save for rated game ${game.id}`);
    await CrashPrevention.saveGameStateSafely(game);
  }
}
