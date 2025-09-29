// @ts-nocheck
import type { AuthenticatedSocket } from '../../../../types/socket';
import { io } from '../../../index';
import { prisma } from '../../../lib/prisma';
import { gamesStore } from '../../../gamesStore';

export async function handleJoinGame(socket: AuthenticatedSocket, gameId: string) {
  try {
    console.log(`[GAME JOIN] User ${socket.userId} attempting to join game ${gameId}`);
    
    // Check if game exists in database (no players relation on Game model)
    const dbGame = await prisma.game.findUnique({
      where: { id: gameId }
    });
    
    if (!dbGame) {
      console.log(`[GAME JOIN] Game ${gameId} not found in database`);
      // Remove stale in-memory game if exists
      const stale = gamesStore.getGame(gameId);
      if (stale) {
        console.log(`[GAME JOIN] Removing stale in-memory game ${gameId} since it does not exist in DB`);
        gamesStore.removeGame(gameId);
      }
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    // Load existing players for this game
    const gamePlayers = await prisma.gamePlayer.findMany({
      where: { gameId },
      orderBy: { seatIndex: 'asc' }
    });
    
    // Check if user is already in the game
    const existingPlayer = gamePlayers.find(p => p.userId === socket.userId);
    if (existingPlayer) {
      console.log(`[GAME JOIN] User ${socket.userId} already in game ${gameId} at seat ${existingPlayer.seatIndex}`);
      console.log(`[GAME JOIN] Adding socket ${socket.id} to room ${gameId}`);
      socket.join(gameId);
      console.log(`[GAME JOIN] Socket ${socket.id} successfully joined room ${gameId}`);
      
      // Debug: Check if socket is actually in the room
      const { io } = await import('../../../index');
      const room = io.sockets.adapter.rooms.get(gameId);
      console.log(`[GAME JOIN DEBUG] Room ${gameId} has ${room?.size || 0} sockets:`, Array.from(room || []));
      
      // For active games, send the complete game state including hands and current player
      if (dbGame.status === 'BIDDING' || dbGame.status === 'PLAYING') {
        console.log(`[GAME JOIN] Sending complete game state for active game ${gameId}`);
        
        // Get users for player data
        const userIds = gamePlayers.map(p => p.userId);
        const users = await prisma.user.findMany({
          where: { id: { in: userIds } }
        });
        const userMap = new Map(users.map(u => [u.id, u]));
        
        // Get current round and bids
        const currentRound = await prisma.round.findFirst({
          where: { gameId: gameId },
          orderBy: { roundNumber: 'desc' }
        });
        
        const bids = currentRound ? await prisma.roundBid.findMany({
          where: { roundId: currentRound.id }
        }) : [];
        
        const bidMap = new Map(bids.map(b => [b.userId, b.bid]));
        
        // Get hand snapshots
        const handSnapshots = currentRound ? await prisma.roundHandSnapshot.findMany({
          where: { roundId: currentRound.id },
          orderBy: { seatIndex: 'asc' }
        }) : [];
        
        // Reconstruct hands array
        const hands = new Array(4).fill(null);
        handSnapshots.forEach(snapshot => {
          hands[snapshot.seatIndex] = snapshot.cards;
        });
        
        // Reconstruct complete game state
        const activeGameState = {
          id: dbGame.id,
          status: dbGame.status,
          mode: dbGame.mode || 'PARTNERS',
          rated: dbGame.isRated ?? false,
          league: dbGame.isLeague ?? false,
          solo: (dbGame.mode === 'SOLO') || false,
          minPoints: dbGame.minPoints || -100,
          maxPoints: dbGame.maxPoints || 500,
          buyIn: dbGame.buyIn || 100000,
          currentPlayer: dbGame.status === 'BIDDING' ? gamePlayers.find(p => p.seatIndex === 0)?.userId : gamePlayers.find(p => p.seatIndex === 1)?.userId,
          players: gamePlayers.map(p => ({
            id: p.userId,
            username: userMap.get(p.userId)?.username || `Player ${p.userId.slice(-4)}`,
            type: p.isHuman ? 'human' : 'bot',
            position: p.seatIndex,
            team: p.teamIndex ?? (p.seatIndex % 2),
            bid: bidMap.get(p.userId) ?? null,
            tricks: 0,
            points: 0,
            hand: hands[p.seatIndex] || []
          })),
          hands: hands,
          bidding: {
            bids: gamePlayers.map(p => bidMap.get(p.userId) ?? null),
            currentBidderIndex: 0,
            currentPlayer: gamePlayers[0]?.userId || ''
          },
          play: {
            currentPlayer: gamePlayers[0]?.userId || '',
            currentPlayerIndex: 0,
            currentTrick: [] as any[],
            tricks: [] as any[],
            trickNumber: 0,
            spadesBroken: false
          },
          dealerIndex: 0,
          currentRound: currentRound?.roundNumber || 1,
          dbGameId: dbGame.id
        };

        socket.emit('game_joined', { gameId, activeGameState });
        return;
      }

      // For WAITING games, still send a minimal state so client UI doesn't get nulls
      const users = await prisma.user.findMany({ where: { id: { in: gamePlayers.map(p => p.userId) } } });
      const userMap = new Map(users.map(u => [u.id, u]));
        const waitingState = {
        id: dbGame.id,
        status: dbGame.status,
        mode: dbGame.mode || 'PARTNERS',
        rated: dbGame.isRated ?? false,
        league: dbGame.isLeague ?? false,
        minPoints: dbGame.minPoints || -100,
        maxPoints: dbGame.maxPoints || 200,
        buyIn: dbGame.buyIn || 100000,
        players: gamePlayers.map(p => ({
          id: p.userId,
          username: userMap.get(p.userId)?.username || `Player ${p.userId.slice(-4)}`,
          avatarUrl: userMap.get(p.userId)?.avatarUrl || null,
          type: p.isHuman ? 'human' : 'bot',
          position: p.seatIndex,
          team: p.teamIndex ?? (p.seatIndex % 2),
          bid: null,
          tricks: 0,
          points: 0,
          hand: []
        })),
        bidding: { bids: [null, null, null, null], currentBidderIndex: 0, currentPlayer: '' },
        play: { currentPlayer: '', currentPlayerIndex: 0, currentTrick: [], tricks: [], trickNumber: 0, spadesBroken: false },
        dealerIndex: 0,
        currentRound: 1,
        dbGameId: dbGame.id
      };
      socket.emit('game_joined', { gameId, activeGameState: waitingState });
      return;
    }
    
    // If game is not active, add user to game and send initial state
    console.log(`[GAME JOIN] Game ${gameId} is not active, adding user ${socket.userId} to game`);
    
    // Add user to game
    try {
      // Choose first free seat (0..3)
      const taken = new Set(gamePlayers.map(p => p.seatIndex).filter((n: any) => typeof n === 'number'));
      let seatIndex = 0;
      while (seatIndex < 4 && taken.has(seatIndex)) seatIndex++;
      if (seatIndex >= 4) {
        socket.emit('error', { message: 'Game is full' });
        return;
      }
      const playerId = `player_${gameId}_${socket.userId}`;
      await prisma.gamePlayer.upsert({
        where: { id: playerId },
        update: {
          seatIndex,
          teamIndex: seatIndex % 2,
          isHuman: true
        },
        create: {
          id: playerId,
          gameId,
          userId: socket.userId,
          seatIndex,
          isHuman: true,
          teamIndex: seatIndex % 2
        }
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        console.log('[GAME JOIN] Unique seat constraint encountered, proceeding without creating duplicate');
      } else {
        throw err;
      }
    }
    
    // Join room
    socket.join(gameId);
    console.log(`[GAME JOIN] Socket ${socket.id} successfully joined room ${gameId}`);
    
    // Send initial game state for WAITING game with minimal shape
    const refreshedPlayers = await prisma.gamePlayer.findMany({ where: { gameId }, orderBy: { seatIndex: 'asc' } });
    const users2 = await prisma.user.findMany({ where: { id: { in: refreshedPlayers.map(p => p.userId) } } });
    const userMap2 = new Map(users2.map(u => [u.id, u]));
    const waitingState2 = {
      id: dbGame.id,
      status: dbGame.status,
      mode: dbGame.mode || 'PARTNERS',
      rated: dbGame.isRated ?? false,
      league: dbGame.isLeague ?? false,
      minPoints: dbGame.minPoints || -100,
      maxPoints: dbGame.maxPoints || 200,
      buyIn: dbGame.buyIn || 100000,
      players: refreshedPlayers.map(p => ({
        id: p.userId,
        username: userMap2.get(p.userId)?.username || `Player ${p.userId.slice(-4)}`,
        avatarUrl: userMap2.get(p.userId)?.avatarUrl || null,
        type: p.isHuman ? 'human' : 'bot',
        position: p.seatIndex,
        team: p.teamIndex ?? (p.seatIndex % 2),
        bid: null,
        tricks: 0,
        points: 0,
        hand: []
      })),
      bidding: { bids: [null, null, null, null], currentBidderIndex: 0, currentPlayer: '' },
      play: { currentPlayer: '', currentPlayerIndex: 0, currentTrick: [], tricks: [], trickNumber: 0, spadesBroken: false },
      dealerIndex: 0,
      currentRound: 1,
      dbGameId: dbGame.id
    };
    socket.emit('game_joined', { gameId, activeGameState: waitingState2 });
    
  } catch (error) {
    console.error(`[GAME JOIN] Error handling game join for socket ${socket.id}:`, error);
    socket.emit('error', { message: 'Failed to join game' });
  }
}