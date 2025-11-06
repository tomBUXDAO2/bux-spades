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

    // SIMPLE: Just check the flag. Once a spade is played, flag is set to true.
    // It stays true for the entire round. Only reset on new round.
    if (gs.play.spadesBroken) return true;

    // Check current trick - if it has a spade RIGHT NOW, set flag and return true
    const current = Array.isArray(gs.play.currentTrick) ? gs.play.currentTrick : [];
    if (current.some(c => c && c.suit === 'SPADES')) {
      gs.play.spadesBroken = true;
      await redisGameState.setGameState(gameId, gs);
      return true;
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


