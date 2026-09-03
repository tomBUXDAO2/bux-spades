import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { pushNotificationService } from '../services/PushNotificationService.js';

const router = express.Router();

// Register/update FCM token for push notifications
router.post('/register', authenticateToken, async (req, res) => {
  try {
    const userId = req.userId;
    const token = req.body?.token;
    const platform = req.body?.platform || 'android';

    if (!token) return res.status(400).json({ error: 'token is required' });

    const result = await pushNotificationService.registerFcmToken({
      userId,
      token,
      platform
    });

    if (!result?.ok) {
      return res.status(500).json({ error: result?.error || 'Failed to register token' });
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[PUSH] register error:', e?.message || e);
    res.status(500).json({ error: 'Failed to register push token' });
  }
});

export { router as pushRoutes };

