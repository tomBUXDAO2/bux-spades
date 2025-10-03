import express from 'express';
import { gameManager } from '../services/GameManager.js';
import { GameService } from '../services/GameService.js';
import { Game } from '../models/Game.js';

const router = express.Router();

// Get all active games (ONLY from database)
router.get('/', async (req, res) => {
  try {
    // Load games ONLY from database
    const dbGames = await GameService.getActiveGames();
    console.log(`[API] Found ${dbGames.length} games in database`);
    
    console.log(`[API] Returning ${dbGames.length} database games only`);
    
    // Format database games for client
    const clientGames = dbGames.map(game => ({
      id: game.id,
      createdById: game.createdById,
      mode: game.mode,
      format: game.format,
      gimmickVariant: game.gimmickVariant,
      isLeague: game.isLeague,
      isRated: game.isRated,
      status: game.status,
      minPoints: game.minPoints,
      maxPoints: game.maxPoints,
      nilAllowed: game.nilAllowed,
      blindNilAllowed: game.blindNilAllowed,
      specialRules: game.specialRules,
      buyIn: game.buyIn,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      players: game.players.map(player => ({
        id: player.userId,
        username: player.user?.username || 'Unknown',
        avatarUrl: player.user?.avatarUrl || null,
        seatIndex: player.seatIndex,
        teamIndex: player.teamIndex,
        isHuman: player.isHuman,
        joinedAt: player.joinedAt,
        isSpectator: player.isSpectator
      }))
    }));
    
    res.json(clientGames);
  } catch (error) {
    console.error('[API] Error getting games:', error);
    res.status(500).json({ error: 'Failed to get games' });
  }
});

// Get specific game
router.get('/:id', async (req, res) => {
  try {
    const gameId = req.params.id;
    let game = gameManager.getGame(gameId);
    
    if (!game) {
      game = await gameManager.loadGame(gameId);
    }
    
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    res.json(game.toClientFormat());
  } catch (error) {
    console.error('[API] Error getting game:', error);
    res.status(500).json({ error: 'Failed to get game' });
  }
});

// Create new game
router.post('/', async (req, res) => {
  try {
    const gameData = {
      id: `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdById: req.body.creatorId || req.body.createdById || 'system', // Use creatorId from client
      createdByUsername: req.body.creatorName || req.body.createdByUsername || 'Unknown',
      createdByAvatar: req.body.creatorImage || req.body.createdByAvatar || null,
      mode: req.body.mode || 'PARTNERS',
      format: req.body.format || 'REGULAR', // Required field
      gimmickVariant: req.body.gimmickVariant || null,
      maxPoints: req.body.maxPoints || 200,
      minPoints: req.body.minPoints || -100,
      buyIn: req.body.buyIn || 0,
      nilAllowed: req.body.specialRules?.allowNil !== false,
      blindNilAllowed: req.body.specialRules?.allowBlindNil || false,
      specialRules: req.body.specialRules || {
        screamer: false,
        assassin: false
      },
      rules: req.body.rules || {
        gameType: 'PARTNERS',
        allowNil: true,
        allowBlindNil: false,
        coinAmount: 0,
        maxPoints: 200,
        minPoints: -100,
        bidType: 'REGULAR',
        specialRules: {
          screamer: false,
          assassin: false
        }
      }
    };

    const game = await gameManager.createGame(gameData);
    
    // Format the database game for client
    const clientGame = {
      id: game.id,
      createdById: game.createdById,
      mode: game.mode,
      format: game.format,
      gimmickVariant: game.gimmickVariant,
      isLeague: game.isLeague,
      isRated: game.isRated,
      status: game.status,
      minPoints: game.minPoints,
      maxPoints: game.maxPoints,
      nilAllowed: game.nilAllowed,
      blindNilAllowed: game.blindNilAllowed,
      specialRules: game.specialRules,
      buyIn: game.buyIn,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      players: [] // Will be populated when players join
    };
    
    res.json(clientGame);
  } catch (error) {
    console.error('[API] Error creating game:', error);
    res.status(500).json({ error: 'Failed to create game', message: error?.message || 'unknown' });
  }
});

// Join game
router.post('/:id/join', async (req, res) => {
  try {
    const gameId = req.params.id;
    const { userId, username } = req.body;

    let game = gameManager.getGame(gameId);
    if (!game) {
      game = await gameManager.loadGame(gameId);
    }

    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Find available seat
    let seatIndex = -1;
    for (let i = 0; i < 4; i++) {
      if (!game.players[i]) {
        seatIndex = i;
        break;
      }
    }

    if (seatIndex === -1) {
      return res.status(400).json({ error: 'Game is full' });
    }

    // Add player
    game.players[seatIndex] = {
      id: userId,
      username,
      type: 'human',
      seatIndex,
      team: seatIndex % 2,
      hand: [],
      bid: null,
      tricks: 0,
      points: 0,
      bags: 0,
      nil: false,
      blindNil: false,
      connected: true
    };

    // If this is the first player, set them as current player
    if (game.players.filter(p => p !== null).length === 1) {
      game.currentPlayer = userId;
    }

    await gameManager.saveGame(gameId);
    res.json(game.toClientFormat());
  } catch (error) {
    console.error('[API] Error joining game:', error);
    res.status(500).json({ error: 'Failed to join game' });
  }
});

// Leave game
router.post('/:id/leave', async (req, res) => {
  try {
    const gameId = req.params.id;
    const { userId } = req.body;

    const game = gameManager.getGame(gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Remove player
    const playerIndex = game.players.findIndex(p => p && p.id === userId);
    if (playerIndex !== -1) {
      game.players[playerIndex] = null;
    }

    // If no players left, delete game
    const activePlayers = game.players.filter(p => p !== null);
    if (activePlayers.length === 0) {
      await gameManager.deleteGame(gameId);
      return res.json({ message: 'Game deleted' });
    }

    await gameManager.saveGame(gameId);
    res.json(game.toClientFormat());
  } catch (error) {
    console.error('[API] Error leaving game:', error);
    res.status(500).json({ error: 'Failed to leave game' });
  }
});

export { router as gameRoutes };
