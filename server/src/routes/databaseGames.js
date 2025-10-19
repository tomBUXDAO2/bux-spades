import express from 'express';
import { DatabaseGameService } from '../services/DatabaseGameService.js';
import { GameService } from '../services/GameService.js';
// CONSOLIDATED: DatabaseGameEngine removed - using GameService directly

const router = express.Router();

/**
 * DATABASE-FIRST GAME ROUTES
 * All operations go through database
 */

// Get all active games
router.get('/', async (req, res) => {
  try {
    console.log('[DB API] Getting all active games');
    const games = await DatabaseGameService.getActiveGames();
    
    // Convert to client format
    const clientGames = games.map(game => ({
      id: game.id,
      status: game.status,
      mode: game.mode,
      format: game.format,
      maxPoints: game.maxPoints,
      minPoints: game.minPoints,
      buyIn: game.buyIn,
      currentRound: game.currentRound,
      currentTrick: game.currentTrick,
      currentPlayer: game.currentPlayer,
      dealer: game.dealer,
      players: game.players.map(p => ({
        userId: p.userId,
        username: p.user?.username || 'Unknown',
        avatarUrl: p.user?.avatarUrl,
        seatIndex: p.seatIndex,
        teamIndex: p.teamIndex,
        isHuman: p.isHuman
      })),
      createdAt: game.createdAt,
      startedAt: game.startedAt
    }));
    
    console.log(`[DB API] Returning ${clientGames.length} active games`);
    res.json(clientGames);
  } catch (error) {
    console.error('[DB API] Error getting games:', error);
    res.status(500).json({ error: 'Failed to get games' });
  }
});

// Get specific game
router.get('/:id', async (req, res) => {
  try {
    const gameId = req.params.id;
    console.log(`[DB API] Getting game: ${gameId}`);
    
    // CONSOLIDATED: Using GameService directly instead of DatabaseGameEngine
    const gameState = await GameService.getGameStateForClient(gameId);
    
    if (!gameState) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    // Convert to client format
    const clientGame = {
      id: gameState.id,
      status: gameState.status,
      mode: gameState.mode,
      format: gameState.format,
      maxPoints: gameState.maxPoints,
      minPoints: gameState.minPoints,
      buyIn: gameState.buyIn,
      currentRound: gameState.currentRound,
      currentTrick: gameState.currentTrick,
      currentPlayer: gameState.currentPlayer,
      dealer: gameState.dealer,
      players: gameState.players.map(p => ({
        userId: p.userId,
        username: p.user?.username || 'Unknown',
        avatarUrl: p.user?.avatarUrl,
        seatIndex: p.seatIndex,
        teamIndex: p.teamIndex,
        isHuman: p.isHuman,
        hand: p.hand || []
      })),
      rounds: gameState.rounds,
      currentRoundData: gameState.currentRoundData,
      currentTrickData: gameState.currentTrickData,
      result: gameState.result,
      createdAt: gameState.createdAt,
      startedAt: gameState.startedAt,
      finishedAt: gameState.finishedAt
    };
    
    res.json(clientGame);
  } catch (error) {
    console.error('[DB API] Error getting game:', error);
    res.status(500).json({ error: 'Failed to get game' });
  }
});

// Create new game
router.post('/', async (req, res) => {
  try {
    const gameData = {
      id: `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdById: req.body.creatorId || req.body.createdById || 'system',
      mode: req.body.mode || 'REGULAR',
      format: req.body.format || 'REGULAR',
      gimmickVariant: req.body.gimmickVariant,
      isLeague: req.body.isLeague || false,
      isRated: req.body.isRated || false,
      maxPoints: req.body.maxPoints || 500,
      minPoints: req.body.minPoints || -200,
      buyIn: req.body.buyIn || 0,
      nilAllowed: req.body.nilAllowed !== false,
      blindNilAllowed: req.body.blindNilAllowed || false,
      specialRules: req.body.specialRules || {}
    };
    
    console.log(`[DB API] Creating game: ${gameData.id}`);
    
    const game = await DatabaseGameService.createGame(gameData);
    
    console.log(`[DB API] Game created: ${game.id}`);
    res.status(201).json({ id: game.id });
    
  } catch (error) {
    console.error('[DB API] Error creating game:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

// Join game
router.post('/:id/join', async (req, res) => {
  try {
    const gameId = req.params.id;
    const userId = req.body.userId;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }
    
    console.log(`[DB API] User ${userId} joining game ${gameId}`);
    
    const player = await DatabaseGameService.joinGame(gameId, userId);
    
    res.json({
      success: true,
      seatIndex: player.seatIndex,
      teamIndex: player.teamIndex
    });
    
  } catch (error) {
    console.error('[DB API] Error joining game:', error);
    res.status(500).json({ error: error.message || 'Failed to join game' });
  }
});

// Leave game
router.post('/:id/leave', async (req, res) => {
  try {
    const gameId = req.params.id;
    const userId = req.body.userId;
    
    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }
    
    console.log(`[DB API] User ${userId} leaving game ${gameId}`);
    
    await DatabaseGameService.leaveGame(gameId, userId);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('[DB API] Error leaving game:', error);
    res.status(500).json({ error: error.message || 'Failed to leave game' });
  }
});

// Start game (when 4 players are present)
router.post('/:id/start', async (req, res) => {
  try {
    const gameId = req.params.id;
    
    console.log(`[DB API] Starting game ${gameId}`);
    
    await DatabaseGameService.startGame(gameId);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('[DB API] Error starting game:', error);
    res.status(500).json({ error: error.message || 'Failed to start game' });
  }
});

// Delete game
router.delete('/:id', async (req, res) => {
  try {
    const gameId = req.params.id;
    
    console.log(`[DB API] Deleting game ${gameId}`);
    
    await DatabaseGameService.deleteGame(gameId);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('[DB API] Error deleting game:', error);
    res.status(500).json({ error: error.message || 'Failed to delete game' });
  }
});

export default router;
