import redisGameState from './RedisGameStateService.js';

/**
 * Centralized spades-broken logic to keep bot AI and server validation in sync
 */
export class SpadesRuleService {
  /**
   * Determine if spades are broken for a game by inspecting Redis state only.
   * - True if play.spadesBroken is true
   * - Or if any spade exists in completedTricks or currentTrick
   * - Resets to false on a fresh round (no completed tricks and currentTrick empty)
   */
  static async areSpadesBroken(gameId) {
    const gs = await redisGameState.getGameState(gameId);
    if (!gs || !gs.play) return false;
    // If flag is set, treat as broken
    if (gs.play.spadesBroken) return true;

    const completed = Array.isArray(gs.play.completedTricks) ? gs.play.completedTricks : [];
    const current = Array.isArray(gs.play.currentTrick) ? gs.play.currentTrick : [];

    // Fresh round guard: nothing played anywhere
    if (completed.length === 0 && current.length === 0) {
      return false;
    }

    // Check completed tricks
    for (const t of completed) {
      if (Array.isArray(t?.cards) && t.cards.some(c => c && c.suit === 'SPADES')) {
        return true;
      }
    }

    // Check current trick
    if (current.some(c => c && c.suit === 'SPADES')) return true;

    return false;
  }

  /**
   * Persist spadesBroken=true in Redis state.
   */
  static async markSpadesBroken(gameId) {
    const gs = await redisGameState.getGameState(gameId);
    if (gs) {
      gs.play = gs.play || {};
      if (!gs.play.spadesBroken) {
        gs.play.spadesBroken = true;
        await redisGameState.setGameState(gameId, gs);
      }
    }
  }
}

export default SpadesRuleService;


