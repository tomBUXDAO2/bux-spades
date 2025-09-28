import type { AuthenticatedSocket } from '../../../types/socket';
import { io } from '../../../index';
import { prisma } from '../../../lib/prisma';
import { newdbCreateRound } from '../../../newdb/writers';

/**
 * Handle game start socket event
 */
export async function handleStartGame(socket: AuthenticatedSocket, data: any): Promise<void> {
  try {
    console.log('[GAME START] User wants to start game:', { gameId: data.gameId, userId: socket.userId });
    
    if (!socket.isAuthenticated || !socket.userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    const { gameId } = data;
    if (!gameId) {
      socket.emit('error', { message: 'Game ID required' });
      return;
    }

    // Check if game exists
    const game = await prisma.game.findUnique({
      where: { id: gameId }
    });

    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Check if user is the game creator
    if (game.createdById !== socket.userId) {
      socket.emit('error', { message: 'Only the game creator can start the game' });
      return;
    }

    // Check if game is in waiting state
    if (game.status !== 'WAITING') {
      socket.emit('error', { message: 'Game is not in waiting state' });
      return;
    }

    // Get current players
    const existingPlayers = await prisma.gamePlayer.findMany({
      where: { gameId },
      orderBy: { seatIndex: 'asc' }
    });
    const occupiedSeats = new Set(existingPlayers.map(p => p.seatIndex));
    const emptySeats = [0, 1, 2, 3].filter(seat => !occupiedSeats.has(seat));
    
    // Fill empty seats with bots
    for (const seatIndex of emptySeats) {
      const botId = `bot_${Math.floor(Math.random() * 1000)}_${Date.now()}`;
      const botUsername = `Bot${Math.floor(Math.random() * 1000)}`;
      
      // Create bot user
      await prisma.user.create({
        data: {
          id: botId,
          username: botUsername,
          avatarUrl: '/bot-avatar.jpg',
          coins: 1000000,
          discordId: `bot_${botId}`, // Required field for bots
          // isBot: true // Field doesn't exist in schema
        }
      });
      
      // Add bot to game
      await prisma.gamePlayer.create({
        data: {
          id: `player_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          gameId: gameId,
          userId: botId,
          seatIndex: seatIndex,
          teamIndex: seatIndex % 2, // Alternate teams
          isHuman: false,
          joinedAt: new Date()
        }
      });
      
      console.log(`[GAME START] Added bot ${botUsername} to seat ${seatIndex}`);
    }
    
    // Deal cards to all players
    const { dealCards } = await import('../../dealing/cardDealing');
    
    // Create a mock players array for dealing (GamePlayer | null)[] format
    const mockPlayers = [
      { id: 'player_0', seatIndex: 0, username: 'Player 1', avatarUrl: '', type: 'human' as const },
      { id: 'player_1', seatIndex: 1, username: 'Player 2', avatarUrl: '', type: 'human' as const },
      { id: 'player_2', seatIndex: 2, username: 'Player 3', avatarUrl: '', type: 'human' as const },
      { id: 'player_3', seatIndex: 3, username: 'Player 4', avatarUrl: '', type: 'human' as const }
    ];
    
    // Randomly assign dealer
    const dealerIndex = Math.floor(Math.random() * 4);
    const hands = dealCards(mockPlayers, dealerIndex);
    
    // Update the game object with the correct dealer index
    game.dealerIndex = dealerIndex;
    
    console.log(`[GAME START] Dealt cards for game ${gameId}, dealer at position ${dealerIndex}`);
    
    // Create round and log hands to RoundHandSnapshot table
    try {
      const initialHands = hands.map((hand, seatIndex) => ({
        seatIndex,
        cards: hand.map(c => ({ suit: c.suit, rank: String(c.rank) }))
      }));
      
      await newdbCreateRound({
        gameId: gameId,
        roundNumber: 1, // First round
        dealerSeatIndex: dealerIndex,
        initialHands
      });
      
      console.log(`[GAME START] Created round 1 and logged hands to database for game ${gameId}`);
    } catch (error) {
      console.error(`[GAME START] Failed to create round and log hands:`, error);
    }
    
    // Count human players to determine if game is rated
    const humanPlayers = await prisma.gamePlayer.count({
      where: { gameId, isHuman: true }
    });
    
    const isRated = humanPlayers === 4;
    
    // Get current players first
    const currentPlayers = await prisma.gamePlayer.findMany({
      where: { gameId },
      orderBy: { seatIndex: 'asc' }
    });
    
    // Determine dealer and first bidder
    const firstBidderIndex = (dealerIndex + 1) % 4; // First bidder is position 3
    const firstBidder = currentPlayers.find(p => p.seatIndex === firstBidderIndex);
    
    if (!firstBidder) {
      socket.emit('error', { message: 'Could not determine first bidder' });
      return;
    }
    
    // Update game status and rating
    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: 'BIDDING',
        isRated: isRated
      }
    });
    
    // Get updated game for client
    const updatedGame = await prisma.game.findUnique({
      where: { id: gameId }
    });
    
    // Fetch user data for all current players
    const userIds = currentPlayers.map(p => p.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } }
    });
    const userMap = new Map(users.map(u => [u.id, u]));
    
    // Add user relationship to gamePlayers
    const gamePlayersWithUsers = currentPlayers.map(gp => ({
      ...gp,
      user: userMap.get(gp.userId)
    }));
    
    // Add bidding state to the game object for enrichment
    const gameWithBiddingState = {
      ...updatedGame,
      gamePlayers: gamePlayersWithUsers,
      bidding: {
        currentPlayer: firstBidder.userId,
        currentBidderIndex: firstBidderIndex,
        bids: [null, null, null, null] as (number | null)[],
        nilBids: {}
      },
      dealerIndex: dealerIndex
    };
    
    const { enrichGameForClient } = require('../../../routes/games/shared/gameUtils');
    const enrichedGame = enrichGameForClient(gameWithBiddingState);
    
    // Notify all players with hands data
    const gameStartedData = {
      ...enrichedGame,
      hands: hands.map((hand, index) => ({
        playerId: currentPlayers[index]?.userId || `player_${index}`,
        hand: hand
      }))
    };
    
    console.log(`[GAME START] Emitting game_started event to room ${gameId} with ${gameStartedData.hands.length} hands`);
    console.log(`[GAME START] Hands data:`, gameStartedData.hands.map((h: any) => ({ playerId: h.playerId, cardCount: h.hand.length })));
    
    // Add game to gamesStore for bot logic access
    const { gamesStore } = await import('../../../gamesStore');
    const gameForStore = {
      ...gameWithBiddingState,
      hands: hands,
      players: currentPlayers.map(p => ({
        id: p.userId,
        username: p.user?.username || `Bot ${p.userId.slice(-4)}`,
        type: p.isHuman ? 'human' as const : 'bot' as const,
        seatIndex: p.seatIndex,
        teamIndex: p.teamIndex,
        bid: null as number | null,
        tricks: null as number | null,
        points: null as number | null,
        bags: null as number | null
      }))
    };
    gamesStore.addGame(gameForStore as any);
    
    // Add small delay to ensure client is in room
    // Emit immediately instead of with delay
      io.to(gameId).emit('game_started', gameStartedData);
      io.to(gameId).emit('game_update', enrichedGame);
    
    // If first to bid is a bot, trigger bot move shortly after so UI can render dealing/animation
    const firstBidderPlayer = currentPlayers.find(p => p.seatIndex === firstBidderIndex);
    if (firstBidderPlayer && !firstBidderPlayer.isHuman) {
      console.log('[GAME START] First bidder is a bot; triggering bot bid');
      setTimeout(async () => {
        try {
          // Import gamesStore to get the game
          const { gamesStore } = await import('../../../gamesStore');
          const game = gamesStore.getGame(gameId);
          
          if (game) {
            // Import bot logic
            const { botMakeMove } = await import('../../bot-play/botLogic');
            // Use the io instance that's already imported at the top of this file
            console.log('[GAME START] io instance:', io ? 'available' : 'undefined');
            await botMakeMove(game, firstBidderIndex, 'bidding', io);
          } else {
            console.log('[GAME START] Game not found in gamesStore, bot bidding skipped');
          }
        } catch (error) {
          console.error('[GAME START] Error triggering bot bid:', error);
        }
      }, 1500);
    }
    
    console.log(`[GAME START] Events scheduled for room ${gameId}`);
    console.log(`[GAME START] Game started: ${gameId}, isRated: ${isRated}, humanPlayers: ${humanPlayers}`);

  } catch (error) {
    console.error('[GAME START] Error starting game:', error);
    socket.emit('error', { message: 'Failed to start game' });
  }
}
