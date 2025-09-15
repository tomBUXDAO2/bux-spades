import { Request, Response } from 'express';
import { games } from '../../../gamesStore';
import { io } from '../../../index';
import prisma from '../../../lib/prisma';
import { AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { enrichGameForClient } from '../shared/gameUtils';

/**
 * Join a game
 */
export async function joinGame(req: Request, res: Response): Promise<void> {
  try {
    const game = games.find(g => g.id === req.params.id);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    if (game.status !== 'WAITING') {
      res.status(400).json({ error: 'Game is not waiting for players' });
      return;
    }

    const userId = (req as AuthenticatedRequest).user!.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, avatar: true }
    });

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Check if user is already in the game
    const existingPlayerIndex = game.players.findIndex(p => p && p.id === userId);
    if (existingPlayerIndex !== -1) {
      console.log(`[JOIN GAME] User ${userId} is already in game at seat ${existingPlayerIndex}`);
      res.json({
        success: true,
        game: enrichGameForClient(game),
        message: "Already in game"
      });
      return;
    }

    // Find first available seat
    const availableSeat = game.players.findIndex(p => p === null);
    if (availableSeat === -1) {
      res.status(400).json({ error: 'Game is full' });
      return;
    }

    // Add player to game
    game.players[availableSeat] = {
      id: userId,
      username: user.username,
      avatar: user.avatar,
      type: 'human',
      position: availableSeat,
      team: availableSeat % 2,
      bid: undefined,
      tricks: 0,
      points: 0,
      bags: 0
    };

    console.log('[JOIN GAME] Player joined:', {
      gameId: game.id,
      userId,
      username: user.username,
      seat: availableSeat
    });

    // Emit player joined event
    io.to(game.id).emit('player_joined', {
      gameId: game.id,
      player: {
        id: userId,
        username: user.username,
        avatar: user.avatar,
        position: availableSeat,
        team: availableSeat % 2
      }
    });

    res.json({
      success: true,
      game: enrichGameForClient(game)
    });

  } catch (error) {
    console.error('Error joining game:', error);
    res.status(500).json({ error: 'Failed to join game' });
  }
}
