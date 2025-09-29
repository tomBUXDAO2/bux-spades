import { Request, Response } from 'express';
import { io } from '../../../index';
import { prisma } from '../../../lib/prisma';
import { enrichGameForClient } from '../shared/gameUtils';
import { startGame } from '../../../modules/game-start/gameStart';
import type { Game } from '../../../types/game';
import type { AuthenticatedSocket } from '../../../types/socket';

/**
 * Create a new game
 */
export async function createGame(req: Request, res: Response): Promise<void> {
  try {
    const { 
      mode, 
      format,
      gimmickVariant,
      specialRules,
      minPoints,
      maxPoints,
      buyIn
    } = req.body;
    
    const userId = (req as any).user?.id;
    
    if (!userId) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }

    console.log('[GAME CREATION] Creating game:', { 
      mode, 
      format,
      gimmickVariant,
      userId 
    });

    // Create game in database
    const dbGame = await prisma.game.create({
      data: {
        id: `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        mode: mode || 'PARTNERS',
        format: format || 'REGULAR',
        gimmickVariant: gimmickVariant || null,
        createdById: userId,
        status: 'WAITING',
        specialRules: specialRules || {},
        minPoints: minPoints || -500,
        maxPoints: maxPoints || 500,
        buyIn: buyIn || 0,
        updatedAt: new Date()
      }
    });

    // Create a simplified game object for compatibility
    const game: Game = {
      id: dbGame.id,
      status: dbGame.status,
      mode: dbGame.mode,
      maxPoints: dbGame.maxPoints || 500,
      minPoints: dbGame.minPoints || -500,
      buyIn: dbGame.buyIn || 0,
      forcedBid: undefined,
      specialRules: typeof dbGame.specialRules === 'object' && dbGame.specialRules ? dbGame.specialRules as { screamer?: boolean; assassin?: boolean } : {},
      allowNil: dbGame.nilAllowed ?? true,
      allowBlindNil: dbGame.blindNilAllowed ?? false,
      players: [],
      spectators: [],
      currentRound: 1,
      currentTrick: 1,
      dealerIndex: 0,
      hands: [],
      bidding: {
        currentPlayer: '',
        currentBidderIndex: -1,
        bids: [null, null, null, null],
        nilBids: {}
      },
      play: {
        currentPlayer: '',
        currentPlayerIndex: -1,
        currentTrick: [],
        tricks: [],
        trickNumber: 1,
        spadesBroken: false
      },
      completedTricks: [],
      rules: {
        gameType: dbGame.mode,
        coinAmount: 0,
        maxPoints: dbGame.maxPoints || 500,
        minPoints: dbGame.minPoints || -500,
        bidType: 'REGULAR',
        allowNil: dbGame.nilAllowed ?? true,
        allowBlindNil: dbGame.blindNilAllowed ?? false
      },
      isBotGame: false,
      team1Bags: 0,
      team2Bags: 0,
      playerScores: [0, 0, 0, 0],
      playerBags: [0, 0, 0, 0],
      winningPlayer: null,
      winningTeam: null,
      lastActivity: Date.now(),
      rounds: [],
      league: false,
      rated: false,
      leagueReady: [false, false, false, false],
      dealer: 0,
      roundHistory: [],
      currentTrickCards: [],
      lastAction: null,
      lastActionTime: null,
      completed: false,
      winner: null,
      finalScore: null,
      solo: false,
      team1TotalScore: 0,
      team2TotalScore: 0
    };

    // Start the game
    // Add creator to the game as seat 0
    await prisma.gamePlayer.create({
      data: {
        id: `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        gameId: dbGame.id,
        userId: userId,
        seatIndex: 0,
        teamIndex: 0,
        isHuman: true,
        joinedAt: new Date()
      }
    });
    
    console.log(`[GAME CREATION] Added creator ${userId} to game ${dbGame.id} at seat 0`);
    
    
    await startGame(game);

    // Get all games for lobby
    const lobbyGames = await prisma.game.findMany({
      where: { status: 'WAITING' }
    });

    // Get all games
    const allGames = await prisma.game.findMany();

    console.log(`[GAME CREATION] Connected sockets: ${io.sockets.sockets.size}`);
    console.log(`[GAME CREATION] Emitting games_updated to all clients, ${lobbyGames.length} lobby games`);
    io.emit('games_updated', lobbyGames.map(g => enrichGameForClient(g)));
    
    // Also emit all games (including league games) for real-time league game detection
    console.log(`[GAME CREATION] Emitting all_games_updated to all clients, ${allGames.length} total games`);
    io.emit('all_games_updated', allGames.map(g => enrichGameForClient(g)));

    res.json({
      success: true,
      game: enrichGameForClient(game)
    });

  } catch (error) {
    console.error('[GAME CREATION] Error creating game:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
}
