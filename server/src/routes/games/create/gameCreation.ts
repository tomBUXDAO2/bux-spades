import { Request, Response } from 'express';
import { io } from '../../../index';
import { prisma } from '../../../lib/prisma';
import { enrichGameForClient } from '../shared/gameUtils';
import { startGame } from '../../../modules/game-start/gameStart';
import type { Game } from '../../../types/game';

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
        mode: mode || 'PARTNERS',
        format: format || 'REGULAR',
        gimmickVariant: gimmickVariant || null,
        createdById: userId,
        status: 'WAITING',
        specialRules: specialRules || {},
        minPoints: minPoints || -500,
        maxPoints: maxPoints || 500,
        buyIn: buyIn || 0
      }
    });

    // Create a simplified game object for compatibility
    const game: Game = {
      id: dbGame.id,
      status: dbGame.status as any,
      mode: dbGame.mode as any,
      maxPoints: 500, // Default values
      minPoints: -500,
      buyIn: 0,
      forcedBid: false,
      specialRules: dbGame.specialRules as any,
      allowNil: true, // Default values
      allowBlindNil: false,
      format: dbGame.format as any,
      gimmickVariant: dbGame.gimmickVariant as any, // Fix: Use the actual value from DB
      createdById: dbGame.createdById,
      createdAt: dbGame.createdAt.getTime(),
      updatedAt: dbGame.updatedAt.getTime(),
      dbGameId: dbGame.id,
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
        gameType: dbGame.mode as any,
        coinAmount: 0,
        maxPoints: 500,
        minPoints: -500,
        bidType: 'NORMAL' as any,
        allowNil: true,
        allowBlindNil: false
      },
      isBotGame: false,
      team1Bags: 0,
      team2Bags: 0,
      playerScores: [0, 0, 0, 0],
      playerBags: [0, 0, 0, 0],
      winningPlayer: null,
      winningTeam: null,
      lastActivity: Date.now(),
      rounds: 0,
      league: false,
      rated: false,
      leagueReady: false,
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
    io.emit('games_updated', lobbyGames.map(g => enrichGameForClient(g as any)));
    
    // Also emit all games (including league games) for real-time league game detection
    console.log(`[GAME CREATION] Emitting all_games_updated to all clients, ${allGames.length} total games`);
    io.emit('all_games_updated', allGames.map(g => enrichGameForClient(g as any)));

    res.json({
      success: true,
      game: enrichGameForClient(game)
    });

  } catch (error) {
    console.error('[GAME CREATION] Error creating game:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
}
