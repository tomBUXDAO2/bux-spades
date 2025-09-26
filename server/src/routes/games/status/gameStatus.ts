import { Request, Response } from 'express';
import { prisma } from '../../../lib/prisma';
import { enrichGameForClient } from '../shared/gameUtils';

export async function getGameStatus(req: Request, res: Response): Promise<void> {
  try {
    const { gameId } = req.params;
    
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        gamePlayers: {
          include: {
            user: true
          },
          orderBy: { seatIndex: 'asc' as any }
        }
      }
    });
    
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    
    const enrichedGame = enrichGameForClient(game);
    res.json({ success: true, game: enrichedGame });
  } catch (error) {
    console.error('Error fetching game status:', error);
    res.status(500).json({ error: 'Failed to fetch game status' });
  }
}
