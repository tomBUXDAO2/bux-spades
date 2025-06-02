import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Game, GamePlayer } from '../types/game';
import { io } from '../index';

const router = Router();

// In-memory games store
export const games: Game[] = [];

// Create a new game
router.post('/', (req, res) => {
  const settings = req.body;
  const creatorPlayer = {
    id: settings.creatorId,
    username: settings.creatorName,
    avatar: settings.creatorImage || null
  };
  const newGame: Game = {
    id: uuidv4(),
    gameMode: settings.gameMode,
    maxPoints: settings.maxPoints,
    minPoints: settings.minPoints,
    buyIn: settings.buyIn,
    forcedBid: settings.specialRules?.screamer ? 'SUICIDE' : 'NONE',
    specialRules: settings.specialRules || {},
    players: [creatorPlayer, null, null, null],
    status: 'WAITING',
    completedTricks: [],
    rules: {
      gameType: settings.gameMode,
      allowNil: true,
      allowBlindNil: false,
      coinAmount: settings.buyIn,
      maxPoints: settings.maxPoints,
      minPoints: settings.minPoints
    }
  };
  games.push(newGame);
  io.emit('games_updated', games);
  res.status(201).json(newGame);
});

// List all games
router.get('/', (_req, res) => {
  res.json(games);
});

// Get game details
router.get('/:id', (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
});

// Join a game
router.post('/:id/join', (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  // Use requested seat if provided and available
  const requestedSeat = typeof req.body.seat === 'number' ? req.body.seat : null;
  const player = {
    id: req.body.id,
    username: req.body.username || 'Unknown',
    avatar: req.body.avatar || '/default-pfp.jpg',
    position: requestedSeat
  };

  // Prevent duplicate join
  if (game.players.some(p => p && p.id === player.id)) {
    return res.status(400).json({ error: 'Player already joined' });
  }

  // Use requested seat if provided and available
  if (
    requestedSeat !== null &&
    requestedSeat >= 0 &&
    requestedSeat < 4
  ) {
    if (game.players[requestedSeat] !== null) {
      return res.status(400).json({ error: 'Seat is already taken' });
    }
    game.players[requestedSeat] = player;
  } else {
    return res.status(400).json({ error: 'Invalid seat selection' });
  }

  res.json(game);
  io.emit('games_updated', games);
  // Emit game_update to the game room for real-time sync
  io.to(game.id).emit('game_update', game);
});

export default router; 