import admin from 'firebase-admin';
import { redisClient } from '../config/redis.js';

const PUSH_TOKENS_SET = 'push:usersWithTokens';
const tokenKeyForUser = (userId) => `push:fcmToken:${userId}`;
const platformKeyForUser = (userId) => `push:fcmPlatform:${userId}`;

let firebaseInitialized = false;
let firebaseEnabled = false;

function getServiceAccount() {
  const json = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch (e) {
    console.error('[FCM] Failed to parse FCM_SERVICE_ACCOUNT_JSON:', e?.message || e);
    return null;
  }
}

function initFirebaseIfNeeded() {
  if (firebaseInitialized) return;
  firebaseInitialized = true;

  const serviceAccount = getServiceAccount();
  if (!serviceAccount) {
    console.warn('[FCM] Disabled: set env FCM_SERVICE_ACCOUNT_JSON with a Firebase service account');
    return;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseEnabled = true;
    console.log('[FCM] Initialized firebase-admin');
  } catch (e) {
    console.error('[FCM] Failed to init firebase-admin:', e?.message || e);
  }
}

function toStringRecord(data) {
  const out = {};
  for (const [k, v] of Object.entries(data || {})) {
    if (v === undefined || v === null) continue;
    out[k] = typeof v === 'string' ? v : String(v);
  }
  return out;
}

class PushNotificationService {
  init() {
    initFirebaseIfNeeded();
  }

  async registerFcmToken({ userId, token, platform = 'android' }) {
    if (!userId || !token) return { ok: false, error: 'Missing userId or token' };
    try {
      await redisClient.set(tokenKeyForUser(userId), token);
      await redisClient.set(platformKeyForUser(userId), platform);
      await redisClient.sAdd(PUSH_TOKENS_SET, userId);
      return { ok: true };
    } catch (e) {
      console.error('[PUSH] registerFcmToken error:', e?.message || e);
      return { ok: false, error: 'Failed to register token' };
    }
  }

  async getUsersWithTokens() {
    try {
      const members = await redisClient.sMembers(PUSH_TOKENS_SET);
      return Array.isArray(members) ? members : [];
    } catch (e) {
      console.error('[PUSH] getUsersWithTokens error:', e?.message || e);
      return [];
    }
  }

  async sendToUser({ userId, title, body, data = {}, dedupeKey = null }) {
    if (!userId) return;
    this.init();
    if (!firebaseEnabled) return;

    // Dedupe: NX + TTL so we don't spam the same user for the same event
    if (dedupeKey) {
      try {
        const res = await redisClient.set(dedupeKey, '1', { NX: true, EX: 60 * 60 * 24 }); // 24h
        if (!res) return;
      } catch (e) {
        // If redis dedupe fails, don't hard-fail notification sending.
        console.warn('[PUSH] dedupe set error:', e?.message || e);
      }
    }

    try {
      const token = await redisClient.get(tokenKeyForUser(userId));
      if (!token) return;

      const message = {
        token,
        notification: {
          title,
          body: body || ''
        },
        data: toStringRecord(data),
        android: {
          priority: 'high'
        }
      };

      await admin.messaging().send(message);
    } catch (e) {
      const msg = e?.message || String(e);
      console.error('[PUSH] sendToUser error:', { userId, msg });

      // If token is invalid, remove it so we don't keep failing.
      const invalid =
        msg.includes('registration-token-not-registered') ||
        msg.includes('invalid-registration-token');
      if (invalid) {
        try {
          await redisClient.del(tokenKeyForUser(userId));
          await redisClient.del(platformKeyForUser(userId));
          await redisClient.sRem(PUSH_TOKENS_SET, userId);
        } catch {}
      }
    }
  }

  async sendToUsers({ userIds, title, body, data = {}, dedupeKeyPrefix = null }) {
    if (!Array.isArray(userIds) || userIds.length === 0) return;
    // Keep concurrency bounded
    const MAX = 200;
    const sliced = userIds.slice(0, MAX);

    await Promise.all(
      sliced.map((uid) => {
        const dedupeKey = dedupeKeyPrefix
          ? `${dedupeKeyPrefix}:${uid}`
          : null;
        return this.sendToUser({
          userId: uid,
          title,
          body,
          data,
          dedupeKey
        });
      })
    );
  }
}

export const pushNotificationService = new PushNotificationService();

