import type { AuthenticatedSocket } from '../../../types/socket';
import { io } from '../../../index';
import { prisma } from '../../../lib/prisma';

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
      where: { id: gameId },
      include: { gamePlayers: { include: { user: true } } }
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
    const currentPlayers = game.gamePlayers || [];
    const occupiedSeats = new Set(currentPlayers.map(p => p.seatIndex));
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
    
    const hands = dealCards(mockPlayers, 0); // Start with dealer at position 0
    
    console.log(`[GAME START] Dealt cards for game ${gameId}`);
    
    // Count human players to determine if game is rated
    const humanPlayers = await prisma.gamePlayer.count({
      where: { gameId, isHuman: true }
    });
    
    const isRated = humanPlayers === 4;
    
    // Update game status and rating
    await prisma.game.update({
      where: { id: gameId },
      data: {
        status: 'BIDDING',
        isRated: isRated,
        // bidding: {
        //   currentPlayer: "0",
        //   bids: [null, null, null, null],
        // } // Field doesn't exist in schema
      }
    });

    // Get updated game for client
    const updatedGame = await prisma.game.findUnique({
      where: { id: gameId },
      include: { gamePlayers: { include: { user: true } } }
    });

    if (updatedGame) {
      const { enrichGameForClient } = require('../../../routes/games/shared/gameUtils');
      const enrichedGame = enrichGameForClient(updatedGame);
      
      // Notify all players with hands data
      const gameStartedData = {
        ...enrichedGame,
        hands: hands.map((hand, index) => ({
          playerId: updatedGame.gamePlayers[index]?.userId || `player_${index}`,
          hand: hand
        }))
      };
      
      io.to(gameId).emit('game_started', gameStartedData);
      io.to(gameId).emit('game_update', enrichedGame);
    }
    
    console.log(`[GAME START] Game started: ${gameId}, isRated: ${isRated}, humanPlayers: ${humanPlayers}`);

  } catch (error) {
    console.error('[GAME START] Error starting game:', error);
    socket.emit('error', { message: 'Failed to start game' });
  }
}
