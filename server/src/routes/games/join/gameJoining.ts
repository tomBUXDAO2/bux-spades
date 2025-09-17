import { Request, Response } from 'express';
import { games } from '../../../gamesStore';
import { AuthenticatedRequest } from '../../../middleware/auth.middleware';

export async function joinGame(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const gameId = req.params.id;
    const userId = req.user!.id;
    const username = req.user!.username;
    const avatar = req.user!.avatar;

    const game = games.find(g => g.id === gameId);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    // Check if user is already in the game
    const existingPlayerIndex = game.players.findIndex(p => p && p.id === userId);
    if (existingPlayerIndex !== -1) {
      res.json({ success: true, message: 'Already in game' });
      return;
    }

    // Check if user is in another game
    for (const [otherGameId, otherGame] of games.entries()) {
      if (otherGameId !== gameId && otherGame.players.some(p => p && p.id === userId)) {
        res.status(400).json({ error: 'You are already in another game' });
        return;
      }
    }

    // Find an empty seat
    const emptySeatIndex = game.players.findIndex(p => p === null);
    if (emptySeatIndex === -1) {
      res.status(400).json({ error: 'Game is full' });
      return;
    }

    // Add player to game
    game.players[emptySeatIndex] = {
      id: userId,
      username: username || 'Unknown Player',
      avatar: avatar || '/default-avatar.jpg',
      type: 'human',
      position: emptySeatIndex,
      team: emptySeatIndex % 2,
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
