import { Request, Response } from 'express';
import { games } from '../../../gamesStore';
import { AuthenticatedRequest } from '../../../middleware/auth.middleware';
import prisma from '../../../lib/prisma';
export async function joinGame(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const gameId = req.params.id;
    const userId = req.user!.id;
    const { username, avatar, seat } = req.body; // Get from request body

    const game = games.find(g => g.id === gameId);
    // Check if user is already in another game (using database)
    const existingGamePlayer = await prisma.gamePlayer.findFirst({
      where: {
        userId: userId,
        Game: {
          status: {
            in: ["WAITING", "BIDDING", "PLAYING"]
          }
        }
      },
      include: {
        Game: true
      }
    });
    
    if (existingGamePlayer && existingGamePlayer.gameId !== gameId) {
      res.status(400).json({ error: `You are already in game ${existingGamePlayer.gameId}. Please leave that game first.` });
      return;
    }    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    // Check if user is already in the game
    const existingPlayerIndex = game.players.findIndex(p => p && p.id === userId);
    if (existingPlayerIndex !== -1) {
      res.json({ success: true, message: 'Already in game' });
      return;
    }


    // Use specific seat if provided, otherwise find empty seat
    let targetSeatIndex = seat;
    if (targetSeatIndex === undefined || targetSeatIndex === null) {
      targetSeatIndex = game.players.findIndex(p => p === null);
    }
    
    // Validate seat index
    if (targetSeatIndex < 0 || targetSeatIndex > 3) {
      res.status(400).json({ error: 'Invalid seat number' });
      return;
    }
    
    // Check if the specific seat is available
    if (game.players[targetSeatIndex] !== null) {
      res.status(400).json({ error: 'Seat is already occupied' });
      return;
    }

    // Add player to game
    game.players[targetSeatIndex] = {
      id: userId,
      username: username || 'Unknown Player',
      avatarUrl: avatar || '/default-avatar.jpg',
      type: 'human',
      seatIndex: targetSeatIndex,
      team: targetSeatIndex % 2,
      bid: undefined,
      tricks: 0,
      points: 0,
      bags: 0
    };

    res.json({ success: true, message: 'Joined game successfully' });
  } catch (error) {
    console.error('Error joining game:', error);
    res.status(500).json({ error: 'Failed to join game' });
  }
}
