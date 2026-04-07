import { redisClient } from '../config/redis.js';

const BLOCKS_PREFIX = 'game:subseat:blocks:';
const PENDING_PREFIX = 'game:subseat:pending:';
const TTL = 3600;

function blockKey(spectatorUserId, seatIndex) {
  return `${spectatorUserId}:${seatIndex}`;
}

class SubSeatService {
  blocksRedisKey(gameId) {
    return `${BLOCKS_PREFIX}${gameId}`;
  }

  pendingRedisKey(gameId) {
    return `${PENDING_PREFIX}${gameId}`;
  }

  async getBlocks(gameId) {
    try {
      if (!redisClient) return new Set();
      const raw = await redisClient.get(this.blocksRedisKey(gameId));
      if (!raw) return new Set();
      const arr = JSON.parse(raw);
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  }

  async addBlock(gameId, spectatorUserId, seatIndex) {
    const set = await this.getBlocks(gameId);
    set.add(blockKey(spectatorUserId, seatIndex));
    if (!redisClient) return;
    await redisClient.setEx(this.blocksRedisKey(gameId), TTL, JSON.stringify([...set]));
  }

  async isBlocked(gameId, spectatorUserId, seatIndex) {
    const set = await this.getBlocks(gameId);
    return set.has(blockKey(spectatorUserId, seatIndex));
  }

  async setPending(gameId, payload) {
    if (!redisClient) return;
    await redisClient.setEx(this.pendingRedisKey(gameId), TTL, JSON.stringify(payload));
  }

  async getPending(gameId) {
    try {
      if (!redisClient) return null;
      const raw = await redisClient.get(this.pendingRedisKey(gameId));
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  async clearPending(gameId) {
    if (!redisClient) return;
    await redisClient.del(this.pendingRedisKey(gameId));
  }

  /** Drop sub-seat blocks + pending payload when the game ends. */
  async clearForGame(gameId) {
    if (!redisClient) return;
    try {
      await redisClient.del([this.blocksRedisKey(gameId), this.pendingRedisKey(gameId)]);
    } catch (e) {
      console.error('[SUB SEAT] clearForGame:', e);
    }
  }
}

export const subSeatService = new SubSeatService();

// gameId -> { timeoutId, requestId }
export const subSeatPendingTimers = new Map();
