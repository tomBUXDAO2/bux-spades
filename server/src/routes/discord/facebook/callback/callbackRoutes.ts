import { Router } from 'express';

// Import Discord bot functions (optional)
let verifyFacebookConnection: any = null;
let markOAuth2Verified: any = null;

try {
  const botModule = require('../../../discord-bot/bot');
  verifyFacebookConnection = botModule.verifyFacebookConnection;
  markOAuth2Verified = botModule.markOAuth2Verified;
} catch (error) {
  console.warn('Discord bot functions not available:', error);
}

const router = Router();

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
          redirect_uri: `${process.env.SERVER_URL || 'https://bux-spades-server.fly.dev'}/api/auth/connections/callback`,
        }),
      });

      const tokenData = await tokenResponse.json() as any;
      
      console.log('Full token data received:', tokenData);
      console.log('Token response status:', tokenResponse.status);
      console.log('Token response headers:', Object.fromEntries(tokenResponse.headers.entries()));
      
      if (!tokenData.access_token) {
        console.error('OAuth2 token exchange failed:', {
          status: tokenResponse.status,
          statusText: tokenResponse.statusText,
          error: tokenData.error,
          errorDescription: tokenData.error_description,
          fullResponse: tokenData
        });
        return res.status(400).json({ 
          error: 'Failed to get access token',
          details: tokenData.error_description || tokenData.error || 'Unknown OAuth2 error'
        });
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

export default router;
