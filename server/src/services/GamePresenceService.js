import { redisClient } from '../config/redis.js';

const PRESENCE_PREFIX = 'game:presence:';
const TTL_SEC = 3600;

function defaultPresence() {
  return {
    awayUserIds: [],
    timeoutStreaks: {}
  };
}

class GamePresenceService {
  getKey(gameId) {
    return `${PRESENCE_PREFIX}${gameId}`;
  }

  async getPresence(gameId) {
    try {
      if (!redisClient) return defaultPresence();
      const raw = await redisClient.get(this.getKey(gameId));
      if (!raw) return defaultPresence();
      const data = JSON.parse(raw);
      return {
        awayUserIds: Array.isArray(data.awayUserIds) ? data.awayUserIds : [],
        timeoutStreaks: data.timeoutStreaks && typeof data.timeoutStreaks === 'object' ? data.timeoutStreaks : {}
      };
    } catch (e) {
      console.error('[GAME PRESENCE] getPresence error:', e);
      return defaultPresence();
    }
  }

  async setPresence(gameId, presence) {
    try {
      if (!redisClient) return;
      await redisClient.setEx(this.getKey(gameId), TTL_SEC, JSON.stringify(presence));
    } catch (e) {
      console.error('[GAME PRESENCE] setPresence error:', e);
    }
  }

  async isAway(gameId, userId) {
    if (!userId) return false;
    const p = await this.getPresence(gameId);
    return p.awayUserIds.includes(userId);
  }

  async getAwayUserIds(gameId) {
    const p = await this.getPresence(gameId);
    return [...p.awayUserIds];
  }

  /**
   * On natural timer expiry: increment streak; at 2+ mark AWAY.
   * @returns {{ newlyAway: boolean, streak: number }}
   */
  async recordTimeout(gameId, userId) {
    const p = await this.getPresence(gameId);
    const prev = p.timeoutStreaks[userId] || 0;
    const streak = prev + 1;
    p.timeoutStreaks[userId] = streak;
    let newlyAway = false;
    if (streak >= 2 && !p.awayUserIds.includes(userId)) {
      p.awayUserIds.push(userId);
      newlyAway = true;
    }
    await this.setPresence(gameId, p);
    return { newlyAway, streak };
  }

  async clearTimeoutStreak(gameId, userId) {
    const p = await this.getPresence(gameId);
    if (p.timeoutStreaks[userId] !== undefined) {
      delete p.timeoutStreaks[userId];
      await this.setPresence(gameId, p);
    }
  }

  /** Clear AWAY and timeout streak (I'm back). */
  async clearAway(gameId, userId) {
    const p = await this.getPresence(gameId);
    p.awayUserIds = p.awayUserIds.filter((id) => id !== userId);
    delete p.timeoutStreaks[userId];
    await this.setPresence(gameId, p);
  }

  async attachToPlayers(gameId, players) {
    if (!Array.isArray(players)) return;
    const awaySet = new Set(await this.getAwayUserIds(gameId));
    for (const pl of players) {
      if (pl && pl.userId) {
        pl.isAway = awaySet.has(pl.userId);
      }
    }
  }
}

export const gamePresenceService = new GamePresenceService();
