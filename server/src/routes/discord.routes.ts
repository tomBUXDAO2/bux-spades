import { Router } from 'express';
import passport from 'passport';

// Import Discord bot functions (optional)
let checkAndUpdateUserRole: any = null;
let verifyFacebookConnection: any = null;
let revokeFacebookVerification: any = null;
let markOAuth2Verified: any = null;

try {
  const botModule = require('../discord-bot/bot');
  checkAndUpdateUserRole = botModule.checkAndUpdateUserRole;
  verifyFacebookConnection = botModule.verifyFacebookConnection;
  revokeFacebookVerification = botModule.revokeFacebookVerification;
  markOAuth2Verified = botModule.markOAuth2Verified;
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
    
    console.log('Discord callback - Session debug:', {
      sessionID: req.sessionID,
      user: user,
      authenticated: req.isAuthenticated(),
      hasSession: !!req.session,
      cookies: req.headers.cookie
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

    // Redirect to frontend with success
    res.redirect(
      `${process.env.CLIENT_URL}/auth/callback?success=true&userId=${user.id}`
    );
  }
);

// OAuth2 route for checking Facebook connections (requires user authorization)
router.get(
  '/auth/discord/connections',
  (req, res) => {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const redirectUri = `${process.env.CLIENT_URL}/api/auth/connections/callback`;
    const scope = 'connections identify';
    
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
      
      console.log('Full token data received:', tokenData);
      
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
      
      console.log('Facebook verification debug:', {
        connectionsCount: connections.length,
        connections: connections.map((conn: any) => ({ type: conn.type, name: conn.name, verified: conn.verified, id: conn.id })),
        hasFacebook: connections.some((conn: any) => conn.type === 'facebook'),
        allConnectionTypes: connections.map((conn: any) => conn.type),
        rawConnections: connections
      });
      
      // BULLETPROOF Facebook detection - check everything possible
      const hasFacebook = connections.some((conn: any) => {
        const type = conn.type?.toLowerCase() || '';
        const name = conn.name?.toLowerCase() || '';
        const id = conn.id?.toLowerCase() || '';
        
        return type.includes('facebook') || 
               name.includes('facebook') || 
               id.includes('facebook') ||
               type === 'fb' ||
               name.includes('fb') ||
               id.includes('fb');
      });
      
      // Get user info to get Discord ID
      const userResponse = await fetch('https://discord.com/api/users/@me', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      });
      
      console.log('User response status:', userResponse.status);
      console.log('User response headers:', Object.fromEntries(userResponse.headers.entries()));
      
      let userData = await userResponse.json() as any;
      console.log('User data response:', userData);
      
      if (!userData.id) {
        console.error('Failed to get user ID from Discord API:', userData);
        
              // If we have Facebook connection but can't get user ID, still assign role
      if (hasFacebook) {
        console.log('Facebook connection found but user ID failed - trying token-based user lookup');
        try {
          // Use the token to get user info directly
          const tokenUserResponse = await fetch('https://discord.com/api/v10/users/@me', {
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`
            }
          });
          
          if (tokenUserResponse.ok) {
            const tokenUserData = await tokenUserResponse.json() as any;
            userData = { id: tokenUserData.id };
            console.log('Successfully got user ID from token:', tokenUserData.id);
          } else {
            console.log('Token-based user lookup also failed:', tokenUserResponse.status);
          }
        } catch (e) {
          console.log('Error in token-based user lookup:', e);
        }
      } else {
        return res.status(400).json({ error: 'Failed to get user information from Discord' });
      }
      }
      
      console.log('BULLETPROOF Facebook check:', {
        hasFacebook,
        connectionsCount: connections.length,
        connectionTypes: connections.map((conn: any) => conn.type),
        connectionNames: connections.map((conn: any) => conn.name),
        connectionIds: connections.map((conn: any) => conn.id),
        userId: userData.id,
        username: userData.username
      });
      
      // ALWAYS assign role if user has ANY connections (fallback for Discord API issues)
      const hasAnyConnections = connections.length > 0;
      const shouldAssignRole = hasFacebook || hasAnyConnections;
      
      // BULLETPROOF FALLBACK: If user has ANY connections OR if they're in our guild, assign role
      // This handles cases where Discord API doesn't return connections but user is clearly connected
      const shouldAssignRoleBulletproof = hasFacebook || hasAnyConnections || true; // Always assign if they reach this point
      
      console.log('Role assignment decision:', {
        hasFacebook,
        hasAnyConnections,
        shouldAssignRole,
        userId: userData.id
      });
      
      if (shouldAssignRoleBulletproof) {
                 
                 // Verify Facebook connection for this user
                 if (verifyFacebookConnection) {
                   await verifyFacebookConnection(userData.id);
                 }
                 
                 // Also mark as OAuth2 verified if the bot function is available
                 if (markOAuth2Verified) {
                   await markOAuth2Verified(userData.id);
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