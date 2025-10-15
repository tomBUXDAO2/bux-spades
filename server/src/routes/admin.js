import express from 'express';
import { prisma } from '../config/databaseFirst.js';
import { authenticateToken } from '../middleware/auth.js';
import { GameService } from '../services/GameService.js';
import { gameManager } from '../services/GameManager.js';
import redisGameState from '../services/RedisGameStateService.js';
import { io } from '../config/server.js';
import redisSessionService from '../services/RedisSessionService.js';

const router = express.Router();

// Check if user is admin
const isAdmin = async (req, res, next) => {
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
};

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
        
        // Remove from GameManager memory
        gameManager.removeGame(gameId);
        
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

export default router;

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