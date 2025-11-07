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
    if (!gs) return false;

    gs.play = gs.play || {};

    const currentRound = gs.currentRound ?? gs.play.currentRound ?? null;
    const storedRound = gs.play.spadesBrokenRound ?? null;

    const currentTrickCards = Array.isArray(gs.play.currentTrick) ? gs.play.currentTrick : [];
    const completedTricks = Array.isArray(gs.play.completedTricks) ? gs.play.completedTricks : [];
    const hasSpadeInCurrentTrick = currentTrickCards.some(card => card && card.suit === 'SPADES');
    const hasSpadeInCompletedTricks = completedTricks.some(trick =>
      trick && Array.isArray(trick.cards) && trick.cards.some(card => card && card.suit === 'SPADES')
    );
    const hasSpadeHistory = hasSpadeInCurrentTrick || hasSpadeInCompletedTricks;

    if (gs.play.spadesBroken) {
      // Guard against drift across rounds
      if (currentRound !== null) {
        if (storedRound === null) {
          if (!hasSpadeHistory) {
            gs.play.spadesBroken = false;
            delete gs.play.spadesBrokenRound;
            await redisGameState.setGameState(gameId, gs);
            return false;
          }
        } else if (storedRound !== currentRound) {
          gs.play.spadesBroken = false;
          gs.play.spadesBrokenRound = currentRound;
          await redisGameState.setGameState(gameId, gs);
          return false;
        }
      }

      if (!hasSpadeHistory) {
        gs.play.spadesBroken = false;
        delete gs.play.spadesBrokenRound;
        await redisGameState.setGameState(gameId, gs);
        return false;
      }
      return true;
    }

    // Check current trick - if it has a spade RIGHT NOW, set flag and return true
    if (hasSpadeInCurrentTrick || hasSpadeInCompletedTricks) {
      gs.play.spadesBroken = true;
      if (currentRound !== null) {
        gs.play.spadesBrokenRound = currentRound;
      }
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
      const currentRound = gs.currentRound ?? gs.play.currentRound ?? null;
      const currentTrickCards = Array.isArray(gs.play.currentTrick) ? gs.play.currentTrick : [];
      const completedTricks = Array.isArray(gs.play.completedTricks) ? gs.play.completedTricks : [];

      if (!gs.play.spadesBroken) {
        gs.play.spadesBroken = true;
      }
      if (!Array.isArray(gs.play.completedTricks)) {
        gs.play.completedTricks = completedTricks;
      }
      if (!Array.isArray(gs.play.currentTrick)) {
        gs.play.currentTrick = currentTrickCards;
      }
      if (currentRound !== null) {
        gs.play.spadesBrokenRound = currentRound;
      }
      await redisGameState.setGameState(gameId, gs);
    }
  }
}

export default SpadesRuleService;


