import { Request, Response } from 'express';
import { games } from '../../../gamesStore';
import { enrichGameForClient } from '../shared/gameUtils';

/**
 * Get all games
 */
export async function getAllGames(req: Request, res: Response): Promise<void> {
  try {
    const validatedGames = games.filter(game => {
      const { validGames } = require('../../../lib/gameValidator').GameValidator.validateAllGames([game]);
      return validGames.length > 0;
    });

    const enrichedGames = validatedGames.map(game => enrichGameForClient(game));
    
    res.json({
      success: true,
      games: enrichedGames
    });
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
}

/**
 * Get specific game by ID
 */
export async function getGameById(req: Request, res: Response): Promise<void> {
  try {
    const game = games.find(g => g.id === req.params.id);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    res.json({
      success: true,
      game: enrichGameForClient(game)
    });
  } catch (error) {
    console.error('Error fetching game:', error);
    res.status(500).json({ error: 'Failed to fetch game' });
  }
}
