import { Request, Response } from 'express';
import { prisma } from '../../../lib/prisma';

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
