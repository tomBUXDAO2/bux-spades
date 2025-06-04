import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Game, GamePlayer } from '../types/game';
import { io } from '../index';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// In-memory games store
export const games: Game[] = [];

// Create a new game
router.post('/', (req, res) => {
  try {
    const settings = req.body;
    const creatorPlayer = {
      id: settings.creatorId,
      username: settings.creatorName,
      avatar: settings.creatorImage || null,
      type: 'human',
    };
    const newGame = {
      id: uuidv4(),
      gameMode: settings.gameMode,
      maxPoints: settings.maxPoints,
      minPoints: settings.minPoints,
      buyIn: settings.buyIn,
      forcedBid: (settings.specialRules?.screamer ? 'SUICIDE' : 'NONE') as 'SUICIDE' | 'NONE',
      specialRules: settings.specialRules || {},
      players: [creatorPlayer, null, null, null],
      status: 'WAITING' as Game['status'],
      completedTricks: [],
      rules: {
        gameType: settings.gameMode,
        allowNil: true,
        allowBlindNil: false,
        coinAmount: settings.buyIn,
        maxPoints: settings.maxPoints,
        minPoints: settings.minPoints
      },
      isBotGame: false,
    };
    games.push(newGame);
    io.emit('games_updated', games);
    res.status(201).json(newGame);
  } catch (err) {
    console.error('Error creating game:', err);
    res.status(500).json({ error: 'Failed to create game' });
  }
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
router.post('/:id/join', async (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  // Use requested seat if provided and available
  const requestedSeat = typeof req.body.seat === 'number' ? req.body.seat : null;
  const playerId = req.body.id;
  const player = {
    id: playerId,
    username: req.body.username || 'Unknown',
    avatar: req.body.avatar || '/default-pfp.jpg',
    type: 'human',
    position: requestedSeat
  };

  // Prevent duplicate join
  if (game.players.some(p => p && p.id === player.id)) {
    return res.status(400).json({ error: 'Player already joined' });
  }

  // Check coin balance before seating
  try {
    const user = await prisma.user.findUnique({ where: { id: playerId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.coins < game.buyIn) {
      return res.status(400).json({ error: 'Not enough coins to join this game' });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Failed to check coin balance' });
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

// Invite a bot to an empty seat (host only, pre-game)
router.post('/:id/invite-bot', (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status !== 'WAITING') return res.status(400).json({ error: 'Game already started' });
  const { seatIndex, requesterId } = req.body;
  // Debug logging
  console.log('[INVITE BOT] seatIndex:', seatIndex, 'requesterId:', requesterId);
  console.log('[INVITE BOT] game.players BEFORE:', JSON.stringify(game.players));
  // Only host can invite bots
  if (game.players[0]?.id !== requesterId) return res.status(403).json({ error: 'Only host can invite bots' });
  if (seatIndex < 0 || seatIndex > 3 || game.players[seatIndex]) return res.status(400).json({ error: 'Invalid seat' });
  // Add bot
  const botPlayer = {
    id: `bot-${uuidv4()}`,
    username: `Bot ${seatIndex + 1}`,
    avatar: '/bot-avatar.jpg',
    type: 'bot',
    position: seatIndex
  };
  game.players[seatIndex] = botPlayer;
  // Debug logging after mutation
  console.log('[INVITE BOT] game.players AFTER:', JSON.stringify(game.players));
  // If any seat is a bot, set isBotGame true
  game.isBotGame = game.players.some(p => p && p.type === 'bot');
  io.emit('games_updated', games);
  io.to(game.id).emit('game_update', game);
  res.json(game);
});

// Invite a bot to fill an empty seat mid-game (partner only)
router.post('/:id/invite-bot-midgame', (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status === 'WAITING') return res.status(400).json({ error: 'Game has not started' });
  const { seatIndex, requesterId } = req.body;
  if (seatIndex < 0 || seatIndex > 3 || game.players[seatIndex]) return res.status(400).json({ error: 'Seat is not empty' });
  // Find the partner seat (for 4-player games: 0<->2, 1<->3)
  const partnerSeat = (seatIndex + 2) % 4;
  if (!game.players[partnerSeat] || game.players[partnerSeat]?.id !== requesterId) {
    return res.status(403).json({ error: 'Only the partner can invite a bot for this seat' });
  }
  // Add bot
  const botPlayer = {
    id: `bot-${uuidv4()}`,
    username: `Bot ${seatIndex + 1}`,
    avatar: '/bot-avatar.jpg',
    type: 'bot',
    position: seatIndex
  };
  game.players[seatIndex] = botPlayer;
  io.emit('games_updated', games);
  io.to(game.id).emit('game_update', game);
  res.json(game);
});

// Start the game
router.post('/:id/start', async (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status !== 'WAITING') return res.status(400).json({ error: 'Game already started' });
  // If any seat is a bot, set isBotGame true
  game.isBotGame = game.players.some(p => p && p.type === 'bot');
  if (!game.isBotGame) {
    // Debit buy-in from each human player's coin balance
    try {
      for (const player of game.players) {
        if (player && player.type === 'human') {
          await prisma.user.update({
            where: { id: player.id },
            data: { coins: { decrement: game.buyIn } }
          });
        }
      }
    } catch (err) {
      return res.status(500).json({ error: 'Failed to debit coins from players' });
    }
  }
  game.status = 'BIDDING'; // or whatever the next phase is
  io.emit('games_updated', games);
  io.to(game.id).emit('game_update', game);
  res.json(game);
});

// Remove a bot from a seat (host only, pre-game)
router.post('/:id/remove-bot', (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status !== 'WAITING') return res.status(400).json({ error: 'Game already started' });
  const { seatIndex, requesterId } = req.body;
  // Only host can remove bots
  if (game.players[0]?.id !== requesterId) return res.status(403).json({ error: 'Only host can remove bots' });
  if (seatIndex < 0 || seatIndex > 3 || !game.players[seatIndex] || game.players[seatIndex].type !== 'bot') return res.status(400).json({ error: 'Invalid seat or not a bot' });
  game.players[seatIndex] = null;
  io.emit('games_updated', games);
  io.to(game.id).emit('game_update', game);
  res.json(game);
});

// Remove a bot from a seat mid-game (partner only)
router.post('/:id/remove-bot-midgame', (req, res) => {
  const game = games.find(g => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.status === 'WAITING') return res.status(400).json({ error: 'Game has not started' });
  const { seatIndex, requesterId } = req.body;
  if (seatIndex < 0 || seatIndex > 3 || !game.players[seatIndex] || game.players[seatIndex].type !== 'bot') return res.status(400).json({ error: 'Invalid seat or not a bot' });
  // Find the partner seat (for 4-player games: 0<->2, 1<->3)
  const partnerSeat = (seatIndex + 2) % 4;
  if (!game.players[partnerSeat] || game.players[partnerSeat]?.id !== requesterId) {
    return res.status(403).json({ error: 'Only the partner can remove a bot for this seat' });
  }
  game.players[seatIndex] = null;
  io.emit('games_updated', games);
  io.to(game.id).emit('game_update', game);
  res.json(game);
});

// --- Basic Bot Engine ---
function botMakeMove(game, seatIndex) {
  const bot = game.players[seatIndex];
  if (!bot || bot.type !== 'bot') return;
  // Example: log bot action (replace with real logic)
  console.log(`[BOT] ${bot.username} is making a move in game ${game.id}`);
  // TODO: Implement actual game logic (bidding, playing cards, etc.)
  // For now, just emit a dummy move event
  io.to(game.id).emit('bot_move', { botId: bot.id, seatIndex });
}

/**
 * Call this after every player move (bid, play card, etc.)
 * It will check if the next player is a bot and, if so, trigger their move.
 */
function advanceTurnOrBotMove(game, nextSeatIndex) {
  const nextPlayer = game.players[nextSeatIndex];
  if (nextPlayer && nextPlayer.type === 'bot') {
    botMakeMove(game, nextSeatIndex);
  }
}

export default router; 