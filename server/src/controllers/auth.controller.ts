import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';

export const register = async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { username },
          { email }
        ]
      }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const now = new Date();
    const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const user = await prisma.user.create({
      data: {
        id: userId,
        username,
        email,
        password: hashedPassword,
        avatar: '/default-pfp.jpg',
        coins: 5000000,
        createdAt: now,
        updatedAt: now
      } as any
    });

    // Create user stats
    const statsId = `stats_${userId}_${Date.now()}`;
    await prisma.userStats.create({
      data: {
        id: statsId,
        userId: userId,
        createdAt: now,
        updatedAt: now
      } as any
    });

    res.status(201).json({ message: 'User created successfully', userId: user.id });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    // Find user
    const user = await prisma.user.findFirst({
      where: { username },
      include: { UserStats: true }
    });

    if (!user || !user.UserStats) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const stats = user.UserStats as any;

    // Check password
    if (!user.password || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Set session
    req.login(user, (err) => {
      if (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Internal server error' });
      }
      res.json({ 
        message: 'Login successful',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          discordId: user.discordId,
          avatar: user.avatar,
          coins: user.coins
        }
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const logout = (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
    res.json({ message: 'Logout successful' });
  });
};

export const getProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const user = await prisma.user.findUnique({
      where: { id: (req.user as any).id },
      include: { UserStats: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const stats = user.UserStats as any;

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        discordId: user.discordId,
        avatar: user.avatar,
        coins: user.coins,
        stats: {
          gamesPlayed: stats?.gamesPlayed || 0,
          gamesWon: stats?.gamesWon || 0,
          nilsBid: stats?.nilsBid || 0,
          nilsMade: stats?.nilsMade || 0,
          blindNilsBid: stats?.blindNilsBid || 0,
          blindNilsMade: stats?.blindNilsMade || 0,
          totalBags: stats?.totalBags || 0,
          bagsPerGame: stats?.bagsPerGame || 0
        }
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { username, email, avatar } = req.body;
    const userId = (req.user as any).id;

    // Check if username is already taken
    if (username) {
      const existingUser = await prisma.user.findFirst({
        where: {
          username,
          NOT: { id: userId }
        }
      });

      if (existingUser) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(username && { username }),
        ...(email && { email }),
        ...(avatar && { avatar }),
        updatedAt: new Date()
      }
    });

    res.json({ 
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        discordId: updatedUser.discordId,
        avatar: updatedUser.avatar,
        coins: updatedUser.coins
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}; 