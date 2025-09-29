import { gameManager } from '../services/GameManager.js';
import { Game } from '../models/Game.js';

export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`[SOCKET] Client connected: ${socket.id}`);

    // Join game
    socket.on('join_game', async (data) => {
      try {
        const { gameId, userId } = data;
        console.log(`[SOCKET] User ${userId} joining game ${gameId}`);

        // Load game if not in memory
        let game = gameManager.getGame(gameId);
        if (!game) {
          game = await gameManager.loadGame(gameId);
          if (!game) {
            socket.emit('error', { message: 'Game not found' });
            return;
          }
        }

        // Add socket to game room
        gameManager.addSocketToGame(gameId, socket.id);
        socket.join(gameId);

        // Emit current game state
        socket.emit('game_state', game.toClientFormat());

        console.log(`[SOCKET] User ${userId} joined game ${gameId}`);
      } catch (error) {
        console.error('[SOCKET] Error joining game:', error);
        socket.emit('error', { message: 'Failed to join game' });
      }
    });

    // Leave game
    socket.on('leave_game', (data) => {
      const { gameId } = data;
      gameManager.removeSocketFromGame(gameId, socket.id);
      socket.leave(gameId);
      console.log(`[SOCKET] Client ${socket.id} left game ${gameId}`);
    });

    // Play card
    socket.on('play_card', async (data) => {
      try {
        const { gameId, userId, card } = data;
        console.log(`[SOCKET] User ${userId} playing card ${card.suit}${card.rank} in game ${gameId}`);

        const game = gameManager.getGame(gameId);
        if (!game) {
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        // Find player
        const playerIndex = game.players.findIndex(p => p && p.id === userId);
        if (playerIndex === -1) {
          socket.emit('error', { message: 'Player not found in game' });
          return;
        }

        // Validate it's player's turn
        if (game.currentPlayer !== userId) {
          socket.emit('error', { message: 'Not your turn' });
          return;
        }

        // Remove card from player's hand
        const player = game.players[playerIndex];
        const cardIndex = player.hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
        if (cardIndex === -1) {
          socket.emit('error', { message: 'Card not in hand' });
          return;
        }

        player.hand.splice(cardIndex, 1);

        // Add card to current trick
        game.play.currentTrick.push({
          ...card,
          playedBy: userId,
          playerIndex
        });

        // Update current player
        const nextPlayerIndex = (playerIndex + 1) % 4;
        game.currentPlayer = game.players[nextPlayerIndex]?.id || null;
        game.play.currentPlayerIndex = nextPlayerIndex;

        // Check if trick is complete
        if (game.play.currentTrick.length === 4) {
          await completeTrick(game);
        }

        // Save game state
        await gameManager.saveGame(gameId);

        // Broadcast updated game state
        io.to(gameId).emit('game_update', game.toClientFormat());

        console.log(`[SOCKET] Card played successfully in game ${gameId}`);
      } catch (error) {
        console.error('[SOCKET] Error playing card:', error);
        socket.emit('error', { message: 'Failed to play card' });
      }
    });

    // Make bid
    socket.on('make_bid', async (data) => {
      try {
        const { gameId, userId, bid } = data;
        console.log(`[SOCKET] User ${userId} making bid ${bid} in game ${gameId}`);

        const game = gameManager.getGame(gameId);
        if (!game) {
          socket.emit('error', { message: 'Game not found' });
          return;
        }

        // Find player
        const playerIndex = game.players.findIndex(p => p && p.id === userId);
        if (playerIndex === -1) {
          socket.emit('error', { message: 'Player not found in game' });
          return;
        }

        // Validate it's player's turn
        if (game.bidding.currentPlayer !== userId) {
          socket.emit('error', { message: 'Not your turn to bid' });
          return;
        }

        // Update bid
        game.players[playerIndex].bid = bid;
        game.bidding.bids[playerIndex] = bid;

        // Move to next bidder
        const nextBidderIndex = (game.bidding.currentBidderIndex + 1) % 4;
        game.bidding.currentBidderIndex = nextBidderIndex;
        game.bidding.currentPlayer = game.players[nextBidderIndex]?.id || null;

        // Check if all players have bid
        if (game.bidding.bids.every(bid => bid !== null)) {
          await startPlaying(game);
        }

        // Save game state
        await gameManager.saveGame(gameId);

        // Broadcast updated game state
        io.to(gameId).emit('game_update', game.toClientFormat());

        console.log(`[SOCKET] Bid made successfully in game ${gameId}`);
      } catch (error) {
        console.error('[SOCKET] Error making bid:', error);
        socket.emit('error', { message: 'Failed to make bid' });
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`[SOCKET] Client disconnected: ${socket.id}`);
    });
  });
}

// Complete a trick
async function completeTrick(game) {
  console.log(`[GAME] Completing trick in game ${game.id}`);

  // Determine trick winner (simplified - highest card of lead suit or spade)
  const leadSuit = game.play.currentTrick[0].suit;
  let winningIndex = 0;
  let winningCard = game.play.currentTrick[0];

  for (let i = 1; i < 4; i++) {
    const card = game.play.currentTrick[i];
    if (isCardHigher(card, winningCard, leadSuit)) {
      winningIndex = i;
      winningCard = card;
    }
  }

  // Award trick to winner
  const winner = game.players[winningIndex];
  if (winner) {
    winner.tricks = (winner.tricks || 0) + 1;
  }

  // Add to tricks history
  game.play.tricks.push({
    cards: [...game.play.currentTrick],
    winnerIndex,
    winner: winner?.id
  });

  // Clear current trick
  game.play.currentTrick = [];
  game.play.trickNumber = (game.play.trickNumber || 0) + 1;

  // Set next player to trick winner
  game.currentPlayer = winner?.id || null;
  game.play.currentPlayerIndex = winningIndex;

  // Check if hand is complete (all 13 tricks played)
  if (game.play.tricks.length >= 13) {
    await completeHand(game);
  }

  console.log(`[GAME] Trick completed, winner: ${winner?.username} (${winningIndex})`);
}

// Complete a hand
async function completeHand(game) {
  console.log(`[GAME] Completing hand in game ${game.id}`);

  // Calculate scores, etc.
  // For now, just mark as finished
  game.status = 'FINISHED';
  game.finishedAt = new Date();

  console.log(`[GAME] Hand completed in game ${game.id}`);
}

// Start playing phase
async function startPlaying(game) {
  console.log(`[GAME] Starting play phase in game ${game.id}`);

  game.status = 'PLAYING';
  game.startedAt = new Date();

  // Set first player (dealer + 1)
  const firstPlayerIndex = (game.dealer + 1) % 4;
  game.currentPlayer = game.players[firstPlayerIndex]?.id || null;
  game.play.currentPlayerIndex = firstPlayerIndex;

  console.log(`[GAME] Play phase started, first player: ${game.players[firstPlayerIndex]?.username}`);
}

// Simple card comparison
function isCardHigher(card1, card2, leadSuit) {
  const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  
  // Spades beat everything
  if (card1.suit === 'SPADES' && card2.suit !== 'SPADES') return true;
  if (card2.suit === 'SPADES' && card1.suit !== 'SPADES') return false;
  
  // Same suit comparison
  if (card1.suit === card2.suit) {
    return ranks.indexOf(card1.rank) > ranks.indexOf(card2.rank);
  }
  
  // Lead suit beats other non-spades
  if (card1.suit === leadSuit && card2.suit !== leadSuit) return true;
  if (card2.suit === leadSuit && card1.suit !== leadSuit) return false;
  
  return false;
}
