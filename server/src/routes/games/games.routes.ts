import { Router } from 'express';
import { Request, Response } from 'express';
import { games } from '../../gamesStore';
import { io } from '../../index';
import { requireAuth } from '../../middleware/auth.middleware';
import { createGame } from './create/gameCreation';
import { enrichGameForClient } from './shared/gameUtils';
import { deleteUnratedGameFromDatabase } from '../../lib/hand-completion/game/gameCompletion';
import { joinGame } from './join/gameJoining';
import { prismaNew } from '../../newdb/client';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    avatar?: string;
  };
}

const router = Router();

// Create a new game
router.post('/', requireAuth, createGame);

// Join a game

// Spectate a game
router.post('/:id/spectate', requireAuth, async (req: any, res: Response) => {
  try {
    const gameId = req.params.id;
    const userId = (req as AuthenticatedRequest).user!.id;
    const { username, avatar } = req.body;

    const game = games.find(g => g.id === gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Prevent duplicate spectate
    if ((game as any).spectators?.some((s: any) => s.id === userId)) {
      return res.status(400).json({ error: 'Already spectating' });
    }

    // Prevent joining as both player and spectator
    if (game.players.some(p => p && p.id === userId)) {
      return res.status(400).json({ error: 'Already joined as player' });
    }

    // Initialize spectators array if it doesn't exist
    if (!(game as any).spectators) {
      (game as any).spectators = [];
    }

    // Add to spectators
    (game as any).spectators.push({
      id: userId,
      username: username || 'Unknown',
      avatar: avatar || '/default-pfp.jpg',
      type: 'human',
    });

    // Join the socket room for chat
    const userSocket = [...io.sockets.sockets.values()].find(s => (s as any).userId === userId);
    if (userSocket) {
      userSocket.join(gameId);
      console.log(`[SPECTATE] User ${userId} joined socket room ${gameId} as spectator`);
    }

    // Emit game update to all players in the room
    io.to(gameId).emit('game_update', enrichGameForClient(game));
    
    // Update lobby for all clients
    const lobbyGames = games.filter(g => {
      if ((g as any).league && g.status === 'WAITING') {
        return false;
      }
      return true;
    });
    io.emit('games_updated', lobbyGames.map(g => enrichGameForClient(g)));

    res.json({ success: true, game: enrichGameForClient(game) });
  } catch (error) {
    console.error('Error spectating game:', error);
    res.status(500).json({ error: 'Failed to spectate game' });
  }
});router.post('/:id/join', requireAuth as any, joinGame as any);

// Get all games - NEW DB ONLY
router.get('/', async (req: Request, res: Response) => {
  try {
    // Query games from NEW database
    const dbGames = await prismaNew.game.findMany({
      where: {
        status: { in: ['WAITING' as any, 'BIDDING' as any, 'PLAYING' as any] }
      },
      orderBy: { createdAt: 'desc' as any }
    });

    // For each game, fetch players from GamePlayer
    const clientGames = [] as any[];
    for (const dbGame of dbGames) {
      const players = await prismaNew.gamePlayer.findMany({
      const userIds = players.map(p => p.userId);
      const users = await prismaNew.user.findMany({
        where: { id: { in: userIds } }
      });
      const userMap = new Map(users.map(u => [u.id, u]));        orderBy: { seatIndex: 'asc' as any }
      });

      clientGames.push({
        id: dbGame.id,
        status: dbGame.status,
        gameMode: (dbGame as any).mode || 'PARTNERS',
        rated: (dbGame as any).isRated ?? false,
        league: (dbGame as any).isLeague ?? false,
        solo: ((dbGame as any).mode === 'SOLO') || false,
        players: players.map(p => ({
          id: p.userId,
          username: userMap.get(p.userId)?.username || `Bot ${p.userId.slice(-4)}` as any,
          avatar: userMap.get(p.userId)?.avatarUrl || null as any,
          type: p.isHuman ? 'human' : 'bot',
          position: p.seatIndex,
          team: p.teamIndex ?? null,
          bid: null as any,
          tricks: null as any,
          points: null as any,
          bags: null as any
        })),
        rules: {},
        createdAt: (dbGame as any).createdAt
      });
    }

    res.json({ success: true, games: clientGames });
  } catch (error) {
    console.error('Error fetching games:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch games' });
  }
});

// Get a specific game - NEW DB ONLY
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const dbGame = await prismaNew.game.findUnique({ where: { id: req.params.id } });
    if (!dbGame) return res.status(404).json({ error: 'Game not found' });

    const players = await prismaNew.gamePlayer.findMany({
      const userIds = players.map(p => p.userId);
      const users = await prismaNew.user.findMany({
        where: { id: { in: userIds } }
      });
      const userMap = new Map(users.map(u => [u.id, u]));      orderBy: { seatIndex: 'asc' as any }
    });

    const game = {
      id: dbGame.id,
      status: dbGame.status,
      players: players.map((p: any) => ({
        id: p.userId,
        username: userMap.get(p.userId)?.username || `Bot ${p.userId.slice(-4)}` as any,
        avatar: userMap.get(p.userId)?.avatarUrl || null as any,
        type: p.isHuman ? 'human' : 'bot',
        position: p.seatIndex,
        team: p.teamIndex,
      })),
      rated: (dbGame as any).isRated ?? false,
      league: (dbGame as any).isLeague ?? false,
      createdAt: (dbGame as any).createdAt
    } as any;

    res.json({ success: true, game });
  } catch (error) {
    console.error('Error fetching game:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch game' });
  }
});

// Leave a game - ensure deletion from NEW DB for unrated with no humans
router.post('/:id/leave', requireAuth, async (req: any, res: Response) => {
  try {
    const gameId = req.params.id;
    const userId = (req as AuthenticatedRequest).user!.id;

    const game = games.find(g => g.id === gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }

    // Remove from players
    // Make user leave the socket room
    const userSocket = [...io.sockets.sockets.values()].find(s => (s as any).userId === userId);
    if (userSocket) {
      userSocket.leave(gameId);
      console.log(`[LEAVE GAME] User ${userId} left socket room ${gameId}`);
    }
    const playerIdx = game.players.findIndex(p => p && p.id === userId);
    if (playerIdx !== -1) {
      game.players[playerIdx] = null;
    }

    // Remove from spectators
    if (Array.isArray((game as any).spectators)) {
      const specIdx = (game as any).spectators.findIndex((s: any) => s.id === userId);
      if (specIdx !== -1) {
        (game as any).spectators.splice(specIdx, 1);
      }
    }

    // Emit game update to all players in the room first
    io.to(gameId).emit('game_update', enrichGameForClient(game));
    
    // If no human players remain and not a league game, remove game
    const hasHumanPlayers = game.players.some(p => p && p.type === 'human');
    const isLeague = Boolean((game as any).league);

    if (!hasHumanPlayers && !isLeague) {
      console.log(`[LEAVE GAME] No human players remaining in game ${gameId}`);
      
      // If this is an unrated game, clean it up completely in NEW DB
      if (!game.rated) {
        console.log(`[LEAVE GAME] Cleaning up unrated game ${gameId} from NEW database`);
        try {
          // Collect round and trick ids
          const rounds = await prismaNew.round.findMany({ where: { gameId: game.id }, select: { id: true } });
          const roundIds = rounds.map(r => r.id);
          if (roundIds.length > 0) {
            const tricks = await prismaNew.trick.findMany({ where: { roundId: { in: roundIds as any } }, select: { id: true } });
            const trickIds = tricks.map(t => t.id);
            if (trickIds.length > 0) {
              await prismaNew.trickCard.deleteMany({ where: { trickId: { in: trickIds as any } } });
            }
            await prismaNew.trick.deleteMany({ where: { roundId: { in: roundIds as any } } });
            await prismaNew.roundBid.deleteMany({ where: { roundId: { in: roundIds as any } } });
            await prismaNew.roundHandSnapshot.deleteMany({ where: { roundId: { in: roundIds as any } } });
            await prismaNew.roundScore.deleteMany({ where: { roundId: { in: roundIds as any } } });
            await prismaNew.playerRoundStats.deleteMany({ where: { roundId: { in: roundIds as any } } });
            // Finally delete rounds
            await prismaNew.round.deleteMany({ where: { id: { in: roundIds as any } } });
          }
          await prismaNew.gameResult.deleteMany({ where: { gameId: game.id } });
          await prismaNew.eventGame.deleteMany({ where: { gameId: game.id } });
          await prismaNew.gamePlayer.deleteMany({ where: { gameId: game.id } });
          await prismaNew.game.delete({ where: { id: game.id } });

          // Remove game from memory
          const index = games.findIndex(g => g.id === gameId);
          if (index !== -1) games.splice(index, 1);
          
          // Notify all players that the game is closed
          io.to(gameId).emit('game_closed', { gameId, reason: 'no_human_players_remaining' });
          
          console.log(`[LEAVE GAME] Successfully cleaned up unrated game ${gameId} (NEW DB)`);
        } catch (error) {
          console.error(`[LEAVE GAME] Failed to clean up unrated game ${gameId} (NEW DB):`, error);
        }
      } else {
        // For rated games, just close the game but don't delete from database
        console.log(`[LEAVE GAME] Closing rated game ${gameId} (keeping in NEW database)`);
        
        // Remove game from memory
        const index = games.findIndex(g => g.id === gameId);
        if (index !== -1) games.splice(index, 1);
        
        // Notify all players that the game is closed
        io.to(gameId).emit('game_closed', { gameId, reason: 'no_human_players_remaining' });
      }
    }

    // Update lobby for all clients
    const lobbyGames = games.filter(g => {
      if ((g as any).league && g.status === 'WAITING') {
        return false;
      }
      return true;
    });
    console.log(`[LEAVE GAME] Connected sockets: ${io.sockets.sockets.size}`);
    console.log(`[LEAVE GAME] Emitting games_updated to all clients, ${lobbyGames.length} games`);
    io.emit('games_updated', lobbyGames.map(g => enrichGameForClient(g)));
    
    // Also emit all games (including league games) for real-time league game detection
    console.log(`[LEAVE GAME] Emitting all_games_updated to all clients, ${games.length} total games`);
    io.emit('all_games_updated', games.map(g => enrichGameForClient(g)));

    res.json({ success: true });
  } catch (error) {
    console.error('Error leaving game:', error);
    res.status(500).json({ error: 'Failed to leave game' });
  }
});

export default router;
