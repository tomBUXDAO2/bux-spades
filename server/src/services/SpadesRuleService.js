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
    const trickNum = Number(gs.play.currentTrickNumber ?? gs.play.currentTrickIndex ?? 1);

    // Fresh round guard: nothing played anywhere
    if (completed.length === 0 && current.length === 0) {
      // Reset stale flag if present
      if (gs.play.spadesBroken) {
        gs.play.spadesBroken = false;
        await redisGameState.setGameState(gameId, gs);
      }
      return false;
    }

    // CRITICAL: First trick guard - if we're at trick 1 and current trick is empty,
    // spades CANNOT be broken yet (no spade has been played in this trick).
    // Reset stale flag and return false even if completedTricks has stale data from previous rounds.
    if (trickNum === 1 && Array.isArray(current) && current.length === 0) {
      // Reset stale flag if present
      if (gs.play.spadesBroken) {
        gs.play.spadesBroken = false;
        await redisGameState.setGameState(gameId, gs);
        console.log(`[SPADES RULE] Reset stale spadesBroken flag at trick 1`);
      }
      return false;
    }

    // If flag is set, treat as broken (but only if we're past trick 1 or current trick has cards)
    if (gs.play.spadesBroken) return true;

    // Check completed tricks (may contain stale data from previous rounds, but we've already handled trick 1 case above)
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


