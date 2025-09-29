import type { Game } from '../../../../types/game';
import { io } from '../../../../index';
import { enrichGameForClient } from '../../../../routes/games/shared/gameUtils';
import prisma from '../../../../lib/prisma';
import { startTurnTimeout } from '../../../timeout-management/core/timeoutManager';
import { botPlayCard } from '../../../bot-play';
import { saveGameState } from '../../../../lib/game-state-persistence/save/gameStateSaver';

/**
 * Handles bidding completion
 */
export async function handleBiddingComplete(game: Game): Promise<void> {
  console.log('[BIDDING COMPLETE] Starting bidding completion for game:', game.id);
  console.log('[BIDDING COMPLETE] Game status:', game.status);
  console.log('[BIDDING COMPLETE] Game bidding:', game.bidding);
  
  // Prevent multiple bidding completions
  if (game.status === 'PLAYING') {
    console.log('[BIDDING COMPLETE] Game already in PLAYING status, skipping');
    return;
  }
  
  if (typeof game.dealerIndex !== 'number') {
    io.to(game.id).emit('error', { message: 'Invalid game state: no dealer assigned' });
    return;
  }

  // Ensure 4 RoundBid rows exist for this round in DB
  try {
    if (game.dbGameId) {
      const roundNumber = game.currentRound || 1;
      let roundRecord = await prisma.round.findFirst({ where: { gameId: game.dbGameId, roundNumber } });
      if (!roundRecord) {
        roundRecord = await prisma.round.create({
          data: {
            dealerSeatIndex: 0,
            id: `round_${game.dbGameId}_${roundNumber}_${Date.now()}`,
            gameId: game.dbGameId,
            roundNumber,
            createdAt: new Date(),
          }
        });
      }
      
      // Create RoundBid records for each player (fill missing with 0)
      for (let i = 0; i < 4; i++) {
        const player = game.players[i];
        if (!player) continue;
        
        const bid = (game.bidding.bids?.[i] ?? 0);
        await prisma.roundBid.upsert({
          where: {
            roundId_userId: {
              roundId: roundRecord.id,
              userId: player.id
            }
          },
          update: {
            bid,
            isBlindNil: bid === -1,
            createdAt: new Date()
          },
          create: {
            id: `bid_${roundRecord.id}_${player.id}_${Date.now()}`,
            roundId: roundRecord.id,
            userId: player.id,
            seatIndex: i,
            bid,
            isBlindNil: bid === -1,
            createdAt: new Date()
          }
        });
      }
    }
  } catch (err) {
    console.error('[BIDDING COMPLETE] Failed to ensure 4 RoundBid rows:', err);
  }

  // Initialize dealer index from game
  let actualDealerIndex = game.dealerIndex;
  
  console.log("[BIDDING COMPLETE DEBUG] dealerIndex:", game.dealerIndex, "firstPlayerIndex:", (game.dealerIndex + 1) % 4);
  console.log("[BIDDING COMPLETE DEBUG] players array:", game.players.map((p, i) => `${i}: ${p?.username || "null"}`));
  console.log("[BIDDING COMPLETE DEBUG] selected player:", game.players[(game.dealerIndex + 1) % 4]?.username);
  
  // Update dealer index from database if available
  try {
    const currentRound = await prisma.round.findFirst({
      where: { gameId: game.id },
      orderBy: { roundNumber: 'desc' }
    });
    
    if (currentRound) {
      actualDealerIndex = currentRound.dealerSeatIndex;
    }
  } catch (error) {
    console.log("[BIDDING COMPLETE DEBUG] Error checking database dealer:", error);
  }
  
  // Update game status to PLAYING
  game.status = 'PLAYING';
  // Sync and expose dealer seat across fields so client can rely on it
  game.dealerIndex = actualDealerIndex as any;
  (game as any).dealer = actualDealerIndex;
  // Avoid nulls to satisfy runtime expectations on client/types
  game.bidding.currentBidderIndex = -1 as unknown as any;
  game.bidding.currentPlayer = '' as unknown as any;
  
  // Initialize round/trick counters
  game.currentRound = game.currentRound || 1;
  game.currentTrick = 0;
  // Set up play state
  game.play = {
    currentPlayer: game.players[(actualDealerIndex + 1) % 4]?.id || '',
    currentPlayerIndex: (actualDealerIndex + 1) % 4,
    currentTrick: [],
    tricks: [],
    trickNumber: 0,
    spadesBroken: false
  };
  // Reflect current player in top-level helper fields for persistence/debug
  game.currentPlayer = game.play.currentPlayer;
  game.currentTrick = 1;
  
  // Update hands in in-memory store
  try {
    const currentRound = await prisma.round.findFirst({
      where: { gameId: game.id },
      orderBy: { roundNumber: 'desc' }
    });
    
    if (currentRound) {
      const handSnapshots = await prisma.roundHandSnapshot.findMany({
        where: { roundId: currentRound.id }
      });
      
      if (handSnapshots.length > 0) {
        game.hands = handSnapshots.map((snapshot: any) =>
          (snapshot.cards as any[]).map((card: any) => ({ suit: card.suit, rank: card.rank }))
        );
        console.log('[BIDDING COMPLETE] Updated hands from database:', game.hands?.map((h, i) => ({ seat: i, cards: h?.length || 0 })));
      }
    }
  } catch (error) {
    console.error('[BIDDING COMPLETE] Error updating hands in in-memory store:', error);
  }
  
  // Update game status in database and in-memory
  try {
    console.log('[BIDDING COMPLETE] About to update game status to PLAYING for game:', game.id);
    const updateResult = await prisma.game.update({
      where: { id: game.id },
      data: { status: 'PLAYING', dealer: actualDealerIndex, startedAt: new Date(), currentRound: game.currentRound, currentTrick: 0, currentPlayer: game.currentPlayer }
    });
    console.log('[BIDDING COMPLETE] Successfully updated game status to PLAYING in database:', game.id, 'Result:', updateResult.status);
    
    // Update in-memory game status
    game.status = 'PLAYING';
    
    // Update the game in the games store
    const { gamesStore } = await import('../../../../gamesStore');
    const inMemoryGame = gamesStore.getGame(game.id);
    if (inMemoryGame) {
      inMemoryGame.status = 'PLAYING';
      
      // Initialize play state if not exists
      if (!inMemoryGame.play) {
        inMemoryGame.play = {
          currentPlayer: game.players[(actualDealerIndex + 1) % 4]?.id || '',
      currentPlayerIndex: (actualDealerIndex + 1) % 4,
        currentTrick: [],
        tricks: [],
        trickNumber: 0,
        spadesBroken: false
        };
        console.log('[BIDDING COMPLETE] Initialized play state for in-memory game');
      }
      
      console.log('[BIDDING COMPLETE] Updated in-memory game status to PLAYING in games store');
    }
    
    console.log('[BIDDING COMPLETE] Updated in-memory game status to PLAYING');
  } catch (err) {
    console.error('[BIDDING COMPLETE] Failed to update game status in database:', err);
    throw err;
  }
  
  // Persist the transition to PLAYING before notifying clients
  try {
    await saveGameState(game);
  } catch (e) {
    console.error('[BIDDING COMPLETE] Failed to persist game state before emit:', e);
  }

  // Emit bidding complete event
  io.to(game.id).emit('bidding_complete', { 
    currentBidderIndex: null, 
    bids: game.bidding.bids 
  });

  // Emit play start event
  io.to(game.id).emit('play_start', {
    currentPlayer: game.play.currentPlayer,
    currentTrick: game.play.currentTrick,
    hands: game.hands
  });

  // Emit game update
  io.to(game.id).emit('game_update', enrichGameForClient(game));

  // Determine first player
  const firstPlayer = game.players[(actualDealerIndex + 1) % 4];
  
  if (firstPlayer && firstPlayer.type === 'bot') {
    setTimeout(async () => {
      const { gamesStore } = await import('../../../../gamesStore');
      const updatedGame = gamesStore.getGame(game.id);
      
      if (updatedGame) {
        console.log('[BIDDING COMPLETE] Using updated game from in-memory store for bot play');
        console.log('[BIDDING COMPLETE] Bot hands in updated game:', updatedGame.hands?.map((h, i) => ({ seat: i, cards: h?.length || 0 })));
        console.log('[BIDDING COMPLETE] Bot game status:', updatedGame.status);
        console.log('[BIDDING COMPLETE] Bot game play object:', updatedGame.play);
        console.log('[BIDDING COMPLETE] Calling botPlayCard with io:', io ? 'available' : 'undefined');
        botPlayCard(updatedGame, (actualDealerIndex + 1) % 4, io);
      } else {
        console.log('[BIDDING COMPLETE] Game not found in in-memory store, using original game');
        console.log('[BIDDING COMPLETE] Bot hands in original game:', game.hands?.map((h, i) => ({ seat: i, cards: h?.length || 0 })));
        console.log('[BIDDING COMPLETE] Original game status:', game.status);
        console.log('[BIDDING COMPLETE] Original game play object:', game.play);
        console.log('[BIDDING COMPLETE] Calling botPlayCard (fallback) with io:', io ? 'available' : 'undefined');
        botPlayCard(game, (actualDealerIndex + 1) % 4, io);
      }
    }, 500);
  } else {
    // Start timeout for human player's first card play
    startTurnTimeout(game, (actualDealerIndex + 1) % 4, 'playing');
  }
}