import { Request, Response } from 'express';
import { prisma } from '../../../lib/prisma';

export async function getAllGames(req: Request, res: Response): Promise<void> {
  try {
    // Load games from database only - no in-memory storage
    const dbGames = await prisma.game.findMany({
      where: {
        status: {
          in: ['WAITING', 'BIDDING', 'PLAYING']
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Get players for each game
    const gamesWithPlayers = await Promise.all(
      dbGames.map(async (game) => {
        const players = await prisma.gamePlayer.findMany({
          where: { gameId: game.id }
        });
        
        // Create players array with proper structure
        const playersArray = new Array(4).fill(null);
        players.forEach(player => {
          playersArray[player.seatIndex] = {
            id: player.userId,
            username: `Player ${player.seatIndex + 1}`,
            avatarUrl: '/default-avatar.jpg',
            type: player.isHuman ? 'human' : 'bot',
            seatIndex: player.seatIndex,
            team: player.teamIndex,
            isHuman: player.isHuman
          };
        });

        return {
          id: game.id,
          status: game.status,
          mode: game.mode,
          maxPoints: 500,
          minPoints: -500,
          buyIn: 100,
          players: playersArray,
          createdAt: game.createdAt,
        };
      })
    );
    
    res.json({
      success: true,
      games: gamesWithPlayers
    });
  } catch (error) {
    console.error('Error fetching games from database:', error);
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
    // This function was not updated in the edit, so it remains as is.
    // It will now fetch from the database directly.
    // ONLY use database - no in-memory games
        const game = await prisma.game.findUnique({
      where: { id: req.params.id }
    });
    
    if (!game) {
      res.status(404).json({
        success: false,
        error: 'Game not found'
      });
      return;
    }

    // Get game players separately
    const gamePlayers = await prisma.gamePlayer.findMany({
      where: { gameId: game.id },
      orderBy: { seatIndex: 'asc' }
    });

    // Convert database game to client format
    const players = new Array(4).fill(null);
    gamePlayers.forEach(player => {
      players[player.seatIndex] = {
        id: player.userId,
        username: `Player ${player.seatIndex + 1}`, // You may want to store username in DB
        avatarUrl: '/default-avatar.jpg',
        type: player.isHuman ? 'human' : 'bot',
        seatIndex: player.seatIndex,
        team: player.teamIndex,
        isHuman: player.isHuman
      };
    });

    const enrichedGame = {
      id: game.id,
      status: game.status,
      mode: game.mode,
      maxPoints: 500, // You may want to store these in DB
      minPoints: -500,
      buyIn: 100,
      players: players,
      createdAt: game.createdAt,
      // Add other required fields based on your client expectations
    };
    
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
