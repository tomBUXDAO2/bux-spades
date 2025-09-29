import { Request, Response } from 'express';
import { prisma } from '../../../lib/prisma';

export const updateSoundPreference = async (req: Request, res: Response) => {
  try {
    const { soundEnabled } = req.body;
    const userId = (req as any).user.id;

    // Update user's sound preference in the database
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { soundEnabled },
      select: {
        id: true,
        username: true,
        // email: true,
        avatarUrl: true,
        coins: true,
        soundEnabled: true
      }
    });

    res.json({
      success: true,
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating sound preference:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
