import type { AuthenticatedSocket } from '../../socket-auth/socketAuth';
import { prisma } from '../../../lib/prisma';

export async function handleJoinGame(socket: AuthenticatedSocket, gameId: string) {
  try {
    console.log(`[GAME JOIN] User ${socket.userId} attempting to join game ${gameId}`);
    
    // Check if game exists in database (no players relation on Game model)
    const dbGame = await prisma.game.findUnique({
      where: { id: gameId }
    });
    
    if (!dbGame) {
      console.log(`[GAME JOIN] Game ${gameId} not found in database`);
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
            username: userMap.get(p.userId)?.username || `Bot ${p.userId.slice(-4)}`,
            avatarUrl: userMap.get(p.userId)?.avatarUrl || null,
            type: p.isHuman ? 'human' : 'bot',
            seatIndex: p.seatIndex,
            teamIndex: p.teamIndex ?? null,
            bid: bidMap.get(p.userId) ?? null,
            tricks: null as number | null,
            points: null as number | null,
            bags: null as number | null
          })),
          hands: hands,
          bidding: dbGame.status === 'BIDDING' ? {
            currentPlayer: gamePlayers.find(p => p.seatIndex === 0)?.userId || '',
            currentBidderIndex: 0,
            bids: gamePlayers.map(p => bidMap.get(p.userId) ?? null)
          } : undefined,
          play: dbGame.status === 'PLAYING' ? {
            currentPlayer: gamePlayers.find(p => p.seatIndex === 1)?.userId || '',
            currentPlayerIndex: 1,
            currentTrick: [],
            tricks: [],
            trickNumber: 0,
            spadesBroken: false
          } : undefined,
          rules: {
            minPoints: dbGame.minPoints || -100,
            maxPoints: dbGame.maxPoints || 500,
            allowNil: dbGame.nilAllowed ?? true,
            allowBlindNil: dbGame.blindNilAllowed ?? false,
            assassin: false,
            screamer: false
          },
          createdAt: dbGame.createdAt
        };
        
        socket.emit('game_joined', { 
          gameId, 
          seatIndex: existingPlayer.seatIndex,
          game: dbGame,
          activeGameState: activeGameState
        });
        
        // Also emit game_started if the game has hands data
        if (hands.some(hand => hand && hand.length > 0)) {
          const gameStartedData = {
            ...activeGameState,
            hands: hands.map((hand, index) => ({
              playerId: gamePlayers[index]?.userId || `player_${index}`,
              hand: hand || []
            }))
          };
          
          socket.emit('game_started', gameStartedData);
          socket.emit('game_update', activeGameState);
        }
      } else {
        // For waiting games, send basic game data
        socket.emit('game_joined', { 
          gameId, 
          seatIndex: existingPlayer.seatIndex,
          game: dbGame 
        });
      }
      return;
    }
    
    // Only allow new players to join if game is waiting
    if (dbGame.status !== 'WAITING') {
      socket.emit('error', { message: 'Game is not accepting new players' });
      return;
    }
    
    // Find an available seat
    const occupiedSeats = new Set(gamePlayers.map(p => p.seatIndex));
    let targetSeatIndex = -1;
    for (let i = 0; i < 4; i++) {
      if (!occupiedSeats.has(i)) {
        targetSeatIndex = i;
        break;
      }
    }
    
    if (targetSeatIndex === -1) {
      socket.emit('error', { message: 'Game is full' });
      return;
    }
    
    // Add player to database
    await prisma.gamePlayer.create({
      data: {
        gameId: gameId,
        userId: socket.userId!,
        seatIndex: targetSeatIndex,
        teamIndex: targetSeatIndex % 2, // Simple team assignment
        isHuman: true
      }
    });
    
    // Join socket room
    socket.join(gameId);
    
    // Emit success
    socket.emit('game_joined', { 
      gameId, 
      seatIndex: targetSeatIndex,
      game: dbGame 
    });
    
    // Notify other players
    socket.to(gameId).emit('player_joined', {
      userId: socket.userId,
      seatIndex: targetSeatIndex
    });
    
    console.log(`[GAME JOIN] User ${socket.userId} successfully joined game ${gameId} at seat ${targetSeatIndex}`);
    
  } catch (error) {
    console.error('[GAME JOIN] Error joining game:', error);
    socket.emit('error', { message: 'Failed to join game' });
  }
}
