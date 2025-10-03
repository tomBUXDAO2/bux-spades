import express from 'express';
import passport from '../config/passport.js';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database.js';

const router = express.Router();

// Discord OAuth routes
router.get('/auth/discord', passport.authenticate('discord'));

// Dev fallback for Discord callback (when Discord OAuth fails)
router.get('/auth/discord/dev', async (req, res) => {
  try {
    const { uid, username } = req.query;
    const userId = uid || 'dev_user_' + Date.now();
    const userDisplayName = username || 'Dev User';
    
    console.log('[DEV AUTH] Creating dev user:', { userId, userDisplayName });
    
    // Create or update user in dev_clean schema
    const user = await prisma.user.upsert({
      where: { id: userId },
      update: { username: userDisplayName },
      create: {
        id: userId,
        discordId: userId,
        username: userDisplayName,
        avatarUrl: '/default-pfp.jpg',
        createdAt: new Date()
      }
    });
    
    // Generate JWT token
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'fallback-secret', {
      expiresIn: '7d',
    });
    
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    console.log('[DEV AUTH] Redirecting to:', `${clientUrl}/auth/callback?token=${token}`);
    res.redirect(`${clientUrl}/auth/callback?token=${token}`);
  } catch (error) {
    console.error('[DEV AUTH] Error:', error);
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    res.redirect(`${clientUrl}/login?error=dev_auth_failed`);
  }
});

router.get(
  '/auth/discord/callback',
  passport.authenticate('discord', { 
    failureRedirect: '/login?error=discord_auth_failed',
    session: false
  }),
  async (req, res) => {
    try {
      console.log('[DISCORD CALLBACK] Starting callback processing');
      console.log('[DISCORD CALLBACK] User from passport:', req.user);
      
      const user = req.user;
      
      if (!user) {
        console.error('Discord callback - No user found in request');
        return res.redirect(`${process.env.CLIENT_URL || 'http://localhost:5173'}/login?error=no_user`);
      }
      
      console.log('Discord callback - User authenticated:', {
        userId: user.id,
        username: user.username,
        discordId: user.discordId
      });

      // Generate JWT token
      const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'fallback-secret', {
        expiresIn: '7d',
      });

      // Redirect to frontend with token
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      console.log('Redirecting to:', `${clientUrl}/auth/callback?token=${token}`);
      res.redirect(`${clientUrl}/auth/callback?token=${token}`);
    } catch (error) {
      console.error('Discord callback error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      res.redirect(`${clientUrl}/login?error=auth_failed`);
    }
  }
);

export { router as discordRoutes };
