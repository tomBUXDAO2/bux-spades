import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../../../lib/prisma';

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
        // password: hashedPassword,
        avatarUrl: '/default-pfp.jpg',
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
