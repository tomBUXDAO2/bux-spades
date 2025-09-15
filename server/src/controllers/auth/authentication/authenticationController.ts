import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../../../lib/prisma';

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

    // Generate JWT token
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const token = jwt.sign({ userId: user.id }, secret, { expiresIn: '24h' });

    // Check for active game
    const activeGame = await prisma.game.findFirst({
      where: {
        GamePlayer: {
          some: {
            userId: user.id
          }
        },
        status: {
          in: ['WAITING', 'PLAYING']
        }
      },
      select: {
        id: true,
        status: true
      }
    });

      res.json({ 
        message: 'Login successful',
      token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          discordId: user.discordId,
          avatar: user.avatar,
          coins: user.coins
      },
      activeGame
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const logout = (req: Request, res: Response) => {
  // With JWT, we don't need to do anything server-side for logout
  // The client should remove the token
    res.json({ message: 'Logout successful' });
};
