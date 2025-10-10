import express from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/databaseFirst.js';

// NUCLEAR SOLUTION: Disable expensive database queries entirely
const DISABLE_EXPENSIVE_QUERIES = false;

const router = express.Router();

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret', (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
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

// Discord OAuth callback for standard login
router.get('/discord/callback', async (req, res) => {
  try {
    const { code, error } = req.query;

    if (error) {
      console.error('[DISCORD AUTH] Authorization error:', error);
      return res.redirect(`${process.env.CLIENT_URL || 'https://www.bux-spades.pro'}/login?error=authorization_failed`);
    }

    if (!code) {
      return res.redirect(`${process.env.CLIENT_URL || 'https://www.bux-spades.pro'}/login?error=missing_code`);
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
        redirect_uri: `${process.env.CLIENT_URL || 'https://bux-spades-server.fly.dev'}/api/auth/discord/callback`,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Get user info
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      throw new Error('Failed to fetch user info');
    }

    const discordUser = await userResponse.json();
    console.log(`[DISCORD AUTH] User ${discordUser.username} (${discordUser.id}) logged in`);

    // Check if user exists in database
    let user = await prisma.user.findUnique({
      where: { discordId: discordUser.id }
    });

    const avatarUrl = discordUser.avatar 
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : '/default-pfp.jpg';

    if (!user) {
      // Create new user
      user = await prisma.user.create({
        data: {
          discordId: discordUser.id,
          username: discordUser.global_name || discordUser.username,
          avatarUrl: avatarUrl,
          coins: 1000,
        }
      });
      console.log(`[DISCORD AUTH] Created new user: ${user.username}`);
    } else {
      // Update existing user
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          username: discordUser.global_name || discordUser.username,
          avatarUrl: avatarUrl,
        }
      });
      console.log(`[DISCORD AUTH] Updated existing user: ${user.username}`);
    }

    // Create JWT token
    const jwtToken = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '7d' }
    );

    // Redirect to client with token
    res.redirect(`${process.env.CLIENT_URL || 'https://www.bux-spades.pro'}/auth/callback?token=${jwtToken}`);

  } catch (error) {
    console.error('[DISCORD AUTH] Error in callback:', error);
    res.redirect(`${process.env.CLIENT_URL || 'https://www.bux-spades.pro'}/login?error=server_error`);
  }
});

export { router as authRoutes };
