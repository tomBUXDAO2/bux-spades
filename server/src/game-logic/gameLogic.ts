import { games } from '../gamesStore';
import { io } from '../server';
import { enrichGameForClient } from '../routes/games.routes';
import { trickLogger } from '../lib/trickLogger';
import prisma from '../lib/prisma';
import type { Game } from '../types/game';

export function setupGameLogic() {
  console.log('🎮 Game logic module loaded');
}

export async function handleTrickCompletion(game: Game) {
  if (!game.play || !game.play.currentTrick || game.play.currentTrick.length !== 4) {
    return;
  }

  console.log('[TRICK COMPLETE] Trick completed, determining winner...');
  
  // Determine trick winner
  const { determineTrickWinner } = await import('../routes/games.routes');
  const winnerIndex = determineTrickWinner(game.play.currentTrick, game.play.trickNumber);
  const winner = game.players[winnerIndex];
  
  if (!winner) {
    console.error('[TRICK COMPLETE] Winner not found at index:', winnerIndex);
    return;
  }

  console.log('[TRICK COMPLETE] Trick won by:', winner.username, 'at index:', winnerIndex);

  // Log the trick
  if (game.dbGameId) {
    try {
      await trickLogger.logTrick(game.dbGameId, game.play.currentTrick, winnerIndex, game.play.trickNumber);
    } catch (err) {
      console.error('Failed to log trick:', err);
    }
  }

  // Add trick to tricks array
  game.play.tricks.push({
    cards: [...game.play.currentTrick],
    winner: winnerIndex,
    trickNumber: game.play.trickNumber
  });

  // Check if hand is complete
  if (game.play.tricks.length === 13) {
    await handleHandCompletion(game);
    return;
  }

  // Start next trick
  game.play.trickNumber++;
  game.play.currentTrick = [];
  game.play.currentPlayerIndex = winnerIndex;
  game.play.currentPlayer = winner.id;

  // Emit trick completion
  io.to(game.id).emit('trick_complete', {
    trick: game.play.tricks[game.play.tricks.length - 1],
    nextPlayerIndex: winnerIndex,
    trickNumber: game.play.trickNumber
  });

  // Emit game update
  io.to(game.id).emit('game_update', enrichGameForClient(game));

  // If next player is bot, trigger their move
  if (winner.type === 'bot') {
    console.log('[BOT TURN] Next player is bot, triggering bot play');
    setTimeout(() => {
      const { botPlayCard } = require('../routes/games.routes');
      botPlayCard(game, winnerIndex);
    }, 1000);
  } else {
    // Start timeout for human players
    console.log('[HUMAN TURN] Next player is human, starting turn timeout');
    const { startTurnTimeout } = require('./timeoutHandlers');
    startTurnTimeout(game, winnerIndex, 'playing');
  }
}

export async function handleHandCompletion(game: Game) {
  console.log('[HAND COMPLETE] Hand completed, calculating scores...');
  
  if (!game.play || !game.bidding) {
    console.error('[HAND COMPLETE] Missing game state');
    return;
  }

  // Calculate hand scores
  const { calculateSoloHandScore } = await import('../routes/games.routes');
  const handScores = calculateSoloHandScore(game);
  
  // Update game scores
  for (let i = 0; i < 4; i++) {
    if (game.players[i]) {
      game.players[i].score += handScores[i];
    }
  }

  // Check if game is over
  const gameOver = checkGameOver(game);
  
  if (gameOver) {
    await handleGameCompletion(game);
  } else {
    await startNewHand(game);
  }
}

export function checkGameOver(game: Game): boolean {
  if (!game.players || game.players.length !== 4) {
    return false;
  }

  // Check if any player has reached the target score
  for (const player of game.players) {
    if (player && player.score >= game.maxPoints) {
      return true;
    }
  }

  return false;
}

export async function handleGameCompletion(game: Game) {
  console.log('[GAME COMPLETE] Game completed, processing results...');
  
  // Update game status
  game.status = 'COMPLETED';
  
  // Update database
  if (game.dbGameId) {
    try {
      await prisma.game.update({
        where: { id: game.dbGameId },
        data: { 
          status: 'COMPLETED',
          completed: new Date()
        }
      });
    } catch (err) {
      console.error('Failed to update game status in database:', err);
    }
  }

  // Process stats and coins
  try {
    const { updateStatsAndCoins } = await import('../routes/games.routes');
    await updateStatsAndCoins(game);
  } catch (err) {
    console.error('Failed to update stats and coins:', err);
  }

  // Emit game completion
  io.to(game.id).emit('game_complete', {
    gameId: game.id,
    finalScores: game.players.map(p => p ? { id: p.id, score: p.score } : null)
  });

  // Remove game from active games
  const gameIndex = games.findIndex(g => g.id === game.id);
  if (gameIndex !== -1) {
    games.splice(gameIndex, 1);
  }
}

export async function startNewHand(game: Game) {
  console.log('[NEW HAND] Starting new hand...');
  
  // Move dealer
  game.dealerIndex = (game.dealerIndex + 1) % 4;
  
  // Reset game state
  game.currentRound++;
  game.play = {
    currentPlayer: '',
    currentPlayerIndex: 0,
    currentTrick: [],
    tricks: [],
    trickNumber: 0,
    spadesBroken: false
  };
  
  // Deal new cards
  const { dealCards } = await import('../routes/games.routes');
  const hands = dealCards(game.players, game.dealerIndex);
  game.hands = hands;
  
  // Start new bidding phase
  const firstBidderIndex = (game.dealerIndex + 1) % 4;
  const firstBidder = game.players[firstBidderIndex];
  
  if (!firstBidder) {
    console.error('[NEW HAND] First bidder not found');
    return;
  }

  game.bidding = {
    currentPlayer: firstBidder.id,
    currentBidderIndex: firstBidderIndex,
    bids: [null, null, null, null],
    nilBids: {}
  };

  // Start round logging
  if (game.dbGameId) {
    try {
      await trickLogger.startRound(game.dbGameId, game.currentRound);
    } catch (err) {
      console.error('Failed to start round logging:', err);
    }
  }

  // Emit new hand started
  io.to(game.id).emit('new_hand_started', {
    gameId: game.id,
    dealerIndex: game.dealerIndex,
    hands: hands.map((hand, i) => ({
      playerId: game.players[i]?.id,
      hand
    })),
    bidding: game.bidding
  });

  // Emit bidding ready
  io.to(game.id).emit('bidding_ready', {
    currentBidderIndex: firstBidderIndex,
    bids: game.bidding.bids
  });

  // Emit game update
  io.to(game.id).emit('game_update', enrichGameForClient(game));

  // If first bidder is bot, trigger their move
  if (firstBidder.type === 'bot') {
    console.log('[BOT TURN] First bidder is bot, triggering bot bid');
    setTimeout(() => {
      const { botMakeMove } = require('../routes/games.routes');
      botMakeMove(game, firstBidderIndex);
    }, 1000);
  } else {
    // Start timeout for human players
    console.log('[HUMAN TURN] First bidder is human, starting turn timeout');
    const { startTurnTimeout } = require('./timeoutHandlers');
    startTurnTimeout(game, firstBidderIndex, 'bidding');
  }
}
