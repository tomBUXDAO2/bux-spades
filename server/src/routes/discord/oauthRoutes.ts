import { Router } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { rateLimit } from '../../middleware/rateLimit.middleware';

// Import Discord bot functions (optional)
let checkAndUpdateUserRole: any = null;

try {
  const botModule = require('../../discord-bot/bot');
  checkAndUpdateUserRole = botModule.checkAndUpdateUserRole;
} catch (error) {
  console.warn('Discord bot functions not available:', error);
}

const router = Router();

// Add middleware to track all Discord OAuth attempts
router.use('/auth/discord*', (req, res, next) => {
  console.log('Discord OAuth request:', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    referer: req.headers.referer,
    timestamp: new Date().toISOString()
  });
  next();
});

// Discord OAuth2 routes with improved error handling
router.get(
  '/auth/discord',
  rateLimit({ key: 'discord_auth', windowMs: 60_000, max: 10 }), // Prevent abuse
  (req, res, next) => {
    // Log the attempt for debugging
    console.log('Discord OAuth attempt:', {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    });
    next();
  },
  passport.authenticate('discord', { 
    scope: ['identify', 'email'],
    failureRedirect: '/login?error=discord_auth_failed'
  })
);

router.get(
  '/auth/discord/callback',
  rateLimit({ key: 'discord_callback', windowMs: 60_000, max: 10 }),
  passport.authenticate('discord', { 
    failureRedirect: '/login?error=discord_callback_failed' 
  }),
  async (req, res) => {
    try {
      const user = (req as any).user;
      
      if (!user) {
        console.error('Discord callback - No user found in request');
        return res.redirect(`${process.env.CLIENT_URL}/login?error=no_user`);
      }
      
      console.log('Discord callback - User authenticated:', {
        userId: user.id,
        username: user.username,
        discordId: user.discordId
      });

      // Check Facebook connection and update Discord role
      if (user.discordId && checkAndUpdateUserRole) {
        try {
          console.log(`Checking Facebook connection for Discord user: ${user.discordId}`);
          await checkAndUpdateUserRole(user.discordId);
        } catch (error) {
          console.error('Error checking Facebook connection:', error);
          // Don't fail the auth if Discord bot check fails
        }
      }

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

export default router;
