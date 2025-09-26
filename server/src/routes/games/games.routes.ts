import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { prisma } from '../../lib/prisma';
import { io } from '../../index';
import { enrichGameForClient } from './shared/gameUtils';

const router = Router();

// Get all games
router.get('/', async (req, res) => {
  try {
    const games = await prisma.game.findMany({
      include: {
        gamePlayers: {
          include: {
            user: true
          }
        }
      }
    });
    const enrichedGames = games.map(game => enrichGameForClient(game));
    res.json({ games: enrichedGames });
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

router.get('/all', async (req, res) => {
  try {
    const games = await prisma.game.findMany({
      include: {
        gamePlayers: {
          include: {
            user: true
          }
        }
      },
      orderBy: { createdAt: 'desc' as any }
    });
    
    const enrichedGames = games.map(game => enrichGameForClient(game));
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
          include: {
            user: true
          },
          orderBy: { seatIndex: 'asc' as any }
        }
      },
      orderBy: { createdAt: 'desc' as any }
    });
    
    const enrichedGames = lobbyGames.map(game => enrichGameForClient(game));
    res.json(enrichedGames);
  } catch (error) {
    console.error('Error fetching lobby games:', error);
    res.status(500).json({ error: 'Failed to fetch lobby games' });
  }
});

// Get game by ID
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const game = await prisma.game.findUnique({
      where: { id },
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
    console.error('Error fetching game:', error);
    res.status(500).json({ error: 'Failed to fetch game' });
  }
});

// Create new game
router.post('/', requireAuth, async (req, res) => {
  try {
    const { 
      mode, 
      biddingOption, 
      minPoints, 
      maxPoints, 
      buyIn, 
      allowNil, 
      allowBlindNil, 
      specialRules, 
      creatorId, 
      creatorName, 
      creatorImage 
    } = req.body;

    const game = await prisma.game.create({
      data: {
        mode: mode || 'PARTNERS',
        format: 'REGULAR',
        gimmickVariant: null,
        minPoints: minPoints || -100,
        maxPoints: maxPoints || 100,
        buyIn: buyIn || 0,
        nilAllowed: allowNil || false,
        blindNilAllowed: allowBlindNil || false,
        specialRules: specialRules || {},
        createdById: creatorId,
        status: 'WAITING'
      }
    });

    // Add creator as first player
    await prisma.gamePlayer.create({
      data: {
        gameId: game.id,
        userId: creatorId,
        seatIndex: 0,
        teamIndex: 0,
        isHuman: true
      }
    });

    // Get the enriched game data
    const enrichedGame = await prisma.game.findUnique({
      where: { id: game.id },
      include: {
        gamePlayers: {
          include: {
            user: true
          }
        }
      }
    });

    if (enrichedGame) {
      const clientGame = enrichGameForClient(enrichedGame);
      res.json({ success: true, game: clientGame });
    } else {
      res.json({ success: true, game });
    }
  } catch (error) {
    console.error('Error creating game:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

// Join game
router.post('/:id/join', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { id: userId, username, avatar } = req.body;

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
      where: { id }
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
      where: { gameId: id },
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
        gameId: id,
        userId,
        seatIndex,
        teamIndex: seatIndex % 2,
        isHuman: true
      }
    });
    
    // Emit game update to all clients
    const updatedGame = await prisma.game.findUnique({
      where: { id },
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
      io.to(id).emit('game_update', enrichedGame);
    }
    
    res.json({ success: true, seatIndex });
  } catch (error) {
    console.error('Error joining game:', error);
    res.status(500).json({ error: 'Failed to join game' });
  }
});

// Spectate game
router.post('/:id/spectate', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { id: userId, username, avatar } = req.body;

    // Check if game exists
    const game = await prisma.game.findUnique({
      where: { id }
    });
    
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    
    // Check if user is already spectating
    const existingSpectator = await prisma.gamePlayer.findFirst({
      where: { 
        gameId: id,
        userId: userId,
        isSpectator: true
      }
    });
    
    if (existingSpectator) {
      res.status(400).json({ error: 'You are already spectating this game' });
      return;
    }
    
    // Add spectator
    await prisma.gamePlayer.create({
      data: {
        gameId: id,
        userId,
        seatIndex: null,
        teamIndex: null,
        isHuman: true,
        isSpectator: true
      }
    });
    
    // Emit spectator joined event
    io.to(id).emit('spectator_joined', {
      userId,
      username,
      avatar
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error spectating game:', error);
    res.status(500).json({ error: 'Failed to spectate game' });
  }
});

// Leave game
router.post('/:id/leave', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    // Find the player
    const gamePlayer = await prisma.gamePlayer.findFirst({
      where: {
        gameId: id,
        userId: userId
      }
    });
    
    if (!gamePlayer) {
      res.status(400).json({ error: 'You are not in this game' });
      return;
    }
    
    // Remove player from game
    await prisma.gamePlayer.delete({
      where: { id: gamePlayer.id }
    });
    
    // Emit player left event
    io.to(id).emit('player_left', {
      userId,
      seatIndex: gamePlayer.seatIndex
    });
    
    // If no human players remain, delete the game (for unrated games)
    const remainingPlayers = await prisma.gamePlayer.findMany({
      where: { gameId: id }
    });
    
    if (remainingPlayers.length === 0) {
      await prisma.game.delete({
        where: { id }
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error leaving game:', error);
    res.status(500).json({ error: 'Failed to leave game' });
  }
});

// Start game
router.post('/:id/start', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const game = await prisma.game.findUnique({
      where: { id }
    });
    
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    
    if (game.status !== 'WAITING') {
      res.status(400).json({ error: 'Game has already started' });
      return;
    }
    
    // Update game status
    await prisma.game.update({
      where: { id },
      data: { status: 'BIDDING' }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error starting game:', error);
    res.status(500).json({ error: 'Failed to start game' });
  }
});

// Invite bot
router.post('/:id/invite-bot', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { seatIndex } = req.body;
    
    console.log(`[BOT INVITATION] Inviting bot to seat ${seatIndex} in game ${id}`);
    
    // Get the game
    const game = await prisma.game.findUnique({
      where: { id },
      include: { gamePlayers: { include: { user: true } } }
    });
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Check if seat is already taken
    const existingPlayer = game.gamePlayers.find(gp => gp.seatIndex === seatIndex);
    if (existingPlayer) {
      return res.status(400).json({ error: 'Seat already taken' });
    }
    
    // Create bot user
    const botNumber = Math.floor(Math.random() * 1000);
    const botId = `bot_${botNumber}_${Date.now()}`;
    
    const botUser = await prisma.user.upsert({
      where: { id: botId },
      update: {},
      create: {
        id: botId,
        username: `Bot${botNumber}`,
        avatarUrl: '/bot-avatar.jpg',
        discordId: null,
        coins: 1000000,
        createdAt: new Date()
      }
    });
    
    // Create bot player in game
    const botPlayer = await prisma.gamePlayer.create({
      data: {
        gameId: id,
        userId: botId,
        seatIndex: seatIndex,
        teamIndex: seatIndex % 2, // Team assignment based on seat
        isHuman: false,
        joinedAt: new Date(),
        hand: []
      }
    });
    
    // Emit game update to all clients
    const updatedGame = await prisma.game.findUnique({
      where: { id },
      include: { gamePlayers: { include: { user: true } } }
    });
    
    if (updatedGame) {
      const enrichedGame = require('./shared/gameUtils').enrichGameForClient(updatedGame);
      io.to(id).emit('game_update', enrichedGame);
    }
    
    res.json({ success: true, botPlayer });
  } catch (error) {
    console.error('Error inviting bot:', error);
    res.status(500).json({ error: 'Failed to invite bot' });
  }
});

// Remove bot
router.post('/:id/remove-bot', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Implementation for bot removal
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing bot:', error);
    res.status(500).json({ error: 'Failed to remove bot' });
  }
});

// Invite bot midgame
router.post('/:id/invite-bot-midgame', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Implementation for midgame bot invitation
    res.json({ success: true });
  } catch (error) {
    console.error('Error inviting bot midgame:', error);
    res.status(500).json({ error: 'Failed to invite bot midgame' });
  }
});

// Remove bot midgame
router.post('/:id/remove-bot-midgame', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Implementation for midgame bot removal
    res.json({ success: true });
  } catch (error) {
    console.error('Error removing bot midgame:', error);
    res.status(500).json({ error: 'Failed to remove bot midgame' });
  }
});

// Complete game
router.post('/:id/complete', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Implementation for game completion
    res.json({ success: true });
  } catch (error) {
    console.error('Error completing game:', error);
    res.status(500).json({ error: 'Failed to complete game' });
  }
});

export default router;
