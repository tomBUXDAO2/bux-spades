import { io } from '../server';
import { games } from '../gamesStore';
import { clearTurnTimeout, startTurnTimeout } from '../game-logic/timeoutHandlers';
import { botMakeMove, botPlayCard } from '../routes/games.routes';
import { enrichGameForClient } from '../routes/games.routes';
import { trickLogger } from '../lib/trickLogger';
import prisma from '../lib/prisma';
import type { AuthenticatedSocket } from '../server';
import type { Game, Card } from '../types/game';

export function setupGameEventHandlers(io: any) {
  io.on('connection', (socket: AuthenticatedSocket) => {
    
    // Make bid event
    socket.on('make_bid', async ({ gameId, userId, bid }) => {
      await handleMakeBid(socket, gameId, userId, bid);
    });

    // Play card event
    socket.on('play_card', async ({ gameId, userId, card }) => {
      await handlePlayCard(socket, gameId, userId, card);
    });

    // Join game event
    socket.on('join_game', async ({ gameId }) => {
      await handleJoinGame(socket, gameId);
    });

    // Leave game event
    socket.on('leave_game', async ({ gameId }) => {
      await handleLeaveGame(socket, gameId);
    });

    // Chat message event
    socket.on('chat_message', async ({ gameId, message }) => {
      await handleChatMessage(socket, gameId, message);
    });

    // Lobby chat message event
    socket.on('lobby_chat_message', async ({ message }) => {
      await handleLobbyChatMessage(socket, message);
    });
  });
}

async function handleMakeBid(socket: AuthenticatedSocket, gameId: string, userId: string, bid: number) {
  console.log('[BID DEBUG] make_bid received:', { gameId, userId, bid, socketId: socket.id });
  console.log('[BID DEBUG] Socket auth status:', { isAuthenticated: socket.isAuthenticated, userId: socket.userId });
  
  if (!socket.isAuthenticated || !socket.userId) {
    console.log('Unauthorized make_bid attempt');
    socket.emit('error', { message: 'Not authorized' });
    return;
  }
  
  const game = games.find(g => g.id === gameId);
  console.log('[BID DEBUG] Game lookup result:', { 
    gameFound: !!game, 
    gameId, 
    availableGames: games.map(g => ({ id: g.id, status: g.status })),
    gameStatus: game?.status,
    hasBidding: !!game?.bidding
  });
  
  if (!game || !game.bidding) {
    console.log('[BID DEBUG] Game or bidding not found:', { gameFound: !!game, hasBidding: !!game?.bidding });
    socket.emit('error', { message: 'Game not found or invalid state' });
    return;
  }
  
  // Update game activity
  game.lastActivity = Date.now();
  updateGameActivity(gameId);
  
  const playerIndex = game.players.findIndex(p => p && p.id === userId);
  console.log('[BID DEBUG] make_bid received:', { gameId, userId, bid, playerIndex, currentBidderIndex: game.bidding.currentBidderIndex, bids: game.bidding.bids });
  if (playerIndex === -1) {
    console.log('[BID DEBUG] Bid rejected: player not found');
    socket.emit('error', { message: 'Player not found in game' });
    return;
  }
  
  if (playerIndex !== game.bidding.currentBidderIndex) {
    console.log('[BID DEBUG] Bid rejected: not player turn', { playerIndex, currentBidderIndex: game.bidding.currentBidderIndex });
    return; // Not their turn
  }
  if (game.bidding.bids[playerIndex] !== null) {
    console.log('[BID DEBUG] Bid rejected: already bid', { playerIndex });
    return; // Already bid
  }
  
  // For MIRROR games, automatically calculate the correct bid for human players
  let finalBid = bid;
  if (game.rules?.bidType === 'MIRROR' && game.players[playerIndex]?.type === 'human' && game.hands && game.hands[playerIndex]) {
    const spades = game.hands[playerIndex].filter(c => c.suit === 'S');
    finalBid = spades.length;
    console.log('[MIRROR BID] Human player in Mirror game - calculated bid:', finalBid, 'spades:', spades.length, 'hand:', game.hands[playerIndex].map(c => c.suit + c.rank));
  }
  
  // Store the bid
  game.bidding.bids[playerIndex] = finalBid;
  
  // Update player's bid in game state (this will be the current round bid)
  if (game.players[playerIndex]) {
    game.players[playerIndex].bid = finalBid;
  }
  
  // Log the bid to RoundBid table for this round
  if (game.dbGameId && game.players[playerIndex]?.type === 'human') {
    try {
      // Determine current roundNumber from trickLogger cache or DB
      let roundNumber: number | null = null;
      try {
        roundNumber = trickLogger.getCurrentRoundNumber(game.dbGameId) || null;
      } catch {}
      if (!roundNumber) {
        const latestRound = await prisma.round.findFirst({
          where: { gameId: game.dbGameId },
          orderBy: { roundNumber: 'desc' }
        });
        roundNumber = latestRound?.roundNumber || 1;
      }
      // Find the current round record
      let roundRecord = await prisma.round.findFirst({
        where: {
          gameId: game.dbGameId,
          roundNumber
        }
      });
      if (!roundRecord) {
        // Create the round if missing
        roundRecord = await prisma.round.create({
          data: {
            id: `round_${game.dbGameId}_${roundNumber}_${Date.now()}`,
            roundNumber,
            updatedAt: new Date(),
            Game: { connect: { id: game.dbGameId } }
          }
        });
      }
      // Upsert-like behavior: delete any existing for (roundId, playerId) then insert
      await prisma.roundBid.deleteMany({
        where: { roundId: roundRecord.id, playerId: game.players[playerIndex]!.id }
      });
      await prisma.roundBid.create({
        data: {
          id: `bid_${roundRecord.id}_${playerIndex}_${Date.now()}`,
          roundId: roundRecord.id,
          playerId: game.players[playerIndex]!.id,
          bid: finalBid
        }
      });
    } catch (err) {
      console.error('Failed to log bid to RoundBid table:', err);
    }
  }
  
  // Update GamePlayer record in DB
  if (game.dbGameId && game.players[playerIndex]?.type === 'human') {
    const { updateGamePlayerRecord } = await import('../routes/games.routes');
    updateGamePlayerRecord(game, playerIndex).catch((err: Error) => {
      console.error('Failed to update GamePlayer record after bid:', err);
    });
  }
  
  // Clear turn timeout for this player since they acted
  clearTurnTimeout(game, userId);
  
  // Find next player who hasn't bid
  let next = (playerIndex + 1) % 4;
  while (game.bidding.bids[next] !== null && next !== playerIndex) {
    next = (next + 1) % 4;
  }
  
  if (game.bidding.bids.every(b => b !== null)) {
    // All bids in, move to play phase
    await transitionToPlayPhase(game, socket);
  } else {
    // Continue bidding
    await continueBidding(game, next, socket);
  }
  
  // Emit game update to ensure frontend has latest state
  io.to(game.id).emit('game_update', enrichGameForClient(game));
  
  // Also emit bidding_update for immediate UI feedback if still in bidding phase
  if (game.bidding && game.bidding.bids && !game.bidding.bids.every(b => b !== null)) {
    io.to(game.id).emit('bidding_update', {
      currentBidderIndex: game.bidding.currentBidderIndex,
      bids: game.bidding.bids,
    });
  }
  
  // Log the current game state for debugging
  console.log('[BIDDING DEBUG] Current game state after bid:', {
    gameId: game.id,
    currentBidderIndex: game.bidding.currentBidderIndex,
    currentPlayer: game.bidding.currentPlayer,
    bids: game.bidding.bids,
    allBidsComplete: game.bidding.bids.every(b => b !== null)
  });
}

async function transitionToPlayPhase(game: Game, socket: AuthenticatedSocket) {
  if (game.dealerIndex === undefined || game.dealerIndex === null) {
    socket.emit('error', { message: 'Invalid game state: no dealer assigned' });
    return;
  }
  const firstPlayer = game.players[(game.dealerIndex + 1) % 4];
  if (!firstPlayer) {
    socket.emit('error', { message: 'Invalid game state' });
    return;
  }
  
  // --- Play phase state ---
  game.status = 'PLAYING'; // Update game status to PLAYING
  game.currentRound = 1; // Set current round for bid logging
  game.play = {
    currentPlayer: firstPlayer.id,
    currentPlayerIndex: (game.dealerIndex + 1) % 4,
    currentTrick: [],
    tricks: [],
    trickNumber: 0,
    spadesBroken: false
  };
  
  // Save game state immediately when game starts
  try {
    await import('../lib/gameStatePersistence').then(({ saveGameState }) => saveGameState(game));
  } catch (err) {
    console.error('Failed to save game state at start:', err);
  }
  
  // Update game status in database
  if (game.dbGameId) {
    try {
      await prisma.game.update({
        where: { id: game.dbGameId },
        data: { status: 'PLAYING' }
      });
      console.log('[DB STATUS UPDATE] Updated game status to PLAYING in database:', game.dbGameId);
    } catch (err) {
      console.error('Failed to update game status in database:', err);
    }
  }
  
  // For rated games, ensure we always pay out winners at completion
  if (game.rated) {
    console.log('[RATED GAME] Game is rated - will ensure complete logging and guaranteed payouts');
  }
  
  // FORCE GAME LOGGING - Create game in database immediately
  if (!game.dbGameId) {
    try {
      const dbGame = await prisma.game.create({
        data: {
          id: game.id, // Use the game's ID as the database ID
          creatorId: game.players.find(p => p && p.type === 'human')?.id || 'unknown',
          gameMode: game.gameMode,
          bidType: 'REGULAR',
          specialRules: [],
          minPoints: game.minPoints,
          maxPoints: game.maxPoints,
          buyIn: game.buyIn,
          rated: game.players.filter(p => p && p.type === 'human').length === 4,
          status: 'PLAYING',
          updatedAt: new Date()
        }
      });
      
      game.dbGameId = dbGame.id;
      console.log('[FORCE GAME LOGGED] Game forced to database with ID:', game.dbGameId);
    } catch (err) {
      console.error('Failed to force log game start:', err);
      game.dbGameId = game.id; // Fallback to in-memory ID
    }
  } else {
    console.log('[GAME ALREADY LOGGED] Game already has dbGameId:', game.dbGameId);
    // Verify the game actually exists in the database
    try {
      const dbGame = await prisma.game.findUnique({
        where: { id: game.dbGameId }
      });
      if (!dbGame) {
        console.log('[GAME NOT IN DB] Game with dbGameId not found in database, recreating...');
        const newDbGame = await prisma.game.create({
          data: {
            id: game.id, // Use the game's ID as the database ID
            creatorId: game.players.find(p => p && p.type === 'human')?.id || 'unknown',
            gameMode: game.gameMode,
            bidType: 'REGULAR',
            specialRules: [],
            minPoints: game.minPoints,
            maxPoints: game.maxPoints,
            buyIn: game.buyIn,
            rated: game.players.filter(p => p && p.type === 'human').length === 4,
            status: 'PLAYING',
            updatedAt: new Date()
          }
        });
        game.dbGameId = newDbGame.id;
        console.log('[GAME RECREATED] Game recreated in database with ID:', game.dbGameId);
      } else {
        console.log('[GAME VERIFIED] Game found in database:', game.dbGameId);
      }
    } catch (err) {
      console.error('Failed to verify game in database:', err);
    }
  }

  // Round logging is now started when game is created
  
  // START ROUND LOGGING FOR FIRST HAND
  if (game.dbGameId) {
    try {
      await trickLogger.startRound(game.dbGameId, 1);
      console.log('[ROUND STARTED] Round 1 started for game:', game.dbGameId);
    } catch (err) {
      console.error('Failed to start round logging for first hand:', err);
    }
  }
  
  console.log('[BIDDING COMPLETE] Moving to play phase, first player:', firstPlayer.username, 'at index:', (game.dealerIndex + 1) % 4);
  
  io.to(game.id).emit('bidding_complete', { bids: game.bidding.bids });
  io.to(game.id).emit('play_start', {
    gameId: game.id,
    currentPlayerIndex: game.play.currentPlayerIndex,
    currentTrick: game.play.currentTrick,
    trickNumber: game.play.trickNumber,
  });
  
  console.log('[PLAY START] Emitted play_start event with currentPlayerIndex:', game.play.currentPlayerIndex, 'firstPlayer:', firstPlayer.username);
  
  // Emit game update AFTER play_start to ensure correct current player
  io.to(game.id).emit('game_update', enrichGameForClient(game));
  
  // If first player is a bot, trigger their move
  if (firstPlayer.type === 'bot') {
    console.log('[BOT TURN] First player is bot, triggering bot play');
    setTimeout(() => {
      botPlayCard(game, (game.dealerIndex + 1) % 4);
    }, 1000);
  } else {
    // Start turn timeout for human players when play phase begins
    console.log('[HUMAN TURN] First player is human, starting turn timeout for:', firstPlayer.username, 'at index:', (game.dealerIndex + 1) % 4);
    startTurnTimeout(game, (game.dealerIndex + 1) % 4, 'playing');
  }
}

async function continueBidding(game: Game, next: number, socket: AuthenticatedSocket) {
  // Validate that the next player exists before proceeding
  if (!game.players[next] || game.players[next] === null) {
    console.log(`[BIDDING ERROR] Next player at index ${next} is null or undefined, cannot continue bidding`);
    socket.emit('error', { message: 'Invalid game state - missing player' });
    return;
  }
  
  game.bidding.currentBidderIndex = next;
  game.bidding.currentPlayer = game.players[next]?.id ?? '';
  io.to(game.id).emit('bidding_update', {
    currentBidderIndex: next,
    bids: game.bidding.bids,
  });
  
  // Start timeout for human players after bidding update
  const nextPlayer = game.players[next];
  console.log(`[TIMEOUT DEBUG] Next player after bidding update: ${nextPlayer?.username}, type: ${nextPlayer?.type}, index: ${next}`);
  if (nextPlayer && nextPlayer.type === 'human') {
    console.log(`[TIMEOUT DEBUG] Starting timeout for human player ${nextPlayer.username}`);
    startTurnTimeout(game, next, 'bidding');
  } else {
    console.log(`[TIMEOUT DEBUG] Not starting timeout - player is bot or null`);
  }
  
  // If next is a bot, trigger their move
  if (game.players[next] && game.players[next].type === 'bot') {
    console.log('[BOT BIDDING] Triggering bot bid for:', game.players[next].username, 'at index:', next);
    setTimeout(() => {
      botMakeMove(game, next);
    }, 600); // Reduced delay for faster bot bidding
  }
}

async function handlePlayCard(socket: AuthenticatedSocket, gameId: string, userId: string, card: Card) {
  console.log('[PLAY CARD] Received play_card event:', { gameId, userId, card, socketId: socket.id });
  console.log('[PLAY CARD] Socket auth status:', { isAuthenticated: socket.isAuthenticated, userId: socket.userId });
  const game = games.find(g => g.id === gameId);
  if (!game || !game.play || !game.hands || !game.bidding) {
    socket.emit('error', { message: 'Invalid game state' });
    return;
  }
  
  // Update game activity
  game.lastActivity = Date.now();
  updateGameActivity(gameId);
  
  const playerIndex = game.players.findIndex(p => p && p.id === userId);
  if (playerIndex === -1) {
    socket.emit('error', { message: 'Player not found in game' });
    return;
  }
  
  if (playerIndex !== game.play.currentPlayerIndex) {
    socket.emit('error', { message: 'Not your turn' });
    return;
  }
  
  // Validate card is in player's hand
  if (!game.hands || !Array.isArray(game.hands)) {
    socket.emit('error', { message: 'Invalid hand state - hands not initialized' });
    return;
  }
  const hands = game.hands.filter((h): h is Card[] => h !== null && h !== undefined);
  if (hands.length !== 4) {
    socket.emit('error', { message: 'Invalid hand state - hands array incomplete' });
    return;
  }
  const hand = hands[playerIndex]!;
  if (!hand || hand.length === 0) {
    socket.emit('error', { message: 'Invalid hand state' });
    return;
  }
  
  const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
  if (cardIndex === -1) {
    socket.emit('error', { message: 'Card not in hand' });
    return;
  }
  
  // TODO: Continue with play card logic...
  // This is a large function that needs to be extracted
}

async function handleJoinGame(socket: AuthenticatedSocket, gameId: string) {
  // TODO: Implement join game logic
}

async function handleLeaveGame(socket: AuthenticatedSocket, gameId: string) {
  // TODO: Implement leave game logic
}

async function handleChatMessage(socket: AuthenticatedSocket, gameId: string, message: string) {
  // TODO: Implement chat message logic
}

async function handleLobbyChatMessage(socket: AuthenticatedSocket, message: string) {
  // TODO: Implement lobby chat message logic
}

function updateGameActivity(gameId: string) {
  // TODO: Implement game activity update logic
}
