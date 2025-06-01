import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';

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

    // Generate token
    const token = generateToken(user.id);

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

    console.error('Registration error:', error);
    res.status(500).json({
      message: 'Internal server error',
    });
  }
};

export const login = async (req: Request, res: Response) => {
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
    const token = generateToken(user.id);

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
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: 'Invalid input data',
        errors: error.errors,
      });
    }

    console.error('Login error:', error);
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

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        coins: user.coins,
        stats: user.stats,
      },
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

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        username,
        avatar,
      },
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
    console.error('Update profile error:', error);
    res.status(500).json({
      message: 'Internal server error',
    });
  }
}; 