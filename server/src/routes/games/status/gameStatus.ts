import { Request, Response } from 'express';
import { prisma } from '../../../lib/prisma';

export async function getGameStatus(req: Request, res: Response): Promise<void> {
  try {
    const { gameId } = req.params;
    
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        gamePlayers: {
          orderBy: { seatIndex: 'asc' as any }
        }
      }
    });
    
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    
    // Convert to client format
    const clientGame = {
      id: game.id,
      status: game.status,
      mode: game.mode,
      format: game.format,
      gimmickVariant: game.gimmickVariant,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      players: game.gamePlayers.map((player: any) => ({
        id: player.userId,
        seatIndex: player.seatIndex,
        teamIndex: player.teamIndex,
        isHuman: player.isHuman
      }))
    };
    
    res.json({ success: true, game: clientGame });
  } catch (error) {
    console.error('Error fetching game status:', error);
    res.status(500).json({ error: 'Failed to fetch game status' });
  }
}
