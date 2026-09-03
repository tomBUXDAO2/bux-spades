import webpush from 'web-push';
import { redisClient } from '../config/redis.js';

const WEB_SUB_KEY = (userId) => `webpush:sub:${userId}`;
const WEB_USERS_SET = 'webpush:usersWithSubs';

let initialized = false;
let enabled = false;

function initIfNeeded() {
  if (initialized) return;
  initialized = true;

  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    console.warn('[WEB PUSH] Disabled: set env WEB_PUSH_PUBLIC_KEY and WEB_PUSH_PRIVATE_KEY');
    return;
  }

  try {
    webpush.setVapidDetails(
      'mailto:admin@buxspades.com',
      publicKey,
      privateKey
    );
    enabled = true;
    console.log('[WEB PUSH] web-push initialized with VAPID keys');
  } catch (e) {
    console.error('[WEB PUSH] Failed to set VAPID details:', e?.message || e);
  }
}

class WebPushNotificationService {
  async registerSubscription({ userId, subscription }) {
    if (!userId || !subscription) return { ok: false, error: 'Missing userId or subscription' };
    try {
      await redisClient.set(WEB_SUB_KEY(userId), JSON.stringify(subscription));
      await redisClient.sAdd(WEB_USERS_SET, userId);
      return { ok: true };
    } catch (e) {
      console.error('[WEB PUSH] registerSubscription error:', e?.message || e);
      return { ok: false, error: 'Failed to register subscription' };
    }
  }

  async getUsersWithSubscriptions() {
    try {
      return await redisClient.sMembers(WEB_USERS_SET) || [];
    } catch (e) {
      return [];
    }
  }

  async sendToUser({ userId, title, body, data = {}, dedupeKey = null }) {
    if (!userId) return;
    initIfNeeded();
    if (!enabled) return;

    // Dedupe: same as FCM service – NX + 24h TTL
    if (dedupeKey) {
      const webDedupeKey = `web:${dedupeKey}`;
      try {
        const res = await redisClient.set(webDedupeKey, '1', { NX: true, EX: 60 * 60 * 24 });
        if (!res) return;
      } catch (e) {
        console.warn('[WEB PUSH] dedupe set error:', e?.message || e);
      }
    }

    let subscription;
    try {
      const raw = await redisClient.get(WEB_SUB_KEY(userId));
      if (!raw) return;
      subscription = JSON.parse(raw);
    } catch (e) {
      return;
    }

    const payload = JSON.stringify({ title, body: body || '', data });

    try {
      await webpush.sendNotification(subscription, payload);
    } catch (e) {
      const statusCode = e?.statusCode;
      console.error('[WEB PUSH] sendNotification error:', { userId, statusCode, msg: e?.message });

      // 404 / 410 = subscription expired or unsubscribed; clean up
      if (statusCode === 404 || statusCode === 410) {
        try {
          await redisClient.del(WEB_SUB_KEY(userId));
          await redisClient.sRem(WEB_USERS_SET, userId);
        } catch {}
      }
    }
  }

  async sendToUsers({ userIds, title, body, data = {}, dedupeKeyPrefix = null }) {
    if (!Array.isArray(userIds) || userIds.length === 0) return;
    const MAX = 200;
    await Promise.all(
      userIds.slice(0, MAX).map((uid) =>
        this.sendToUser({
          userId: uid,
          title,
          body,
          data,
          dedupeKey: dedupeKeyPrefix ? `${dedupeKeyPrefix}:${uid}` : null,
        })
      )
    );
  }
}

export const webPushNotificationService = new WebPushNotificationService();
