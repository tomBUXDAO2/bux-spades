import { Router } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';

// Import Discord bot functions (optional)
let checkAndUpdateUserRole: any = null;
let verifyFacebookConnection: any = null;
let revokeFacebookVerification: any = null;

try {
  const botModule = require('../discord-bot/bot');
  checkAndUpdateUserRole = botModule.checkAndUpdateUserRole;
  verifyFacebookConnection = botModule.verifyFacebookConnection;
  revokeFacebookVerification = botModule.revokeFacebookVerification;
} catch (error) {
  console.warn('Discord bot functions not available:', error);
}

const router = Router();

// Discord OAuth2 routes
router.get(
  '/auth/discord',
  passport.authenticate('discord', { scope: ['identify', 'email'] })
);

router.get(
  '/auth/discord/callback',
  passport.authenticate('discord', { failureRedirect: '/login' }),
  async (req, res) => {
    const user = (req as any).user;
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || '', {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    } as any);

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

    // Redirect to frontend with token
    res.redirect(
      `${process.env.CLIENT_URL}/auth/callback?token=${token}`
    );
  }
);

// OAuth2 route for checking Facebook connections (requires user authorization)
router.get(
  '/auth/discord/connections',
  (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = `${process.env.CLIENT_URL}/api/auth/connections/callback`;
    const scope = 'connections';
    
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}`;
    
    res.redirect(authUrl);
  }
);

// OAuth2 callback for connections
router.get(
  '/auth/connections/callback',
  async (req, res) => {
    try {
      const { code } = req.query;
      
      if (!code) {
        return res.status(400).json({ error: 'No authorization code provided' });
      }

      // Exchange code for access token
      const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: process.env.DISCORD_CLIENT_ID!,
          client_secret: process.env.DISCORD_CLIENT_SECRET!,
          grant_type: 'authorization_code',
          code: code as string,
          redirect_uri: `${process.env.CLIENT_URL}/api/auth/connections/callback`,
        }),
      });

      const tokenData = await tokenResponse.json() as any;
      
      if (!tokenData.access_token) {
        return res.status(400).json({ error: 'Failed to get access token' });
      }

      // Get user connections
      const connectionsResponse = await fetch('https://discord.com/api/users/@me/connections', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });

      const connections = await connectionsResponse.json() as any[];
      
      // Check for Facebook connection
      const hasFacebook = connections.some((conn: any) => conn.type === 'facebook');
      
                     if (hasFacebook) {
                 // Get user info to get Discord ID
                 const userResponse = await fetch('https://discord.com/api/users/@me', {
                   headers: {
                     Authorization: `Bearer ${tokenData.access_token}`,
                   },
                 });
                 
                 const userData = await userResponse.json() as any;
                 
                 // Verify Facebook connection for this user
                 if (verifyFacebookConnection) {
                   await verifyFacebookConnection(userData.id);
                 }
                 
                 // Redirect to success page
                 res.redirect(`${process.env.CLIENT_URL}/facebook-verification?status=success&message=${encodeURIComponent('Facebook connection verified! LEAGUE role awarded.')}`);
               } else {
                 // Redirect to error page
                 res.redirect(`${process.env.CLIENT_URL}/facebook-verification?status=error&message=${encodeURIComponent('No Facebook connection found. Please connect your Facebook to your Discord profile first.')}`);
               }
      
    } catch (error) {
      console.error('Error in connections callback:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Webhook endpoint to manually check a user's Facebook connection
router.post('/webhook/check-facebook', async (req, res) => {
  try {
    const { discordId } = req.body;
    
    if (!discordId) {
      return res.status(400).json({ error: 'Discord ID is required' });
    }
    
    if (!checkAndUpdateUserRole) {
      return res.status(503).json({ error: 'Discord bot not available' });
    }
    
    console.log(`Manual Facebook check requested for Discord user: ${discordId}`);
    await checkAndUpdateUserRole(discordId);
    
    res.json({ success: true, message: 'Facebook connection check completed' });
  } catch (error) {
    console.error('Error in Facebook check webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Webhook endpoint to verify a user's Facebook connection
router.post('/webhook/verify-facebook', async (req, res) => {
  try {
    const { discordId } = req.body;
    
    if (!discordId) {
      return res.status(400).json({ error: 'Discord ID is required' });
    }
    
    if (!verifyFacebookConnection) {
      return res.status(503).json({ error: 'Discord bot not available' });
    }
    
    console.log(`Facebook verification requested for Discord user: ${discordId}`);
    await verifyFacebookConnection(discordId);
    
    res.json({ success: true, message: 'Facebook connection verified and LEAGUE role awarded' });
  } catch (error) {
    console.error('Error in Facebook verification webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Webhook endpoint to revoke a user's Facebook verification
router.post('/webhook/revoke-facebook', async (req, res) => {
  try {
    const { discordId } = req.body;
    
    if (!discordId) {
      return res.status(400).json({ error: 'Discord ID is required' });
    }
    
    if (!revokeFacebookVerification) {
      return res.status(503).json({ error: 'Discord bot not available' });
    }
    
    console.log(`Facebook verification revocation requested for Discord user: ${discordId}`);
    await revokeFacebookVerification(discordId);
    
    res.json({ success: true, message: 'Facebook verification revoked and LEAGUE role removed' });
  } catch (error) {
    console.error('Error in Facebook revocation webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 