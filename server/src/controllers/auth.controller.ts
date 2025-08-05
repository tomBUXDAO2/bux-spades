import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { games } from '../gamesStore';
import type { Game } from '../types/game';

const prisma = new PrismaClient();

// Validation schemas
const registerSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// JWT token generation
const generateToken = (userId: string): string => {
  return jwt.sign({ userId }, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

export const register = async (req: Request, res: Response) => {
  console.log('Register endpoint hit', req.body); // Log when register is hit
  try {
    const { username, email, password } = registerSchema.parse(req.body);

    // Check if user already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { username },
        ],
      },
    });

    if (existingUser) {
      return res.status(400).json({
        message: 'User with this email or username already exists',
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with default avatar
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        avatar: '/default-pfp.jpg',
        coins: 5000000, // 5 million coins
      },
    });

    // Create user stats
    const stats = await prisma.userStats.create({
      data: {
        userId: user.id,
      },
    });

    // @ts-ignore
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET as any, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        coins: user.coins,
        stats: stats,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: 'Invalid input data',
        errors: error.errors,
      });
    }
    console.error('Registration error:', error); // Log all errors
    res.status(500).json({
      message: 'Internal server error',
    });
  }
};

export const login = async (req: Request, res: Response) => {
  console.log('Login endpoint hit', req.body); // Log when login is hit
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Find user with stats
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        stats: true,
      },
    });

    if (!user || !user.password) {
      return res.status(401).json({
        message: 'Invalid email or password',
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({
        message: 'Invalid email or password',
      });
    }

    // Generate token
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || '', {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    } as any);

    // Check if user is in an active game
    console.log('[ACTIVE GAME DEBUG] Checking for active games for user:', user.id);
    console.log('[ACTIVE GAME DEBUG] Available games:', games.map(g => ({ 
      id: g.id, 
      status: g.status, 
      players: g.players.map(p => p ? { id: p.id, type: p.type } : null)
    })));
    
    const activeGame = games.find((game: Game) => {
      const isPlayer = game.players.some((player: any) => 
        player && player.id === user.id && player.type === 'human'
      );
      const isActiveGame = game.status === 'BIDDING' || game.status === 'PLAYING' || game.status === 'HAND_COMPLETED';
      
      console.log(`[ACTIVE GAME DEBUG] Game ${game.id}: isPlayer=${isPlayer}, status=${game.status}, isActiveGame=${isActiveGame}`);
      
      return isPlayer && isActiveGame;
    });
    
    console.log('[ACTIVE GAME DEBUG] Found active game:', activeGame ? { id: activeGame.id, status: activeGame.status } : null);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        coins: user.coins,
        stats: user.stats,
      },
      activeGame: activeGame ? {
        id: activeGame.id,
        status: activeGame.status
      } : null,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: 'Invalid input data',
        errors: error.errors,
      });
    }
    console.error('Login error:', error); // Log all errors
    res.status(500).json({
      message: 'Internal server error',
    });
  }
};

export const getProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        stats: true,
      },
    });

    if (!user) {
      return res.status(404).json({
        message: 'User not found',
      });
    }

    // Check if user is in an active game
    console.log('[ACTIVE GAME DEBUG] Checking for active games for user in getProfile:', userId);
    console.log('[ACTIVE GAME DEBUG] Available games:', games.map(g => ({ 
      id: g.id, 
      status: g.status, 
      players: g.players.map(p => p ? { id: p.id, type: p.type } : null)
    })));
    
    const activeGame = games.find((game: Game) => {
      const isPlayer = game.players.some((player: any) => 
        player && player.id === userId && player.type === 'human'
      );
      const isActiveGame = game.status === 'BIDDING' || game.status === 'PLAYING' || game.status === 'HAND_COMPLETED';
      
      console.log(`[ACTIVE GAME DEBUG] Game ${game.id}: isPlayer=${isPlayer}, status=${game.status}, isActiveGame=${isActiveGame}`);
      
      return isPlayer && isActiveGame;
    });
    
    console.log('[ACTIVE GAME DEBUG] Found active game in getProfile:', activeGame ? { id: activeGame.id, status: activeGame.status } : null);

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        coins: user.coins,
        stats: user.stats,
      },
      activeGame: activeGame ? {
        id: activeGame.id,
        status: activeGame.status
      } : null,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      message: 'Internal server error',
    });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { username, avatar } = req.body;

    console.log('[SERVER DEBUG] Profile update request:', { 
      userId, 
      username, 
      avatarLength: avatar ? avatar.length : 0,
      hasAvatar: !!avatar 
    });

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        username,
        avatar,
      },
    });

    console.log('[SERVER DEBUG] Profile update successful:', { 
      userId: user.id, 
      username: user.username, 
      avatar: user.avatar 
    });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        coins: user.coins,
      },
    });
  } catch (error) {
    console.error('[SERVER DEBUG] Update profile error:', error);
    res.status(500).json({
      message: 'Internal server error',
    });
  }
}; 