import { Request, Response } from 'express';
import { games } from '../../../gamesStore';
import { enrichGameForClient } from '../shared/gameUtils';

/**
 * Get all games
 */
export async function getAllGames(req: Request, res: Response): Promise<void> {
  try {
    const allGames = games;
    const validatedGames = allGames.filter(game => {
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
    res.status(500).json({
      success: false,
      error: 'Failed to fetch games'
    });
  }
}

/**
 * Get a specific game by ID
 */
export async function getGameById(req: Request, res: Response): Promise<void> {
  try {
    const game = games.find(g => g.id === req.params.id);
    
    if (!game) {
      res.status(404).json({
        success: false,
        error: 'Game not found'
      });
      return;
    }

    const enrichedGame = enrichGameForClient(game);
    
    res.json({
      success: true,
      game: enrichedGame
    });
  } catch (error) {
    console.error('Error fetching game:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch game'
    });
  }
}
