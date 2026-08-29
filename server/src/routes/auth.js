import express from 'express';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import { prisma } from '../config/databaseFirst.js';
import { parsePwaDeviceId, storeHandoffToken, claimHandoffToken } from '../utils/oauthHandoff.js';

// NUCLEAR SOLUTION: Disable expensive database queries entirely
const DISABLE_EXPENSIVE_QUERIES = false;

const router = express.Router();

const CLIENT_URL = () => process.env.CLIENT_URL || 'https://www.bux-spades.pro';

async function redirectAfterOAuth(res, { state, jwtToken }) {
  const isCapacitor = state === 'capacitor';
  const pwaDeviceId = parsePwaDeviceId(state);

  if (isCapacitor) {
    return res.redirect(`buxspades://auth/callback?token=${jwtToken}`);
  }

  // Home-screen PWA: stash JWT under device id; PWA claims it when focused again.
  // Redirect browser to home (no interstitial page).
  if (pwaDeviceId) {
    await storeHandoffToken(pwaDeviceId, jwtToken);
    console.log(`[OAUTH HANDOFF] Stored token for device ${pwaDeviceId.slice(0, 8)}…`);
    return res.redirect(`${CLIENT_URL()}/`);
  }

  return res.redirect(`${CLIENT_URL()}/auth/callback?token=${jwtToken}`);
}

async function upsertFacebookUserAndIssueJwt(facebookUser) {
  const user = await prisma.user.upsert({
    where: { facebookId: facebookUser.id },
    update: {
      username: facebookUser.name || facebookUser.email || `Facebook User ${facebookUser.id}`,
      avatarUrl: facebookUser.picture?.data?.url || null,
    },
    create: {
      facebookId: facebookUser.id,
      username: facebookUser.name || facebookUser.email || `Facebook User ${facebookUser.id}`,
      avatarUrl: facebookUser.picture?.data?.url || null,
      coins: 5000000,
    }
  });

  const jwtToken = jwt.sign(
    { userId: user.id, facebookId: user.facebookId },
    process.env.JWT_SECRET || 'fallback-secret',
    { expiresIn: '7d' }
  );

  return { user, jwtToken };
}

/**
 * In-app Facebook login for Android PWAs (JS SDK access token).
 * Avoids OAuth redirect breakout that cannot return into the installed app.
 */
router.post('/facebook/token', async (req, res) => {
  try {
    const accessToken = String(req.body?.accessToken || '').trim();
    if (!accessToken) {
      return res.status(400).json({ error: 'Missing Facebook access token' });
    }

    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    if (!appId || !appSecret) {
      return res.status(503).json({ error: 'Facebook login is not configured' });
    }

    // Confirm token is for our app
    const debugRes = await fetch(
      `https://graph.facebook.com/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(`${appId}|${appSecret}`)}`
    );
    if (!debugRes.ok) {
      return res.status(401).json({ error: 'Invalid Facebook token' });
    }
    const debugJson = await debugRes.json();
    const data = debugJson?.data;
    if (!data?.is_valid || String(data.app_id) !== String(appId)) {
      return res.status(401).json({ error: 'Facebook token is not valid for this app' });
    }

    const userRes = await fetch(
      `https://graph.facebook.com/v18.0/me?fields=id,name,picture.type(large)&access_token=${encodeURIComponent(accessToken)}`
    );
    if (!userRes.ok) {
      return res.status(401).json({ error: 'Failed to fetch Facebook profile' });
    }
    const facebookUser = await userRes.json();
    if (!facebookUser?.id) {
      return res.status(401).json({ error: 'Facebook profile missing id' });
    }

    const { user, jwtToken } = await upsertFacebookUserAndIssueJwt(facebookUser);
    res.json({
      token: jwtToken,
      user: {
        id: user.id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        facebookId: user.facebookId,
        coins: user.coins,
        isAuthenticated: true
      }
    });
  } catch (error) {
    console.error('[FACEBOOK TOKEN] Error:', error);
    res.status(500).json({ error: 'Facebook login failed' });
  }
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret', (err, decoded) => {
    if (err) {
      console.error('[AUTH] Token verification error:', {
        name: err.name,
        message: err.message,
        expiredAt: err.expiredAt,
        jwtSecretSet: !!process.env.JWT_SECRET
      });
      
      let errorMessage = 'Invalid or expired token';
      if (err.name === 'TokenExpiredError') {
        errorMessage = 'Token expired';
      } else if (err.name === 'JsonWebTokenError') {
        errorMessage = `Invalid token: ${err.message}`;
      }
      
      return res.status(403).json({ error: errorMessage });
    }
    req.userId = decoded.userId;
    next();
  });
};

// Get user profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        discordId: user.discordId,
        facebookId: user.facebookId,
        username: user.username,
        avatarUrl: user.avatarUrl,
        coins: user.coins || 1000,
        level: 1,
        wins: 0,
        losses: 0
      }
    });
  } catch (error) {
    console.error('[AUTH] Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Verify token endpoint
router.get('/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, userId: req.userId });
});

// Get all users (for chat player list)
router.get('/users', authenticateToken, async (req, res) => {
  try {
    if (DISABLE_EXPENSIVE_QUERIES) {
      console.log('[AUTH] NUCLEAR: Returning empty users list to prevent database queries');
      return res.json({ users: [] });
    }
    
    const currentUserId = req.userId;
    
    // Get all users with their friend/block status relative to current user
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        coins: true,
        createdAt: true
      },
      orderBy: {
        username: 'asc'
      }
    });

    // Get friend relationships for current user
    const friends = await prisma.friend.findMany({
      where: { userId: currentUserId },
      select: { friendId: true }
    });
    
    // Get blocked users for current user
    const blocked = await prisma.blockedUser.findMany({
      where: { userId: currentUserId },
      select: { blockedId: true }
    });

    const friendIds = new Set(friends.map(f => f.friendId));
    const blockedIds = new Set(blocked.map(b => b.blockedId));

    // Add status to each user
    const usersWithStatus = users.map(user => ({
      ...user,
      status: friendIds.has(user.id) ? 'friend' : 
              blockedIds.has(user.id) ? 'blocked' : 'not_friend'
    }));

    res.json({ users: usersWithStatus });
  } catch (error) {
    console.error('[AUTH] Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get friends list
router.get('/friends', authenticateToken, async (req, res) => {
  try {
    if (DISABLE_EXPENSIVE_QUERIES) {
      console.log('[AUTH] NUCLEAR: Returning empty friends list to prevent database queries');
      return res.json([]);
    }
    
    const currentUserId = req.userId;
    
    const friends = await prisma.friend.findMany({
      where: { userId: currentUserId },
      include: {
        friend: {
          select: {
            id: true,
            username: true,
            avatarUrl: true
          }
        }
      }
    });

    const result = friends.map(f => f.friend);
    res.json(result);
  } catch (error) {
    console.error('[AUTH] Error fetching friends:', error);
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

// Get blocked users list
router.get('/blocked', authenticateToken, async (req, res) => {
  try {
    if (DISABLE_EXPENSIVE_QUERIES) {
      console.log('[AUTH] NUCLEAR: Returning empty blocked users list to prevent database queries');
      return res.json([]);
    }
    
    const currentUserId = req.userId;
    
    const blocked = await prisma.blockedUser.findMany({
      where: { userId: currentUserId },
      include: {
        blocked: {
          select: {
            id: true,
            username: true,
            avatarUrl: true
          }
        }
      }
    });

    const result = blocked.map(b => b.blocked);
    res.json(result);
  } catch (error) {
    console.error('[AUTH] Error fetching blocked users:', error);
    res.status(500).json({ error: 'Failed to fetch blocked users' });
  }
});

// One-time claim for PWA OAuth handoff (device id created in the installed app before redirect)
router.get('/handoff/claim', async (req, res) => {
  try {
    const deviceId = String(req.query.deviceId || '').trim();
    if (!deviceId || deviceId.length < 8 || deviceId.length > 80) {
      return res.status(400).json({ error: 'Invalid device id' });
    }
    const token = await claimHandoffToken(deviceId);
    if (!token) {
      return res.status(404).json({ error: 'No pending login' });
    }
    res.json({ token });
  } catch (error) {
    console.error('[OAUTH HANDOFF] Claim error:', error);
    res.status(500).json({ error: 'Failed to claim login' });
  }
});

// Facebook OAuth callback
router.get('/facebook/callback', async (req, res) => {
  try {
    const { code, error, state } = req.query;
    const isCapacitor = state === 'capacitor';

    if (error) {
      console.error('[FACEBOOK OAUTH] Authorization error:', error);
      const loginUrl = isCapacitor ? 'buxspades://auth/callback?error=authorization_failed' : `${CLIENT_URL()}/?signin=1&error=authorization_failed`;
      return res.redirect(loginUrl);
    }

    if (!code) {
      return res.status(400).send('Missing authorization code');
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://graph.facebook.com/v18.0/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.FACEBOOK_APP_ID,
        client_secret: process.env.FACEBOOK_APP_SECRET,
        redirect_uri: `${process.env.SERVER_URL || 'https://bux-spades-server.fly.dev'}/api/auth/facebook/callback`,
        code: code
      })
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Get user info from Facebook
    const userResponse = await fetch(`https://graph.facebook.com/v18.0/me?fields=id,name,picture.type(large)&access_token=${accessToken}`);

    if (!userResponse.ok) {
      throw new Error('Failed to get user info');
    }

    const facebookUser = await userResponse.json();

    const { jwtToken } = await upsertFacebookUserAndIssueJwt(facebookUser);
    await redirectAfterOAuth(res, { state, jwtToken });

  } catch (error) {
    console.error('[FACEBOOK OAUTH] Error in callback:', error);
    const isCapacitor = req.query?.state === 'capacitor';
    const loginUrl = isCapacitor ? 'buxspades://auth/callback?error=oauth_error' : `${CLIENT_URL()}/?signin=1&error=oauth_error`;
    res.redirect(loginUrl);
  }
});

// Discord OAuth callback (original working version)
router.get('/discord/callback', async (req, res) => {
  try {
    const { code, error, state } = req.query;
    const isCapacitor = state === 'capacitor';

    if (error) {
      console.error('[DISCORD OAUTH] Authorization error:', error);
      const loginUrl = isCapacitor ? 'buxspades://auth/callback?error=authorization_failed' : `${CLIENT_URL()}/?signin=1&error=authorization_failed`;
      return res.redirect(loginUrl);
    }

    if (!code) {
      return res.status(400).send('Missing authorization code');
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: `${process.env.SERVER_URL || 'https://bux-spades-server.fly.dev'}/api/auth/discord/callback`,
        scope: 'identify email'
      })
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Get user info from Discord
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!userResponse.ok) {
      throw new Error('Failed to get user info');
    }

    const discordUser = await userResponse.json();

    // Create or update user in database
    const user = await prisma.user.upsert({
      where: { discordId: discordUser.id },
      update: {
        username: discordUser.global_name || discordUser.username,
        avatarUrl: discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : null,
      },
      create: {
        discordId: discordUser.id,
        username: discordUser.global_name || discordUser.username,
        avatarUrl: discordUser.avatar ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png` : null,
        coins: 5000000, // Starting coins
      }
    });

    // Create JWT token
    const jwtToken = jwt.sign(
      { userId: user.id, discordId: user.discordId },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );

    await redirectAfterOAuth(res, { state, jwtToken });

  } catch (error) {
    console.error('[DISCORD OAUTH] Error in callback:', error);
    const isCapacitor = req.query?.state === 'capacitor';
    const loginUrl = isCapacitor ? 'buxspades://auth/callback?error=oauth_error' : `${CLIENT_URL()}/?signin=1&error=oauth_error`;
    res.redirect(loginUrl);
  }
});

export { router as authRoutes };
