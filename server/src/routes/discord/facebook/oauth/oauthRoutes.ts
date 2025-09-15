import { Router } from 'express';

const router = Router();

// OAuth2 route for checking Facebook connections (requires user authorization)
router.get(
  '/auth/discord/connections',
  (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = `${process.env.SERVER_URL || 'https://bux-spades-server.fly.dev'}/api/auth/connections/callback`;
    const scope = 'connections identify';
    
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}`;
    
    res.redirect(authUrl);
  }
);

export default router;
