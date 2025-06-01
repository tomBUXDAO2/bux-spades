import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Game, GameSettings, GamePlayer } from '../../../shared/types/game';
import { io } from '../index';

const router = Router();

// In-memory games store
const games: Game[] = [];

// Create a new game
router.post('/', (req, res) => {
  const settings: GameSettings = req.body;
  // Map gameMode casing
  const modeMap: Record<string, Game['gameMode']> = {
    regular: 'REG', whiz: 'WHIZ', mirrors: 'MIRRORS', gimmick: 'GIMMICK'
  };
  const creatorPlayer = {
    id: settings.creatorId,
    username: settings.creatorName,
    avatar: settings.creatorImage || null
  };
  const newGame: Game = {
    id: uuidv4(),
    gameMode: modeMap[settings.gameMode],
    maxPoints: settings.maxPoints,
    minPoints: settings.minPoints,
    buyIn: settings.buyIn,
    forcedBid: settings.specialRules.screamer ? 'SUICIDE' : 'NONE', // Example logic
    specialRules: settings.specialRules,
    players: [creatorPlayer, null, null, null],
    status: 'waiting',
    completedTricks: [],
    rules: {
      gameType: settings.gameMode,
      allowNil: true, // Set according to your logic or settings
      allowBlindNil: false, // Set according to your logic or settings
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

  const player = {
    id: req.body.id,
    username: req.body.username,
    avatar: req.body.avatar || null
  };

  // Prevent duplicate join
  if (game.players.some(p => p && p.id === player.id)) {
    return res.status(400).json({ error: 'Player already joined' });
  }

  // Use requested seat if provided and available
  const requestedSeat = typeof req.body.seat === 'number' ? req.body.seat : null;
  if (
    requestedSeat !== null &&
    requestedSeat >= 0 &&
    requestedSeat < 4 &&
    game.players[requestedSeat] === null
  ) {
    game.players[requestedSeat] = player;
  } else {
    // Fallback: find first available seat
    const seatIndex = game.players.findIndex(p => p === null);
    if (seatIndex === -1) {
      return res.status(400).json({ error: 'Game is full' });
    }
    game.players[seatIndex] = player;
  }

  res.json(game);
  io.emit('games_updated', games);
});

export default router; 