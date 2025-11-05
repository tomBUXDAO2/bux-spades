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

    const completed = Array.isArray(gs.play.completedTricks) ? gs.play.completedTricks : [];
    const current = Array.isArray(gs.play.currentTrick) ? gs.play.currentTrick : [];

    // Check completed tricks FIRST - if any contain spades, spades are broken
    // This is the most reliable source of truth - spades that were already played
    for (const t of completed) {
      if (Array.isArray(t?.cards) && t.cards.some(c => c && c.suit === 'SPADES')) {
        // Ensure flag is set if we found spades in completed tricks
        if (!gs.play.spadesBroken) {
          gs.play.spadesBroken = true;
          await redisGameState.setGameState(gameId, gs);
        }
        return true;
      }
    }

    // Check current trick - if it has spades, spades are broken
    if (current.some(c => c && c.suit === 'SPADES')) {
      // Ensure flag is set if we found spades in current trick
      if (!gs.play.spadesBroken) {
        gs.play.spadesBroken = true;
        await redisGameState.setGameState(gameId, gs);
      }
      return true;
    }

    // If flag is set, trust it - spades were broken before
    // Once broken in a round, they stay broken for the entire round
    if (gs.play.spadesBroken) return true;

    // Only reset flag if we're at a truly fresh round (no completed tricks AND no current trick)
    // This means we're at the very start of a new round where nothing has been played
    if (completed.length === 0 && current.length === 0) {
      // Reset stale flag if present (fresh round)
      if (gs.play.spadesBroken) {
        gs.play.spadesBroken = false;
        await redisGameState.setGameState(gameId, gs);
      }
      return false;
    }

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


