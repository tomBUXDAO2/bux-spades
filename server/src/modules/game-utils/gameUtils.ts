import type { Game } from '../../types/game';
import { games } from '../../gamesStore';
import { GameValidator } from '../../lib/gameValidator';

/**
 * Updates game activity timestamp
 */
export function updateGameActivity(gameId: string): void {
  const game = games.find(g => g.id === gameId);
  if (game) {
    game.lastActivity = Date.now();
  }
}

/**
 * Gets validated games for lobby display
 */
export function getValidatedGames(): Game[] {
  const { validGames } = GameValidator.validateAllGames(games);
  return validGames;
}
