import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { io } from '../../index';
import { enrichGameForClient } from './shared/gameUtils';

const router = Router();

// Get all games
router.get('/all', async (req, res) => {
  try {
    const games = await prisma.game.findMany({
      orderBy: { createdAt: 'desc' as any }
    });
    
    const enrichedGames = games.map(game => enrichGameForClient(game as any));
    res.json(enrichedGames);
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

// Get lobby games (WAITING status)
router.get('/lobby/all', async (req, res) => {
  try {
    const lobbyGames = await prisma.game.findMany({
      where: { status: 'WAITING' },
      include: {
        gamePlayers: {
          orderBy: { seatIndex: 'asc' as any }
        }
      },
      orderBy: { createdAt: 'desc' as any }
    });
    
    const enrichedGames = lobbyGames.map(game => enrichGameForClient(game as any));
    res.json(enrichedGames);
  } catch (error) {
    console.error('Error fetching lobby games:', error);
    res.status(500).json({ error: 'Failed to fetch lobby games' });
  }
});

// Get game by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const game = await prisma.game.findUnique({
      where: { id },
      include: {
        gamePlayers: {
          orderBy: { seatIndex: 'asc' as any }
        }
      }
    });
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    res.json({ success: true, game: enrichGameForClient(game as any) });
  } catch (error) {
    console.error('Error fetching game:', error);
    res.status(500).json({ error: 'Failed to fetch game' });
  }
});

// Create game
router.post('/', async (req, res) => {
  try {
    const { mode, format, gimmickVariant, userId } = req.body;
    
    const game = await prisma.game.create({
      data: {
        
        
        
        mode,
        format: format || 'STANDARD',
        gimmickVariant: gimmickVariant || null,
        createdById: userId,
        status: 'WAITING'
      }
    });
    
    res.json({ success: true, game: enrichGameForClient(game as any) });
  } catch (error) {
    console.error('Error creating game:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

// Join game
router.post('/:id/join', async (req, res) => {
  try {
    const { id: gameId } = req.params;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    // Check if game exists
    const game = await prisma.game.findUnique({
      where: { id: gameId }
    });
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    if (game.status !== 'WAITING') {
      return res.status(400).json({ error: 'Game is not accepting new players' });
    }
    
    // Check if user is already in the game
    const existingPlayer = await prisma.gamePlayer.findFirst({
      where: {
        gameId,
        userId
      }
    });
    
    if (existingPlayer) {
      return res.status(400).json({ error: 'You are already in this game' });
    }
    
    // Get current players
    const gamePlayers = await prisma.gamePlayer.findMany({
      where: { gameId },
      orderBy: { seatIndex: 'asc' as any }
    });
    
    if (gamePlayers.length >= 4) {
      return res.status(400).json({ error: 'Game is full' });
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
      return res.status(400).json({ error: 'No available seats' });
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
    
    // Notify all players
    io.to(gameId).emit('player_joined', {
      userId,
      seatIndex
    });
    
    res.json({ success: true, seatIndex });
  } catch (error) {
    console.error('Error joining game:', error);
    res.status(500).json({ error: 'Failed to join game' });
  }
});

// Leave game
router.post('/:id/leave', async (req, res) => {
  try {
    const { id: gameId } = req.params;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    // Remove player from game
    await prisma.gamePlayer.deleteMany({
      where: {
        gameId,
        userId
      }
    });
    
    // Check if game is empty and delete if unrated
    const remainingPlayers = await prisma.gamePlayer.findMany({
      where: { gameId }
    });
    
    if (remainingPlayers.length === 0) {
      const game = await prisma.game.findUnique({
        where: { id: gameId }
      });
      
      if (game && !game.isRated) {
        await prisma.game.delete({
          where: { id: gameId }
        });
      }
    }
    
    // Notify other players
    io.to(gameId).emit('player_left', { userId });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error leaving game:', error);
    res.status(500).json({ error: 'Failed to leave game' });
  }
});

// Spectate game
router.post('/:id/spectate', async (req, res) => {
  try {
    const { id: gameId } = req.params;
    const userId = (req as any).user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    // Check if game exists
    const game = await prisma.game.findUnique({
      where: { id: gameId }
    });
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Check if user is already spectating
    const existingSpectator = await prisma.gamePlayer.findFirst({
      where: {
        gameId,
        userId
      }
    });
    
    if (existingSpectator) {
      return res.status(400).json({ error: 'You are already spectating this game' });
    }
    
    // Add spectator
    await prisma.gamePlayer.create({
      data: {
        
        
        
        gameId,
        userId
      }
    });
    
    // Notify players
    io.to(gameId).emit('spectator_joined', { userId });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error spectating game:', error);
    res.status(500).json({ error: 'Failed to spectate game' });
  }
});

// Start game
router.post('/:id/start', async (req, res) => {
  try {
    const { id: gameId } = req.params;
    
    // Get game with players
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        gamePlayers: {
          orderBy: { seatIndex: 'asc' as any }
        }
      }
    });
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    if (game.status !== 'WAITING') {
      return res.status(400).json({ error: 'Game is not in WAITING status' });
    }
    
    if (game.gamePlayers.length < 2) {
      return res.status(400).json({ error: 'Not enough players to start game' });
    }
    
    // Start the game
    await prisma.game.update({
      where: { id: gameId },
      data: {
        
        
        
        status: 'BIDDING'
      }
    });
    
    // Notify all players
    io.to(gameId).emit('game_started', enrichGameForClient(game as any));
    io.emit('games_updated', [enrichGameForClient(game as any)]);
    
    res.json({ success: true, game: enrichGameForClient(game as any) });
  } catch (error) {
    console.error('Error starting game:', error);
    res.status(500).json({ error: 'Failed to start game' });
  }
});

export default router;
