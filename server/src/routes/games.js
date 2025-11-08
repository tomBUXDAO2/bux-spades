import express from 'express';
// CONSOLIDATED: GameManager removed - using GameService directly
import { GameService } from '../services/GameService.js';
// CONSOLIDATED: Game model removed - using GameService directly
import redisGameState from '../services/RedisGameStateService.js';
import { prisma } from '../config/database.js';
import { emitPersonalizedGameEvent } from '../services/SocketGameBroadcastService.js';

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
    // CONSOLIDATED: GameManager removed - using GameService directly
    const game = await GameService.getGame(gameId);
    
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
    // Map client format codes to database format names
    const formatMapping = {
      'REG': 'REGULAR',
      'WHIZ': 'WHIZ', 
      'MIRROR': 'MIRROR',
      'GIMMICK': 'GIMMICK'
    };
    
    // Handle gimmick variants - if format is a gimmick variant, map to GIMMICK format
    const gimmickVariants = ['SUICIDE', '4 OR NIL', 'BID 3', 'BID HEARTS', 'CRAZY ACES', 'JOKER WHIZ'];
    const clientFormat = req.body.format || req.body.biddingOption || 'REGULAR';
    
    // Map client gimmick variants to database enum values
    const gimmickVariantMapping = {
      'SUICIDE': 'SUICIDE',
      '4 OR NIL': 'BID4NIL',
      'BID 3': 'BID3',
      'BID HEARTS': 'BIDHEARTS',
      'CRAZY ACES': 'CRAZY_ACES',
      'JOKER WHIZ': 'JOKER'
    };
    
    let dbFormat;
    let gimmickVariant = req.body.gimmickVariant || null;
    
    if (gimmickVariants.includes(clientFormat)) {
      // This is a gimmick variant - set format to GIMMICK and variant to the specific type
      dbFormat = 'GIMMICK';
      gimmickVariant = gimmickVariantMapping[clientFormat] || clientFormat;
    } else {
      // Regular format mapping
      dbFormat = formatMapping[clientFormat] || clientFormat;
    }
    
    const gameData = {
      id: `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdById: req.body.creatorId || req.body.createdById || 'system', // Use creatorId from client
      createdByUsername: req.body.creatorName || req.body.createdByUsername || 'Unknown',
      createdByAvatar: req.body.creatorImage || req.body.createdByAvatar || null,
      mode: req.body.mode || 'PARTNERS',
      format: dbFormat, // Use mapped format
      gimmickVariant: gimmickVariant, // Use processed gimmick variant
      maxPoints: req.body.maxPoints || 200,
      minPoints: req.body.minPoints || -100,
      buyIn: req.body.buyIn || 0,
      nilAllowed: req.body.specialRules?.allowNil !== false,
      blindNilAllowed: req.body.specialRules?.allowBlindNil || false,
      specialRule1: req.body.specialRules?.specialRule1 || 'NONE',
      specialRule2: req.body.specialRules?.specialRule2 || 'NONE',
      specialRules: req.body.specialRules || {
        specialRule1: 'NONE',
        specialRule2: 'NONE'
      },
      rules: req.body.rules || {
        gameType: 'PARTNERS',
        allowNil: true,
        allowBlindNil: false,
        coinAmount: 0,
        maxPoints: 200,
        minPoints: -100,
        bidType: clientFormat, // Use original client format for display
        specialRules: {
          specialRule1: 'NONE',
          specialRule2: 'NONE'
        }
      }
    };

    // CONSOLIDATED: GameManager removed - using GameService directly
    const game = await GameService.createGame(gameData);
    
    // CRITICAL: Update Redis cache with the new game (creator is already added by GameService.createGame)
    try {
      const gameState = await GameService.getFullGameStateFromDatabase(game.id);
      if (gameState) {
        await redisGameState.setGameState(game.id, gameState);
        console.log(`[API] Updated Redis cache for game ${game.id} with creator`);
      }
    } catch (redisError) {
      console.error(`[API] Failed to update Redis cache:`, redisError);
      // Continue anyway - database is updated
    }
    
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
    const { id: userId, username, avatar, seat } = req.body;

    console.log(`[API] Join request - gameId: ${gameId}, userId: ${userId}, seat: ${seat}`);

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // Use GameService to join the game (handles database operations)
    const result = await GameService.joinGame(gameId, userId, seat);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Failed to join game' });
    }

    console.log(`[API] User ${userId} successfully joined game ${gameId} at seat ${result.seatIndex}`);

    // Update Redis cache and emit socket event
    try {
      const gameState = await GameService.getFullGameStateFromDatabase(gameId);
      if (gameState) {
        await redisGameState.setGameState(gameId, gameState);
        console.log(`[API] Updated Redis cache for game ${gameId}`);
        
        // Emit game_update to all players in the room
        const { io } = await import('../../config/server.js');
        emitPersonalizedGameEvent(io, gameId, 'game_update', gameState);
        console.log(`[API] Emitted game_update to room ${gameId}`);
        
        // Send system message
        const { SystemMessageHandler } = await import('../../modules/socket-handlers/chat/systemMessageHandler.js');
        const systemHandler = new SystemMessageHandler(io, null);
        systemHandler.handlePlayerJoined(gameId, username || 'Player');
      }
    } catch (redisError) {
      console.error(`[API] Failed to update Redis cache or emit event:`, redisError);
      // Continue anyway - database is updated
    }

    res.json({
      success: true,
      seatIndex: result.seatIndex,
      teamIndex: result.teamIndex
    });
  } catch (error) {
    console.error('[API] Error joining game:', error);
    res.status(500).json({ error: error.message || 'Failed to join game' });
  }
});

// Leave game
router.post('/:id/leave', async (req, res) => {
  try {
    const gameId = req.params.id;
    const { userId } = req.body;

    console.log(`[API] User ${userId} leaving game ${gameId}`);

    if (!userId) {
      return res.status(400).json({ error: 'User ID required' });
    }

    // Get player username before leaving
    let playerUsername = 'Player';
    try {
      const player = await prisma.gamePlayer.findFirst({
        where: { gameId, userId },
        include: { user: true }
      });
      if (player && player.user) {
        playerUsername = player.user.username;
      }
    } catch (err) {
      console.error('[API] Error getting player username:', err);
    }

    // Use GameService to leave the game (handles database operations)
    await GameService.leaveGame(gameId, userId);
    
    console.log(`[API] User ${userId} successfully left game ${gameId}`);
    
    // CRITICAL FIX: Clear activeGameId from user's session so they don't get redirected back
    const redisSessionService = (await import('../services/RedisSessionService.js')).default;
    await redisSessionService.clearActiveGame(userId);
    console.log(`[API] Cleared activeGameId from session for user ${userId}`);

    // Update Redis cache and emit socket event
    try {
      const gameState = await GameService.getFullGameStateFromDatabase(gameId);
      if (gameState) {
        await redisGameState.setGameState(gameId, gameState);
        console.log(`[API] Updated Redis cache for game ${gameId}`);
        
        // Emit game_update to all players in the room
        const { io } = await import('../../config/server.js');
        emitPersonalizedGameEvent(io, gameId, 'game_update', gameState);
        console.log(`[API] Emitted game_update to room ${gameId} after player left`);
        
        // Send system message
        const { SystemMessageHandler } = await import('../../modules/socket-handlers/chat/systemMessageHandler.js');
        const systemHandler = new SystemMessageHandler(io, null);
        systemHandler.handlePlayerLeft(gameId, playerUsername);
      }
    } catch (redisError) {
      console.error(`[API] Failed to update Redis cache or emit event:`, redisError);
      // Continue anyway - database is updated
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[API] Error leaving game:', error);
    res.status(500).json({ error: error.message || 'Failed to leave game' });
  }
});

// Get trick history for a game
router.get('/:gameId/tricks', async (req, res) => {
  try {
    const { gameId } = req.params;
    
    // Get all rounds for this game with their tricks and trick cards
    const rounds = await prisma.round.findMany({
      where: { gameId },
      include: {
        tricks: {
          include: {
            cards: {
              orderBy: { playOrder: 'asc' }
            }
          },
          orderBy: { trickNumber: 'asc' }
        }
      },
      orderBy: { roundNumber: 'asc' }
    });

    // Get player mapping from the game
    const gamePlayers = await prisma.gamePlayer.findMany({
      where: { gameId },
      select: { userId: true, seatIndex: true }
    });
    
    // Create seat index to player ID mapping
    const seatToPlayerMap = {};
    gamePlayers.forEach(player => {
      seatToPlayerMap[player.seatIndex] = player.userId;
    });

    // Transform the data for the client
    const trickHistory = rounds.map(round => ({
      roundNumber: round.roundNumber,
      tricks: round.tricks.map(trick => ({
        trickNumber: trick.trickNumber,
        leadPlayerId: seatToPlayerMap[trick.leadSeatIndex] || `seat_${trick.leadSeatIndex}`,
        winningPlayerId: seatToPlayerMap[trick.winningSeatIndex] || `seat_${trick.winningSeatIndex}`,
        cards: trick.cards.map(card => ({
          suit: card.suit,
          value: getCardValue(card.rank),
          position: card.playOrder,
          playerId: seatToPlayerMap[card.seatIndex] || `seat_${card.seatIndex}`
        }))
      }))
    }));

    res.json({ trickHistory });
  } catch (error) {
    console.error('[API] Error fetching trick history:', error);
    res.status(500).json({ error: 'Failed to fetch trick history' });
  }
});

// Helper function to get card value
function getCardValue(rank) {
  const values = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return values[rank] || 0;
}

export { router as gameRoutes };
