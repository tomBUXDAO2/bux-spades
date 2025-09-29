import type { Game } from '../../../types/game';
import { saveGameState } from './gameStateSaver';

const pendingTimers = new Map<string, NodeJS.Timeout>();

export function queueSave(game: Game, delayMs: number = 400): void {
  try {
    if (!game?.id) return;
    const key = game.id;
    const existing = pendingTimers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(async () => {
      pendingTimers.delete(key);
      try {
        await saveGameState(game);
      } catch (err) {
        console.error('[DEBOUNCED SAVE] Failed to save game state:', key, err);
      }
    }, delayMs);
    pendingTimers.set(key, timer);
  } catch (e) {
    console.error('[DEBOUNCED SAVE] Error scheduling save:', e);
  }
}


