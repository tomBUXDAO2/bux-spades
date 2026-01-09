import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { fileURLToPath } from 'url';
import { prisma } from '../config/databaseFirst.js';
import { authenticateToken } from '../middleware/auth.js';
import { GameService } from '../services/GameService.js';
// CONSOLIDATED: GameManager removed - using GameService directly
import redisGameState from '../services/RedisGameStateService.js';
import { io } from '../config/server.js';
import redisSessionService from '../services/RedisSessionService.js';
import { ForceGameDeletionService } from '../services/ForceGameDeletionService.js';
import EventService from '../services/EventService.js';
import { TournamentService } from '../services/TournamentService.js';
import { DiscordTournamentService } from '../services/DiscordTournamentService.js';
import { TournamentBracketService } from '../services/TournamentBracketService.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsRoot = path.resolve(__dirname, '../uploads');
const eventBannerDir = path.join(uploadsRoot, 'events');
const tournamentBannerDir = path.join(uploadsRoot, 'tournaments');

if (!fs.existsSync(eventBannerDir)) {
  fs.mkdirSync(eventBannerDir, { recursive: true });
}

if (!fs.existsSync(tournamentBannerDir)) {
  fs.mkdirSync(tournamentBannerDir, { recursive: true });
}

const bannerStorage = multer.diskStorage({
  destination: (_, __, cb) => {
    cb(null, eventBannerDir);
  },
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const safeName = `event-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safeName);
  }
});

const tournamentBannerStorage = multer.diskStorage({
  destination: (_, __, cb) => {
    cb(null, tournamentBannerDir);
  },
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const safeName = `tournament-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safeName);
  }
});

const bannerUpload = multer({
  storage: bannerStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG and JPEG images are allowed'));
    }
  }
});

const tournamentBannerUpload = multer({
  storage: tournamentBannerStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/jpg'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG and JPEG images are allowed'));
    }
  }
});

async function isAdmin(req, res, next) {
  try {
    const adminIds = process.env.DISCORD_ADMIN_IDS?.split(',') || [];
    let userDiscordId = req.user?.discordId;
    
    // If discordId not in JWT token (old tokens), fetch from database
    if (!userDiscordId) {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { discordId: true }
      });
      userDiscordId = user?.discordId;
    }
    
    if (!adminIds.includes(userDiscordId)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    console.error('[ADMIN] Error in admin check:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

router.post('/events/banner', authenticateToken, isAdmin, bannerUpload.single('banner'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Banner image is required' });
    }

    const relativePath = `/uploads/events/${req.file.filename}`;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const absoluteUrl = host ? `${protocol}://${host}${relativePath}` : relativePath;

    res.status(201).json({
      bannerUrl: absoluteUrl,
      relativePath
    });
  } catch (error) {
    console.error('[ADMIN] Error uploading event banner:', error);
    res.status(500).json({ error: 'Failed to upload banner' });
  }
});

router.get('/events', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { status, limit } = req.query;
    let statuses = undefined;
    if (status) {
      statuses = status.split(',').map((item) => item.trim()).filter(Boolean);
    }

    const parsedLimit = limit ? Number(limit) : 50;
    const take = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50;

    const events = await EventService.listEvents({
      status: statuses,
      limit: take,
      includeCriteria: true,
    });

    res.json({ events });
  } catch (error) {
    console.error('[ADMIN] Error fetching events:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch events' });
  }
});

router.get('/events/active', authenticateToken, isAdmin, async (req, res) => {
  try {
    const event = await EventService.getActiveEvent({
      includeCriteria: true,
      includeStats: true,
    });
    res.json({ event });
  } catch (error) {
    console.error('[ADMIN] Error fetching active event:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch active event' });
  }
});

router.post('/events', authenticateToken, isAdmin, async (req, res) => {
  try {
    const createdById = req.userId || null;
    const event = await EventService.createEvent(req.body, createdById);
    res.status(201).json({ event });
  } catch (error) {
    console.error('[ADMIN] Error creating event:', error);
    res.status(400).json({ error: error.message || 'Failed to create event' });
  }
});

// Tournament banner upload
router.post('/tournaments/banner', authenticateToken, isAdmin, tournamentBannerUpload.single('banner'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Banner image is required' });
    }

    const relativePath = `/uploads/tournaments/${req.file.filename}`;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const absoluteUrl = host ? `${protocol}://${host}${relativePath}` : relativePath;

    res.status(201).json({
      bannerUrl: absoluteUrl,
      relativePath
    });
  } catch (error) {
    console.error('[ADMIN] Error uploading tournament banner:', error);
    res.status(500).json({ error: 'Failed to upload banner' });
  }
});

// Create tournament
router.post('/tournaments', authenticateToken, isAdmin, async (req, res) => {
  try {
    const createdById = req.userId || null;
    const tournament = await TournamentService.createTournament(req.body, createdById);
    
    // Post embed to Discord
    try {
      const { client } = await import('../discord/bot.js');
      console.log('[ADMIN] Discord client check:', { 
        hasClient: !!client, 
        isReady: client?.isReady?.(), 
        userTag: client?.user?.tag 
      });
      
      if (client && client.isReady()) {
        console.log('[ADMIN] Posting tournament embed to Discord...');
        await DiscordTournamentService.postTournamentEmbed(client, tournament);
        console.log('[ADMIN] Tournament embed posted successfully');
      } else {
        console.warn('[ADMIN] Discord client not ready, tournament created but embed not posted. Client state:', {
          exists: !!client,
          isReady: client?.isReady?.(),
          readyAt: client?.readyAt
        });
      }
    } catch (discordError) {
      console.error('[ADMIN] Error posting tournament to Discord:', discordError);
      console.error('[ADMIN] Discord error stack:', discordError.stack);
      // Don't fail the request if Discord fails - tournament is still created
    }
    
    res.status(201).json({ tournament });
  } catch (error) {
    console.error('[ADMIN] Error creating tournament:', error);
    res.status(400).json({ error: error.message || 'Failed to create tournament' });
  }
});

// Get tournaments
router.get('/tournaments', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const tournaments = await TournamentService.getTournaments({ status, limit: 100 });
    res.json({ tournaments });
  } catch (error) {
    console.error('[ADMIN] Error fetching tournaments:', error);
    res.status(500).json({ error: 'Failed to fetch tournaments' });
  }
});

// Generate bracket for tournament (closes registration and starts tournament)
router.post('/tournaments/:tournamentId/generate-bracket', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { tournamentId } = req.params;
    
    // Close registration
    await TournamentService.updateTournament(tournamentId, { status: 'REGISTRATION_CLOSED' });
    
    // Generate bracket
    const result = await TournamentBracketService.generateBracket(tournamentId);
    
    res.json({ success: true, ...result });
  } catch (error) {
    console.error('[ADMIN] Error generating bracket:', error);
    res.status(400).json({ error: error.message || 'Failed to generate bracket' });
  }
});

router.put('/events/:eventId', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { eventId } = req.params;
    const event = await EventService.updateEvent(eventId, req.body);
    res.json({ event });
  } catch (error) {
    console.error('[ADMIN] Error updating event:', error);
    res.status(400).json({ error: error.message || 'Failed to update event' });
  }
});

router.post('/events/:eventId/status', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { eventId } = req.params;
    const { status } = req.body || {};

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const event = await EventService.updateEventStatus(eventId, status);
    res.json({ event });
  } catch (error) {
    console.error('[ADMIN] Error updating event status:', error);
    res.status(400).json({ error: error.message || 'Failed to update event status' });
  }
});

// Get all active games with player details
router.get('/games', authenticateToken, isAdmin, async (req, res) => {
  try {
    const games = await prisma.game.findMany({
      where: {
        status: {
          in: ['WAITING', 'BIDDING', 'PLAYING']
        }
      },
      include: {
        players: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                discordId: true,
                avatarUrl: true
              }
            }
          },
          orderBy: {
            seatIndex: 'asc'
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Transform the data to match the expected format
    const gamesWithPlayers = games.map(game => ({
      id: game.id,
      status: game.status,
      createdAt: game.createdAt,
      updatedAt: game.updatedAt,
      settings: game.settings,
      currentPlayer: game.currentPlayer,
      currentTrick: game.currentTrick,
      currentRound: game.currentRound,
      players: game.players.map(gp => ({
        seatIndex: gp.seatIndex,
        userId: gp.userId,
        user: gp.user,
        isReady: gp.isReady,
        type: gp.type || 'human'
      }))
    }));

    res.json({ games: gamesWithPlayers });
  } catch (error) {
    console.error('[ADMIN] Error fetching games:', error);
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

// Delete selected games
router.delete('/games', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { gameIds } = req.body;
    
    if (!Array.isArray(gameIds) || gameIds.length === 0) {
      return res.status(400).json({ error: 'Game IDs array is required' });
    }

    let deletedCount = 0;
    const errors = [];

    // Delete each game properly with cleanup
    for (const gameId of gameIds) {
      try {
        // Emit game_closed event to connected players
        io.to(gameId).emit('game_closed', { 
          gameId,
          reason: 'Game deleted by admin'
        });

        // Clean up Redis cache
        await redisGameState.cleanupGame(gameId);
        
        // CONSOLIDATED: GameManager removed - using GameService directly
        // CONSOLIDATED: GameManager removed - using GameService directly
        
        // Delete from database (with all related records)
        await GameService.deleteGame(gameId);
        
        deletedCount++;
        console.log(`[ADMIN] Deleted game ${gameId}`);
      } catch (error) {
        console.error(`[ADMIN] Error deleting game ${gameId}:`, error);
        errors.push({ gameId, error: error.message });
      }
    }

    console.log(`[ADMIN] Successfully deleted ${deletedCount}/${gameIds.length} games`);

    res.json({ 
      success: true, 
      deletedCount,
      requestedCount: gameIds.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('[ADMIN] Error deleting games:', error);
    res.status(500).json({ error: 'Failed to delete games' });
  }
});

// Remove specific player from game seat
router.delete('/games/:gameId/players/:userId', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { gameId, userId } = req.params;

    // Remove the player from the game
    const deletedPlayer = await prisma.gamePlayer.deleteMany({
      where: {
        gameId: gameId,
        userId: userId
      }
    });

    if (deletedPlayer.count === 0) {
      return res.status(404).json({ error: 'Player not found in game' });
    }

    console.log(`[ADMIN] Removed player ${userId} from game ${gameId}`);

    res.json({ 
      success: true, 
      message: 'Player removed from game successfully' 
    });
  } catch (error) {
    console.error('[ADMIN] Error removing player from game:', error);
    res.status(500).json({ error: 'Failed to remove player from game' });
  }
});

// Force logout all users: clears Redis sessions and broadcasts socket event
router.post('/force-logout', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await redisSessionService.clearAllSessions();

    // Broadcast to all connected sockets
    io.emit('force_logout', {
      reason: 'server_update',
      message: 'You have been logged out due to a server update. Please log in again.'
    });

    return res.json({ success: true, deletedSessions: result.deleted || 0 });
  } catch (error) {
    console.error('[ADMIN] Error forcing logout:', error);
    return res.status(500).json({ error: 'Failed to force logout' });
  }
});

// One-time ops endpoint: allow triggering force-logout with a secret header
// Header: x-force-logout-key: <FORCE_LOGOUT_KEY>
router.post('/force-logout-global', async (req, res) => {
  try {
    const key = req.headers['x-force-logout-key'];
    if (!process.env.FORCE_LOGOUT_KEY || key !== process.env.FORCE_LOGOUT_KEY) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const result = await redisSessionService.clearAllSessions();
    io.emit('force_logout', {
      reason: 'server_update',
      message: 'You have been logged out due to a server update. Please log in again.'
    });

    return res.json({ success: true, deletedSessions: result.deleted || 0 });
  } catch (error) {
    console.error('[ADMIN] Error forcing logout (global key):', error);
    return res.status(500).json({ error: 'Failed to force logout' });
  }
});

// Emergency game deletion endpoint
router.delete('/emergency-delete-game/:gameId', async (req, res) => {
  try {
    const key = req.headers['x-force-logout-key'];
    if (!process.env.FORCE_LOGOUT_KEY || key !== process.env.FORCE_LOGOUT_KEY) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { gameId } = req.params;
    console.log(`[ADMIN] Emergency deleting game ${gameId}`);

    // Emit game_closed event to connected players
    io.to(gameId).emit('game_closed', { 
      gameId,
      reason: 'Game deleted by admin'
    });

    // Clean up Redis cache
    await redisGameState.cleanupGame(gameId);
    
    // CONSOLIDATED: GameManager removed - using GameService directly
    // CONSOLIDATED: GameManager removed - using GameService directly
    
    // Delete from database
    await GameService.deleteGame(gameId);

    return res.json({ success: true, message: `Game ${gameId} deleted` });
  } catch (error) {
    console.error('[ADMIN] Error emergency deleting game:', error);
    return res.status(500).json({ error: 'Failed to delete game' });
  }
});

// Emergency remove all players from game to break redirect loop
router.post('/emergency-clear-game/:gameId', async (req, res) => {
  try {
    const key = req.headers['x-force-logout-key'];
    if (!process.env.FORCE_LOGOUT_KEY || key !== process.env.FORCE_LOGOUT_KEY) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { gameId } = req.params;
    console.log(`[ADMIN] Emergency clearing players from game ${gameId}`);

    // Remove all players from the game
    await prisma.gamePlayer.deleteMany({
      where: { gameId }
    });

    // Emit game_closed event to connected players
    io.to(gameId).emit('game_closed', { 
      gameId,
      reason: 'Game cleared by admin'
    });

    // Clean up Redis cache
    await redisGameState.cleanupGame(gameId);

    return res.json({ success: true, message: `Cleared all players from game ${gameId}` });
  } catch (error) {
    console.error('[ADMIN] Error clearing game:', error);
    return res.status(500).json({ error: 'Failed to clear game' });
  }
});

// Force delete stuck games
router.delete('/force-delete-game/:gameId', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { gameId } = req.params;
    console.log(`[ADMIN] Force deleting game ${gameId}`);

    // Emit game_closed event to connected players
    io.to(gameId).emit('game_closed', { 
      gameId,
      reason: 'Game force deleted by admin'
    });

    // Clean up Redis cache
    await redisGameState.cleanupGame(gameId);
    
    // CONSOLIDATED: GameManager removed - using GameService directly
    // CONSOLIDATED: GameManager removed - using GameService directly
    
    // Force delete from database
    const result = await ForceGameDeletionService.forceDeleteGame(gameId);

    if (result.success) {
      console.log(`[ADMIN] Successfully force deleted game ${gameId}`);
      res.json({ 
        success: true, 
        message: result.message,
        steps: result.steps
      });
    } else {
      console.error(`[ADMIN] Failed to force delete game ${gameId}:`, result.error);
      res.status(500).json({ 
        success: false, 
        error: result.error 
      });
    }
  } catch (error) {
    console.error('[ADMIN] Error force deleting game:', error);
    res.status(500).json({ error: 'Failed to force delete game' });
  }
});

// Get stuck games
router.get('/stuck-games', authenticateToken, isAdmin, async (req, res) => {
  try {
    const stuckGames = await ForceGameDeletionService.findStuckGames();
    res.json({ success: true, stuckGames });
  } catch (error) {
    console.error('[ADMIN] Error finding stuck games:', error);
    res.status(500).json({ error: 'Failed to find stuck games' });
  }
});

// Get detailed game information
router.get('/game-details/:gameId', authenticateToken, isAdmin, async (req, res) => {
  try {
    const { gameId } = req.params;
    const details = await ForceGameDeletionService.getGameDetails(gameId);
    
    if (!details.found) {
      return res.status(404).json({ error: 'Game not found' });
    }
    
    res.json({ success: true, details });
  } catch (error) {
    console.error('[ADMIN] Error getting game details:', error);
    res.status(500).json({ error: 'Failed to get game details' });
  }
});

export default router;