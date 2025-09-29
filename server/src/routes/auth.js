import express from 'express';

const router = express.Router();

// Mock auth routes for now
router.get('/profile', (req, res) => {
  // Return mock user data
  res.json({
    id: 'user_123',
    username: 'TestUser',
    avatar: 'https://cdn.discordapp.com/avatars/123/avatar.png',
    coins: 1000,
    level: 1,
    wins: 0,
    losses: 0
  });
});

export { router as authRoutes };
