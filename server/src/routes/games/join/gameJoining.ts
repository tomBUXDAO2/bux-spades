import { Request, Response } from 'express';
import { prisma } from '../../../lib/prisma';

export async function joinGame(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    console.log(`[GAME JOIN] User ${userId} attempting to join game ${id}`);

    // Check if user is already in another game
    const existingGamePlayer = await prisma.gamePlayer.findFirst({
      where: { 
        userId: userId,
        game: {
          status: { in: ['WAITING', 'BIDDING', 'PLAYING'] }
        }
      }
    });
    
    if (existingGamePlayer) {
      res.status(400).json({ 
        error: `You are already in game ${existingGamePlayer.gameId}. Please leave that game first.` 
      });
      return;
    }
    
    // Check if game exists in database
    const dbGame = await prisma.game.findUnique({
      where: { id: id }
    });
    
    if (!dbGame) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    
    if (dbGame.status !== 'WAITING') {
      res.status(400).json({ error: 'Game is not accepting new players' });
      return;
    }
    
    // Check if game is full
    const playerCount = await prisma.gamePlayer.count({
      where: { gameId: id }
    });
    
    if (playerCount >= 4) {
      res.status(400).json({ error: 'Game is full' });
      return;
    }
    
    // Add player to game
    const newPlayer = await prisma.gamePlayer.create({
      data: {
        gameId: id,
        userId: userId,
        seatIndex: playerCount,
        teamIndex: playerCount % 2, // Simple team assignment
        isHuman: true
      }
    });
    
    console.log(`[GAME JOIN] User ${userId} joined game ${id} as seat ${newPlayer.seatIndex}`);
    
    res.json({
      success: true,
      message: 'Successfully joined game',
      seatIndex: newPlayer.seatIndex,
      teamIndex: newPlayer.teamIndex
    });

  } catch (error) {
    console.error('[GAME JOIN] Error joining game:', error);
    res.status(500).json({ error: 'Failed to join game' });
  }
}
