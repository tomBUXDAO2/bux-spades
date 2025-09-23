import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prismaNew } from '../../../newdb/client';

export const login = async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    // Authenticate against NEW DB only
    const user = await prismaNew.user.findFirst({
      where: { username }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // For now, we'll skip password validation since new DB doesn't have passwords
    // TODO: Implement proper password handling in new DB schema
    console.log('[LOGIN] User found in new DB:', user.username);

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const token = jwt.sign({ userId: user.id }, secret, { expiresIn: '24h' });

    // Active game lookup from NEW DB only - simplified for now
    let activeGame = null;
    try {
      const activeGamePlayer = await prismaNew.gamePlayer.findFirst({
        where: { 
          userId: user.id,
          leftAt: null // Still active in game
        }
      });

      if (activeGamePlayer) {
        const game = await prismaNew.game.findUnique({
          where: { id: activeGamePlayer.gameId },
          select: { id: true, status: true }
        });

        if (game && (game.status === 'WAITING' || game.status === 'BIDDING' || game.status === 'PLAYING')) {
          activeGame = game;
        }
      }
    } catch (error) {
      console.error('[LOGIN] Error fetching active game:', error);
    }

    res.json({ 
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: null, // Not in new schema yet
        discordId: user.discordId,
        avatar: user.avatarUrl,
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
