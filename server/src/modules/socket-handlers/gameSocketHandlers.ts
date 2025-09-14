import type { AuthenticatedSocket } from '../../index';
import type { Game } from '../../types/game';
import { io } from '../../index';
import { games } from '../../gamesStore';
import { enrichGameForClient } from '../../routes/games.routes';
import { botMakeMove, botPlayCard } from '../bot-play/botLogic';
import { dealNewHand } from '../dealing/cardDealing';
import { trickLogger } from '../../lib/trickLogger';

/**
 * Handles join_game socket event
 */
export async function handleJoinGame(socket: AuthenticatedSocket, { gameId }: { gameId: string }): Promise<void> {
  console.log('[SERVER DEBUG] join_game event received:', { 
    gameId, 
    socketId: socket.id, 
    userId: socket.userId,
    isAuthenticated: socket.isAuthenticated,
    timestamp: new Date().toISOString()
  });
  
  if (!socket.isAuthenticated || !socket.userId) {
    console.log('Unauthorized join_game attempt:', { 
      socketId: socket.id, 
      isAuthenticated: socket.isAuthenticated,
      userId: socket.userId 
    });
    socket.emit('error', { message: 'Not authenticated' });
    return;
  }

  try {
    console.log('[JOIN GAME DEBUG] Looking for game:', gameId);
    console.log('[JOIN GAME DEBUG] Available games:', games.map(g => ({ id: g.id, status: g.status, players: g.players.map(p => p ? p.id : 'null') })));
    
    const game = games.find((g: Game) => g.id === gameId);
    if (!game) {
      console.log(`Game ${gameId} not found`);
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    // Update game activity
    game.lastActivity = Date.now();
    
    console.log('[SERVER DEBUG] Found game:', { 
      gameId, 
      status: game.status, 
      currentPlayer: game.currentPlayer,
      biddingCurrentPlayer: game.bidding?.currentPlayer,
      playCurrentPlayer: game.play?.currentPlayer
    });

    // Check if user is already in the game
    const isPlayerInGame = game.players.some((player: any, _i: number) => 
      player && player.id === socket.userId
    );

    console.log(`[JOIN GAME DEBUG] User ${socket.userId} join check:`, {
      isPlayerInGame,
      gameCurrentPlayer: game.currentPlayer,
      gameStatus: game.status,
      players: game.players.map((p: any, i: number) => `${i}: ${p ? p.id : 'null'}`)
    });

    if (!isPlayerInGame) {
      console.log(`[JOIN GAME DEBUG] User ${socket.userId} is not a player, joining as spectator`);
    }

    // Join the game room
    socket.join(gameId);
    console.log(`[JOIN GAME DEBUG] User ${socket.userId} joined game room ${gameId}`);

    // Send current game state
    socket.emit('game_update', enrichGameForClient(game));
    console.log(`[JOIN GAME DEBUG] Sent game state to user ${socket.userId}`);

  } catch (error) {
    console.error('Error in join_game:', error);
    socket.emit('error', { message: 'Internal server error' });
  }
}

/**
 * Handles make_bid socket event
 */
export async function handleMakeBid(socket: AuthenticatedSocket, { gameId, userId, bid }: { gameId: string; userId: string; bid: number }): Promise<void> {
  console.log('[MAKE BID DEBUG] Received bid:', { gameId, userId, bid, socketId: socket.id });
  
  if (!socket.isAuthenticated || !socket.userId) {
    socket.emit('error', { message: 'Not authenticated' });
    return;
  }

  try {
    const game = games.find(g => g.id === gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    if (game.status !== 'BIDDING') {
      socket.emit('error', { message: 'Game is not in bidding phase' });
      return;
    }

    if (!game.bidding || game.bidding.currentPlayer !== userId) {
      socket.emit('error', { message: 'Not your turn to bid' });
      return;
    }

    const playerIndex = game.players.findIndex(p => p && p.id === userId);
    if (playerIndex === -1) {
      socket.emit('error', { message: 'Player not found in game' });
      return;
    }

    // Validate bid
    if (bid < 0 || bid > 13) {
      socket.emit('error', { message: 'Invalid bid amount' });
      return;
    }

    // Set the bid
    game.bidding.bids[playerIndex] = bid;
    console.log('[MAKE BID DEBUG] Bid set:', { playerIndex, bid, bids: game.bidding.bids });

    // Check if all players have bid
    if (game.bidding.bids.every(b => b !== null)) {
      await handleBiddingComplete(game);
    } else {
      // Move to next player
      const nextPlayerIndex = (playerIndex + 1) % 4;
      game.bidding.currentBidderIndex = nextPlayerIndex;
      game.bidding.currentPlayer = game.players[nextPlayerIndex]?.id ?? '';
      
      io.to(gameId).emit('bidding_update', {
        currentBidderIndex: nextPlayerIndex,
        bids: game.bidding.bids,
      });
      
      // If next player is bot, trigger their move
      if (game.players[nextPlayerIndex] && game.players[nextPlayerIndex].type === 'bot') {
        botMakeMove(game, nextPlayerIndex);
      }
    }

  } catch (error) {
    console.error('Error in make_bid:', error);
    socket.emit('error', { message: 'Internal server error' });
  }
}

/**
 * Handles play_card socket event
 */
export async function handlePlayCard(socket: AuthenticatedSocket, { gameId, userId, card }: { gameId: string; userId: string; card: any }): Promise<void> {
  console.log('[PLAY CARD DEBUG] Received card play:', { gameId, userId, card, socketId: socket.id });
  
  if (!socket.isAuthenticated || !socket.userId) {
    socket.emit('error', { message: 'Not authenticated' });
    return;
  }

  try {
    const game = games.find(g => g.id === gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    if (game.status !== 'PLAYING') {
      socket.emit('error', { message: 'Game is not in playing phase' });
      return;
    }

    if (!game.play || game.play.currentPlayer !== userId) {
      socket.emit('error', { message: 'Not your turn to play' });
      return;
    }

    const playerIndex = game.players.findIndex(p => p && p.id === userId);
    if (playerIndex === -1) {
      socket.emit('error', { message: 'Player not found in game' });
      return;
    }

    // Validate card can be played
    const hand = game.hands[playerIndex];
    if (!hand || !hand.some(c => c.suit === card.suit && c.rank === card.rank)) {
      socket.emit('error', { message: 'Card not in hand' });
      return;
    }

    // Remove card from hand
    const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
    hand.splice(cardIndex, 1);

    // Add to current trick
    game.play.currentTrick.push(card);
    
    console.log('[PLAY CARD DEBUG] Card played:', { playerIndex, card, trickLength: game.play.currentTrick.length });

    // Emit card played event
    io.to(gameId).emit('card_played', {
      gameId: gameId,
      playerId: userId,
      card: card,
      trickNumber: game.play.trickNumber
    });

    // Check if trick is complete
    if (game.play.currentTrick.length === 4) {
      await handleTrickComplete(game);
    } else {
      // Move to next player
      const nextPlayerIndex = (playerIndex + 1) % 4;
      game.play.currentPlayerIndex = nextPlayerIndex;
      game.play.currentPlayer = game.players[nextPlayerIndex]?.id ?? '';
      
      io.to(gameId).emit('game_update', enrichGameForClient(game));
      
      // If next player is bot, trigger their move
      if (game.players[nextPlayerIndex] && game.players[nextPlayerIndex].type === 'bot') {
        botPlayCard(game, nextPlayerIndex);
      }
    }

  } catch (error) {
    console.error('Error in play_card:', error);
    socket.emit('error', { message: 'Internal server error' });
  }
}

/**
 * Handles bidding completion
 */
async function handleBiddingComplete(game: Game): Promise<void> {
  console.log('[BIDDING COMPLETE] All bids received, starting play phase');
  
  if (typeof game.dealerIndex !== 'number') {
    io.to(game.id).emit('error', { message: 'Invalid game state: no dealer assigned' });
    return;
  }
  
  const firstPlayer = game.players[(game.dealerIndex + 1) % 4];
  if (!firstPlayer) {
    io.to(game.id).emit('error', { message: 'Invalid game state' });
    return;
  }
  
  // Update game status
  game.status = 'PLAYING';
  game.play = {
    currentPlayer: firstPlayer.id ?? '',
    currentPlayerIndex: (game.dealerIndex + 1) % 4,
    currentTrick: [],
    tricks: [],
    trickNumber: 0,
    spadesBroken: false
  };
  
  console.log('[BIDDING COMPLETE] Moving to play phase, first player:', firstPlayer.username);
  
  // Emit events
  io.to(game.id).emit('game_update', enrichGameForClient(game));
  io.to(game.id).emit('bidding_complete', { currentBidderIndex: null, bids: game.bidding.bids });
  io.to(game.id).emit('play_start', {
    gameId: game.id,
    currentPlayerIndex: game.play.currentPlayerIndex,
    currentTrick: game.play.currentTrick,
    trickNumber: game.play.trickNumber,
  });
  
  // If first player is a bot, trigger bot card play
  if (firstPlayer.type === 'bot') {
    setTimeout(() => {
      botPlayCard(game, (game.dealerIndex + 1) % 4);
    }, 500);
  }
}

/**
 * Handles trick completion
 */
async function handleTrickComplete(game: Game): Promise<void> {
  console.log('[TRICK COMPLETE] Determining winner...');
  
  if (!game.play || game.play.currentTrick.length !== 4) {
    console.error('[TRICK COMPLETE] Invalid trick state');
    return;
  }
  
  // Determine trick winner (simplified logic)
  const trick = game.play.currentTrick;
  const leadSuit = trick[0].suit;
  
  let winningCard = trick[0];
  let winnerIndex = 0;
  
  for (let i = 1; i < trick.length; i++) {
    const card = trick[i];
    
    // Spades always beat non-spades
    if (card.suit === 'SPADES' && winningCard.suit !== 'SPADES') {
      winningCard = card;
      winnerIndex = i;
    } else if (card.suit === 'SPADES' && winningCard.suit === 'SPADES') {
      // Both spades, compare values
      if (getCardValue(card.rank) > getCardValue(winningCard.rank)) {
        winningCard = card;
        winnerIndex = i;
      }
    } else if (card.suit === winningCard.suit) {
      // Same suit, compare values
      if (getCardValue(card.rank) > getCardValue(winningCard.rank)) {
        winningCard = card;
        winnerIndex = i;
      }
    }
  }
  
  const winnerPlayerIndex = (game.play.currentPlayerIndex - game.play.currentTrick.length + winnerIndex + 4) % 4;
  const winnerPlayer = game.players[winnerPlayerIndex];
  
  console.log('[TRICK COMPLETE] Winner:', winnerPlayer?.username, 'at index:', winnerPlayerIndex);
  
  // Update player trick count
  if (winnerPlayer) {
    winnerPlayer.tricks = (winnerPlayer.tricks || 0) + 1;
  }
  
  // Store trick
  game.play.tricks.push({
    cards: [...trick],
    winner: winnerPlayerIndex,
    winnerId: winnerPlayer?.id || '',
    trickNumber: game.play.trickNumber
  });
  
  // Log trick to database
  try {
    await trickLogger.logTrickFromGame(game, game.play.trickNumber);
  } catch (err) {
    console.error('Failed to log trick to database:', err);
  }
  
  // Check if hand is complete
  if (game.play.trickNumber >= 12) {
    await handleHandComplete(game);
  } else {
    // Start next trick
    game.play.trickNumber++;
    game.play.currentTrick = [];
    game.play.currentPlayerIndex = winnerPlayerIndex;
    game.play.currentPlayer = winnerPlayer?.id || '';
    
    io.to(game.id).emit('trick_complete', {
      trick: game.play.tricks[game.play.tricks.length - 1],
      nextPlayer: winnerPlayerIndex
    });
    
    io.to(game.id).emit('game_update', enrichGameForClient(game));
    
    // If winner is bot, trigger their move
    if (winnerPlayer && winnerPlayer.type === 'bot') {
      setTimeout(() => {
        botPlayCard(game, winnerPlayerIndex);
      }, 500);
    }
  }
}

/**
 * Handles hand completion
 */
async function handleHandComplete(game: Game): Promise<void> {
  console.log('[HAND COMPLETE] Calculating scores...');
  
  // This would integrate with the hand completion module
  // For now, just start a new hand
  dealNewHand(game);
  
  // Emit hand complete event
  io.to(game.id).emit('hand_complete', {
    gameId: game.id,
    scores: {
      team1: game.team1TotalScore || 0,
      team2: game.team2TotalScore || 0
    }
  });
  
  io.to(game.id).emit('game_update', enrichGameForClient(game));
}

/**
 * Helper function to get card value
 */
function getCardValue(rank: string): number {
  const values: { [key: string]: number } = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return values[rank] || 0;
}
