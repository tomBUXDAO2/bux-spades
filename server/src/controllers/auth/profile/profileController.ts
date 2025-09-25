import { Request, Response } from 'express';
import { prisma } from '../../../lib/prisma';

export const getProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Use NEW DB only
    const userNew = await prisma.user.findUnique({
      where: { id: (req.user as any).id }
    });

    if (!userNew) {
      return res.status(404).json({ error: 'User not found' });
    }

    return res.json({
      user: {
        id: userNew.id,
        username: userNew.username,
        // email: null, // Not in new schema yet
        discordId: userNew.discordId,
        avatarUrl: userNew.avatarUrl,
        coins: userNew.coins,
        stats: {} // Will be populated from UserStatsBreakdown later
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

    const { username, email, avatar, soundEnabled } = req.body;
    const userId = (req.user as any).id;

    // Check if username is already taken (if updating username)
    if (username) {
      const existingUser = await prisma.user.findFirst({
        where: { 
          username, 
          id: { not: userId }
        }
      });

      if (existingUser) {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    // Update user in NEW DB
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(username && { username }),
        ...(avatar && { avatarUrl: avatar }),
        ...(typeof soundEnabled === 'boolean' && { soundEnabled })
        // Note: email not in new schema yet
      }
    });

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        // email: null, // Not in new schema yet
        discordId: updatedUser.discordId,
        avatarUrl: updatedUser.avatarUrl,
        coins: updatedUser.coins
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
