import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { webPushNotificationService } from '../services/WebPushNotificationService.js';

const router = express.Router();

// Register / refresh Web Push subscription for browser / PWA users
router.post('/register', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const subscription = req.body?.subscription;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'Missing subscription object' });
    }

    const result = await webPushNotificationService.registerSubscription({ userId, subscription });
    if (!result?.ok) {
      return res.status(500).json({ error: result?.error || 'Failed to register subscription' });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[WEB PUSH] register error:', e?.message || e);
    res.status(500).json({ error: 'Failed to register web push subscription' });
  }
});

export { router as webPushRoutes };
