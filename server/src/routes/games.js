import express from 'express';
import { gameManager } from '../services/GameManager.js';
import { Game } from '../models/Game.js';

const router = express.Router();

// Get all active games
router.get('/', async (req, res) => {
  try {
    const games = gameManager.getAllGames();
    res.json(games.map(game => game.toClientFormat()));
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
      mode: req.body.mode || 'PARTNERS',
      maxPoints: req.body.maxPoints || 200,
      minPoints: req.body.minPoints || -100,
      buyIn: req.body.buyIn || 0,
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
    res.json(game.toClientFormat());
  } catch (error) {
    console.error('[API] Error creating game:', error);
    res.status(500).json({ error: 'Failed to create game' });
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
