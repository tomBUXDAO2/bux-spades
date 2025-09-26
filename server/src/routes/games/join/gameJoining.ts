import { Request, Response } from 'express';
import { io } from '../../index';
import { prisma } from '../../../lib/prisma';
import { enrichGameForClient } from '../shared/gameUtils';

export async function joinGame(req: Request, res: Response): Promise<void> {
  try {
    const { gameId } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    console.log(`[GAME JOIN] User ${userId} attempting to join game ${gameId}`);

    // Check if user is already in another game
    const existingGamePlayer = await prisma.gamePlayer.findFirst({
      where: { 
        userId: userId
      }
    });
    
    if (existingGamePlayer) {
      res.status(400).json({ 
        error: `You are already in game ${existingGamePlayer.gameId}. Please leave that game first.` 
      });
      return;
    }

    // Check if game exists
    const game = await prisma.game.findUnique({
      where: { id: gameId }
    });
    
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    
    if (game.status !== 'WAITING') {
      res.status(400).json({ error: 'Game is not accepting new players' });
      return;
    }
    
    // Get current players
    const gamePlayers = await prisma.gamePlayer.findMany({
      where: { gameId },
      orderBy: { seatIndex: 'asc' as any }
    });
    
    if (gamePlayers.length >= 4) {
      res.status(400).json({ error: 'Game is full' });
      return;
    }
    
    // Find available seat
    const occupiedSeats = new Set(gamePlayers.map(p => p.seatIndex));
    let seatIndex = -1;
    for (let i = 0; i < 4; i++) {
      if (!occupiedSeats.has(i)) {
        seatIndex = i;
        break;
      }
    }
    
    if (seatIndex === -1) {
      res.status(400).json({ error: 'No available seats' });
      return;
    }
    
    // Add player to game
    await prisma.gamePlayer.create({
      data: {
        gameId,
        userId,
        seatIndex,
        teamIndex: seatIndex % 2,
        isHuman: true
      }
    });
    
    // Emit game update to all clients
    const updatedGame = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        gamePlayers: {
          include: {
            user: true
          }
        }
      }
    });
    
    if (updatedGame) {
      const enrichedGame = enrichGameForClient(updatedGame);
      io.to(gameId).emit('game_update', enrichedGame);
    }
    
    res.json({ success: true, seatIndex });
  } catch (error) {
    console.error('[GAME JOIN] Error joining game:', error);
    res.status(500).json({ error: 'Failed to join game' });
  }
}
