import { redisClient } from '../config/redis.js';
import crypto from 'crypto';

const HANDOFF_PREFIX = 'oauth:handoff:';
const HANDOFF_TTL_SEC = 600; // 10 minutes
const memoryFallback = new Map(); // deviceId -> { token, expiresAt }

function parsePwaDeviceId(state) {
  if (typeof state !== 'string') return null;
  if (!state.startsWith('pwa.')) return null;
  const id = state.slice(4).trim();
  // UUID or similar opaque id
  if (!id || id.length < 8 || id.length > 80) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null;
  return id;
}

async function storeHandoffToken(deviceId, jwtToken) {
  const key = `${HANDOFF_PREFIX}${deviceId}`;
  try {
    if (redisClient?.isReady) {
      await redisClient.setEx(key, HANDOFF_TTL_SEC, jwtToken);
      return;
    }
  } catch (err) {
    console.error('[OAUTH HANDOFF] Redis store failed, using memory:', err?.message);
  }
  memoryFallback.set(deviceId, {
    token: jwtToken,
    expiresAt: Date.now() + HANDOFF_TTL_SEC * 1000
  });
}

async function claimHandoffToken(deviceId) {
  const key = `${HANDOFF_PREFIX}${deviceId}`;
  try {
    if (redisClient?.isReady) {
      const token = await redisClient.get(key);
      if (token) {
        await redisClient.del(key);
        return token;
      }
    }
  } catch (err) {
    console.error('[OAUTH HANDOFF] Redis claim failed:', err?.message);
  }
  const mem = memoryFallback.get(deviceId);
  if (mem) {
    memoryFallback.delete(deviceId);
    if (mem.expiresAt > Date.now()) return mem.token;
  }
  return null;
}

function newDeviceId() {
  return crypto.randomUUID().replace(/-/g, '');
}

export {
  parsePwaDeviceId,
  storeHandoffToken,
  claimHandoffToken,
  newDeviceId,
  HANDOFF_TTL_SEC
};
