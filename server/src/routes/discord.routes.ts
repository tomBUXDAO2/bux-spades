import { Router } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';

const router = Router();

// Discord OAuth2 routes
router.get(
  '/auth/discord',
  passport.authenticate('discord', { 
    scope: ['identify', 'email'],
    callbackURL: process.env.DISCORD_CALLBACK_URL
  })
);

router.get(
  '/auth/discord/callback',
  passport.authenticate('discord', { 
    failureRedirect: '/login',
    callbackURL: process.env.DISCORD_CALLBACK_URL
  }),
  (req, res) => {
    const user = (req as any).user;
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });

    // Redirect to frontend with token
    res.redirect(
      `${process.env.CLIENT_URL}/auth/callback?token=${token}`
    );
  }
);

export default router; 