import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { games } from '../gamesStore';
import type { Game } from '../types/game';


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
  return jwt.sign({ userId }, process.env.JWT_SECRET || '', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  } as any);
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
    const token = generateToken(user.id);

    // Check if user is in an active game
    console.log('[ACTIVE GAME DEBUG] Checking for active games for user:', user.id);
    console.log('[ACTIVE GAME DEBUG] User details:', {
      id: user.id,
      username: user.username,
      discordId: user.discordId
    });
    console.log('[ACTIVE GAME DEBUG] Available games:', games.map(g => ({ 
      id: g.id, 
      status: g.status, 
      league: (g as any).league,
      players: g.players.map(p => p ? { id: p.id, username: p.username, type: p.type } : null)
    })));
    
    const activeGame = games.find((game: Game) => {
      const isPlayer = game.players.some((player: any) => 
        player && player.id === user.id && player.type === 'human'
      );
      const isLeagueGame = (game as any).league;
      const isActiveGame = game.status === 'BIDDING' || game.status === 'PLAYING' || game.status === 'HAND_COMPLETED';
      const isLeagueGameWaiting = isLeagueGame && game.status === 'WAITING';
      
      console.log(`[ACTIVE GAME DEBUG] Game ${game.id}: isPlayer=${isPlayer}, status=${game.status}, isLeagueGame=${isLeagueGame}, isActiveGame=${isActiveGame}, isLeagueGameWaiting=${isLeagueGameWaiting}`);
      console.log(`[ACTIVE GAME DEBUG] Game ${game.id} players:`, game.players.map(p => p ? { id: p.id, username: p.username, type: p.type } : null));
      
      // GAIL DEBUG: Special logging for league games to help identify user mismatches
      if (isLeagueGame && game.status === 'WAITING') {
        console.log(`[GAIL DEBUG] League game ${game.id} - Checking user matching:`);
        console.log(`[GAIL DEBUG] Current user:`, { id: user.id, username: user.username, discordId: user.discordId });
        console.log(`[GAIL DEBUG] Game players:`, game.players.map(p => p ? { id: p.id, username: p.username, type: p.type } : null));
        
        // Check if any player has a similar username (case-insensitive)
        const similarUsername = game.players.find(p => p && p.username.toLowerCase() === user.username.toLowerCase());
        if (similarUsername) {
          console.log(`[GAIL DEBUG] Found similar username but different ID:`, {
            gamePlayer: { id: similarUsername.id, username: similarUsername.username },
            currentUser: { id: user.id, username: user.username }
          });
        }
      }
      
      return isPlayer && (isActiveGame || isLeagueGameWaiting);
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
    const userId = (req as any).user.id;

    let user = await prisma.user.findUnique({
      where: { id: userId },
      include: { stats: true },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Refresh avatar from Discord if missing/default and discordId exists
    if (user.discordId && (!user.avatar || user.avatar === '/default-pfp.jpg')) {
      try {
        const token = process.env.DISCORD_BOT_TOKEN;
        if (token) {
          // @ts-ignore Node 18+ has global fetch
          const resp = await fetch(`https://discord.com/api/v10/users/${user.discordId}`, {
            headers: { Authorization: `Bot ${token}` }
          });
          if (resp.ok) {
            const du: any = await resp.json();
            if (du.avatar) {
              const avatarUrl = `https://cdn.discordapp.com/avatars/${user.discordId}/${du.avatar}.png`;
              user = await prisma.user.update({ where: { id: user.id }, data: { avatar: avatarUrl }, include: { stats: true } });
              console.log('[PROFILE] Refreshed avatar from Discord for', user.username);
            }
          } else {
            console.log('[PROFILE] Discord fetch failed', resp.status);
          }
        }
      } catch (e) {
        console.log('[PROFILE] Discord avatar refresh error', (e as any)?.message);
      }
    }

    // Check active game
    const activeGame = games.find((game: Game) => {
      const isPlayer = game.players.some((player: any) => player && player.id === userId && player.type === 'human');
      const isLeagueGame = (game as any).league;
      const isActiveGame = game.status === 'BIDDING' || game.status === 'PLAYING' || game.status === 'HAND_COMPLETED';
      const isLeagueGameWaiting = isLeagueGame && game.status === 'WAITING';
      return isPlayer && (isActiveGame || isLeagueGameWaiting);
    });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        avatar: user.avatar,
        coins: user.coins,
        stats: user.stats,
      },
      activeGame: activeGame ? { id: activeGame.id, status: activeGame.status } : null,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { username, avatar } = req.body;

    console.log('[SERVER DEBUG] Profile update request:', { userId, username, avatarLength: avatar ? avatar.length : 0, hasAvatar: !!avatar });

    const user = await prisma.user.update({
      where: { id: userId },
      data: { username, avatar },
    });

    console.log('[SERVER DEBUG] Profile update successful:', { userId: user.id, username: user.username, avatar: user.avatar });

    res.json({ user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar, coins: user.coins } });
  } catch (error) {
    console.error('[SERVER DEBUG] Update profile error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}; 