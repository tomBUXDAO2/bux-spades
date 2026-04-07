import { redisClient } from '../config/redis.js';
import { prisma } from '../config/database.js';

const KEY_PREFIX = 'game:statsBySeat:';
const TTL_SEC = 3600;

/**
 * For rated games: per-seat "stats owner" userId (original human at that seat).
 * Substitutes act in-seat but bids/plays logged under this user for PlayerRoundStats.
 */
class StatsAttributionService {
  key(gameId) {
    return `${KEY_PREFIX}${gameId}`;
  }

  async getOwnersArray(gameId) {
    try {
      if (!redisClient) return null;
      const raw = await redisClient.get(this.key(gameId));
      if (!raw) return null;
      const arr = JSON.parse(raw);
      return Array.isArray(arr) && arr.length === 4 ? arr : null;
    } catch (e) {
      console.error('[STATS ATTRIBUTION] getOwnersArray:', e);
      return null;
    }
  }

  async setOwnersArray(gameId, owners) {
    try {
      if (!redisClient) return;
      await redisClient.setEx(this.key(gameId), TTL_SEC, JSON.stringify(owners));
    } catch (e) {
      console.error('[STATS ATTRIBUTION] setOwnersArray:', e);
    }
  }

  /** Remove per-seat owner map when the game finishes (TTL would expire anyway). */
  async clearForGame(gameId) {
    try {
      if (!redisClient) return;
      await redisClient.del(this.key(gameId));
    } catch (e) {
      console.error('[STATS ATTRIBUTION] clearForGame:', e);
    }
  }

  /**
   * Initialize once from deal (4 seated non-spectator user ids by seat).
   * Does not overwrite if already set (e.g. reconnect).
   */
  async initFromDealIfEmpty(gameId, seatToUserId) {
    const existing = await this.getOwnersArray(gameId);
    if (existing) return;
    const owners = [null, null, null, null];
    for (let s = 0; s < 4; s++) {
      owners[s] = seatToUserId[s] || null;
    }
    await this.setOwnersArray(gameId, owners);
  }

  /**
   * Pin seat owner for rated game when a substitute takes over (should match pre-swap occupant).
   */
  async pinSeatOwnerIfRated(gameId, seatIndex, originalUserId) {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { isRated: true }
    });
    if (!game?.isRated || originalUserId == null) return;
    let owners = await this.getOwnersArray(gameId);
    if (!owners) {
      owners = [null, null, null, null];
    }
    if (owners[seatIndex] == null) {
      owners[seatIndex] = originalUserId;
      await this.setOwnersArray(gameId, owners);
    }
  }

  /**
   * Stats user for bid/card logging: seated player userId vs pinned owner (rated subs).
   */
  async resolveStatsUserId(gameId, seatIndex, actingUserId) {
    try {
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: { isRated: true }
      });
      if (!game?.isRated) return actingUserId;
      const owners = await this.getOwnersArray(gameId);
      if (!owners || seatIndex == null || seatIndex < 0 || seatIndex > 3) return actingUserId;
      const pinned = owners[seatIndex];
      return pinned || actingUserId;
    } catch (e) {
      console.error('[STATS ATTRIBUTION] resolveStatsUserId:', e);
      return actingUserId;
    }
  }

  /**
   * When creating PlayerRoundStats for a new round, map seat -> stats user id.
   */
  async resolveStatsUserIdForNewRoundSeat(gameId, seatIndex, currentSeatUserId) {
    return this.resolveStatsUserId(gameId, seatIndex, currentSeatUserId);
  }

  /** Coin buy-in / payout wallet for this seat (original starter if sub took seat). */
  async getWalletUserIdForSeat(gameId, seatIndex, seatedUserIdFallback) {
    const owners = await this.getOwnersArray(gameId);
    if (owners && owners[seatIndex]) {
      return owners[seatIndex];
    }
    return seatedUserIdFallback || null;
  }
}

export const statsAttributionService = new StatsAttributionService();
