import { enrichGameForClient } from '../shared/gameUtils';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type { Game, GamePlayer } from '../../../types/game';
import { games } from '../../../gamesStore';
import { io } from '../../../index';
import prisma from '../../../lib/prisma';
import { logGameStart } from '../database/gameDatabase';
import { AuthenticatedRequest } from '../../../middleware/auth.middleware';
import { 
  validateGameSettings,
  createGameFormatConfig,
  applyGameFormatRules
} from '../../../modules';

/**
 * Helper function to filter out null values
 */
function isNonNull<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Create a new game
 */
export async function createGame(req: Request, res: Response): Promise<void> {
  try {
    const settings = req.body;
    const creatorPlayer = {
      id: (req as AuthenticatedRequest).user!.id,
      username: settings.creatorName || 'Unknown',
      avatarUrl: settings.creatorImage || null,
      type: 'human' as const,
    };

    // Validate game settings using our modular function
    const validation = validateGameSettings(settings);
    if (!validation.valid) {
      res.status(400).json({ error: 'Invalid game settings', details: validation.errors });
      return;
    }

    // Create game format configuration
    const gameFormat = createGameFormatConfig(settings);

    // Handle pre-assigned players for league games
    let players: (GamePlayer | null)[] = [null, null, null, null];
    
    if (settings.league && settings.players && settings.players.length === 4) {
      // League game with pre-assigned players
      for (const playerData of settings.players) {
        let user = await prisma.user.findFirst({
          where: { discordId: playerData.discordId || playerData.userId }
        });
        
        if (!user) {
          user = await prisma.user.create({
            data: {
              id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              username: playerData.username,
              discordId: playerData.discordId || playerData.userId,
              coins: 5000000,
              // updatedAt: new Date(),
            }
          });
        }
        
        players[playerData.seat] = {
          id: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl,
          type: 'human',
          seatIndex: playerData.seat,
          team: playerData.seat % 2,
          bid: undefined,
          tricks: 0,
          points: 0,
          bags: 0
        };
      }
    } else {
      // Regular game - creator takes first available seat
      players[0] = {
        id: creatorPlayer.id,
        username: creatorPlayer.username,
        avatarUrl: creatorPlayer.avatarUrl,
        type: 'human',
        seatIndex: 0,
        team: 0,
        bid: undefined,
        tricks: 0,
        points: 0,
        bags: 0
      };
    }

    // Determine rating at creation time ONLY: unrated if any initial player is a bot
    const hasBotAtCreation = players.filter(isNonNull).some(p => p.type === 'bot' || (p.username && p.username.startsWith('Bot ')));

    // Create the game
    const game: Game = {
      id: uuidv4(),
      creatorId: creatorPlayer.id,
      status: 'WAITING',
      mode: settings.mode,
      maxPoints: settings.maxPoints,
      minPoints: settings.minPoints,
      buyIn: settings.buyIn,
      rated: false,
      allowNil: true,
      allowBlindNil: false,
      league: settings.league || false,
      completed: false,
      solo: settings.mode === 'SOLO',
      currentRound: 1,
      currentTrick: 1,
      dealerIndex: 0,
      lastActivity: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      players,
      hands: [],
      bidding: undefined,
      play: undefined,
      team1TotalScore: 0,
      team2TotalScore: 0,
      team1Bags: 0,
      team2Bags: 0,
      forcedBid: undefined as any,
      specialRules: settings.specialRules || {},
      spectators: [],
      completedTricks: [],
      rules: {
        gameType: settings.mode,
        allowNil: true,
        allowBlindNil: false,
        coinAmount: settings.buyIn,
        maxPoints: settings.maxPoints,
        minPoints: settings.minPoints,
        bidType: 'REGULAR',
        gimmickType: undefined as any
      },
      isBotGame: false
    };

    // Apply game format rules
    applyGameFormatRules(game, gameFormat);

    // Add to games array
    games.push(game);
    // Save game to database immediately when created
    console.log('[GAME CREATION] Saving game to database...');
    try {
      await logGameStart(game);
      console.log('[GAME CREATION] Game saved to database with ID:', game.dbGameId);
    } catch (error) {
      console.error('[GAME CREATION] Failed to save game to database:', error);
    }

    console.log('[GAME CREATION] Created game:', {
      id: game.id,
      mode: game.mode,
      format: gameFormat.format,
      gimmickType: gameFormat.gimmickType,
      players: game.players.map(p => p ? p.username : 'empty')
    });

    // Emit socket events to notify clients about the new game
    // Filter out league games in waiting status for lobby
    const lobbyGames = games.filter(game => {
      if ((game as any).league && game.status === 'WAITING') {
        return false;
      }
      return true;
    });
    console.log(`[GAME CREATION] Connected sockets: ${io.sockets.sockets.size}`);
    console.log(`[GAME CREATION] Emitting games_updated to all clients, ${lobbyGames.length} lobby games`);
    io.emit('games_updated', lobbyGames.map(g => enrichGameForClient(g)));
    
    // Also emit all games (including league games) for real-time league game detection
    console.log(`[GAME CREATION] Emitting all_games_updated to all clients, ${games.length} total games`);
    io.emit('all_games_updated', games.map(g => enrichGameForClient(g)));

    res.json({
      success: true,
      game: enrichGameForClient(game)
    });

  } catch (error) {
    console.error('Error creating game:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
}
