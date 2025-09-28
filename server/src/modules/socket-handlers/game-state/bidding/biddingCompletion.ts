import type { Game } from '../../../../types/game';
import { io } from '../../../../index';
import { enrichGameForClient } from '../../../../routes/games/shared/gameUtils';
import prisma from '../../../../lib/prisma';
import { startTurnTimeout } from '../../../timeout-management/core/timeoutManager';
import { newdbEnsureRound, newdbUpsertBid } from '../../../../newdb/writers';
import { botPlayCard } from '../../../bot-play';

/**
 * Handles bidding completion
 */
export async function handleBiddingComplete(game: Game): Promise<void> {
  
  // Prevent multiple bidding completions
  // Note: We allow bidding completion even if game is already PLAYING
  // This ensures the client gets the complete game state with all data
  if (game.status === 'PLAYING') {
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
            // updatedAt: new Date()
          }
        });
      }
      for (let i = 0; i < 4; i++) {
        const p = game.players[i];
        if (!p) continue;
        const bid = game.bidding.bids[i] ?? 0;
        await prisma.roundBid.upsert({
          where: { roundId_userId: { roundId: roundRecord.id, userId: p.id } },
          update: { bid, isBlindNil: bid === -1 },
          create: {
            id: `bid_${roundRecord.id}_${i}_${Date.now()}`,
            roundId: roundRecord.id,
            userId: p.id,
            seatIndex: i, // Add the required seatIndex field
            bid,
            isBlindNil: bid === -1,
            createdAt: new Date()
          }
        });
      }

      // NEW DB: ensure round and upsert bids
      try {
        const roundIdNew = await newdbEnsureRound({ gameId: game.id, roundNumber, dealerSeatIndex: actualDealerIndex });
        for (let i = 0; i < 4; i++) {
          const p = game.players[i];
          if (!p) continue;
          const bid = game.bidding.bids[i] ?? 0;
          await newdbUpsertBid({ roundId: roundIdNew, userId: p.id, seatIndex: i, bid });
        }
      } catch (e) {
        console.warn('[NEWDB] Failed to dual-write bids on completion:', e);
      }
    }
  } catch (err) {
    console.error('[BIDDING COMPLETE] Failed to ensure 4 RoundBid rows:', err);
  }
  
  console.log("[BIDDING COMPLETE DEBUG] dealerIndex:", game.dealerIndex, "firstPlayerIndex:", (game.dealerIndex + 1) % 4);
  console.log("[BIDDING COMPLETE DEBUG] players array:", game.players.map((p, i) => `${i}: ${p?.username || "null"}`));
  console.log("[BIDDING COMPLETE DEBUG] selected player:", game.players[(game.dealerIndex + 1) % 4]?.username);
  
  // Check the actual dealer from the database
  let actualDealerIndex = game.dealerIndex;
  try {
    const currentRound = await prisma.round.findFirst({
      where: { gameId: game.id },
      orderBy: { roundNumber: 'desc' }
    });
    if (currentRound) {
      console.log("[BIDDING COMPLETE DEBUG] Database dealerSeatIndex:", currentRound.dealerSeatIndex);
      actualDealerIndex = currentRound.dealerSeatIndex;
    }
  } catch (error) {
    console.log("[BIDDING COMPLETE DEBUG] Error checking database dealer:", error);
  }
  
  console.log("[BIDDING COMPLETE DEBUG] Using dealer index:", actualDealerIndex, "first player index:", (actualDealerIndex + 1) % 4);
  const firstPlayer = game.players[(actualDealerIndex + 1) % 4];
  if (!firstPlayer) {
    io.to(game.id).emit('error', { message: 'Invalid game state' });
    return;
  }
  
  // Update game status
  game.status = 'PLAYING';
  const firstPlayerIndex = (actualDealerIndex + 1) % 4;
  game.play = {
    currentPlayer: firstPlayer.id ?? '',
    currentPlayerIndex: firstPlayerIndex,
    currentTrick: [],
    tricks: [],
    trickNumber: 0,
    spadesBroken: false
  };
  
  // Update the in-memory games store with basic info first
  const { gamesStore } = await import('../../../../gamesStore');
  const existingGame = gamesStore.getGame(game.id);
  if (existingGame) {
    existingGame.status = 'PLAYING';
    existingGame.play = game.play;
    
    // CRITICAL: Update player bid data in in-memory store
    if (game.players) {
      game.players.forEach((player, index) => {
        if (player && existingGame.players[index]) {
          existingGame.players[index].bid = player.bid;
        }
      });
    }
    
    // CRITICAL: Update bidding data in in-memory store
    if (game.bidding) {
      existingGame.bidding = game.bidding;
    }
    
    console.log('[BIDDING COMPLETE] Updated in-memory game store for game:', game.id);
    console.log('[BIDDING COMPLETE] Updated player bids in store:', existingGame.players.map(p => p?.bid));
  } else {
    console.log('[BIDDING COMPLETE] Game not found in games store:', game.id);
  }
  
  // CRITICAL: Update hands in in-memory store IMMEDIATELY before bot tries to play
  try {
    const currentRound = await prisma.round.findFirst({
      where: { gameId: game.id },
      orderBy: { roundNumber: 'desc' }
    });
    
    if (currentRound) {
      const hands = await prisma.roundHandSnapshot.findMany({
        where: { roundId: currentRound.id },
        orderBy: { seatIndex: 'asc' }
      });
      
      const handsArray = new Array(4).fill(null);
      hands.forEach(hand => {
        if (hand.cards && Array.isArray(hand.cards)) {
          handsArray[hand.seatIndex] = hand.cards;
        }
      });
      
      // Update in-memory store with hands IMMEDIATELY
      if (existingGame) {
        existingGame.hands = handsArray;
        console.log('[BIDDING COMPLETE] CRITICAL: Updated hands in in-memory store immediately:', game.id);
        console.log('[BIDDING COMPLETE] CRITICAL: Hands in store:', existingGame.hands?.map((h, i) => ({ seat: i, cards: h?.length || 0 })));
      }
    }
  } catch (error) {
    console.error('[BIDDING COMPLETE] Error updating hands in in-memory store:', error);
  }
  
  
  // Update game status in database - single database connection
  try {
    console.log('[BIDDING COMPLETE] About to update game status to PLAYING for game:', game.id);
    const updateResult = await prisma.game.update({
      where: { id: game.id },
      data: {
        status: 'PLAYING'
      }
    });
    console.log('[BIDDING COMPLETE] Successfully updated game status to PLAYING in database:', game.id, 'Result:', updateResult.status);
  } catch (err) {
    console.error('[BIDDING COMPLETE] Failed to update game status in database:', err);
    throw err; // Re-throw to ensure we know if the database update failed
  }
  
  console.log('[BIDDING COMPLETE] Moving to play phase, first player:', firstPlayer.username);
  
  // Fetch latest game data from database to ensure bids are included
  const dbGame = await prisma.game.findUnique({
    where: { id: game.id }
  });
  
  if (dbGame) {
    const gamePlayers = await prisma.gamePlayer.findMany({
      where: { gameId: game.id },
      orderBy: { seatIndex: 'asc' }
    });
    
    const userIds = gamePlayers.map(p => p.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } }
    });
    const userMap = new Map(users.map(u => [u.id, u]));
    
    // Get current round and bids
    const currentRound = await prisma.round.findFirst({
      where: { gameId: game.id },
      orderBy: { roundNumber: 'desc' }
    });
    
    const bids = currentRound ? await prisma.roundBid.findMany({
      where: { roundId: currentRound.id }
    }) : [];
    
    const bidMap = new Map(bids.map(b => [b.userId, b.bid]));
    
    console.log('[BIDDING COMPLETE] Bid map:', Array.from(bidMap.entries()));
    console.log('[BIDDING COMPLETE] Game players:', gamePlayers.map(p => ({ userId: p.userId, seatIndex: p.seatIndex })));
    
    // Get hands from database
    const hands = await prisma.roundHandSnapshot.findMany({
      where: { roundId: currentRound.id },
      orderBy: { seatIndex: 'asc' }
    });
    
    console.log('[BIDDING COMPLETE] Hands from database:', hands.map(h => ({ seatIndex: h.seatIndex, handLength: h.cards?.length || 0 })));
    
    // Reconstruct hands array
    const handsArray = new Array(4).fill(null);
    hands.forEach(hand => {
      if (hand.cards && Array.isArray(hand.cards)) {
        handsArray[hand.seatIndex] = hand.cards;
        console.log(`[BIDDING COMPLETE] Set hands for seat ${hand.seatIndex}:`, hand.cards.length, 'cards');
      }
    });
    
    console.log('[BIDDING COMPLETE] Final hands array:', handsArray.map((h, i) => ({ seat: i, cards: h?.length || 0 })));
    
    // Reconstruct game object with latest data
    console.log('[BIDDING COMPLETE] Creating enrichedGame with dealerIndex:', actualDealerIndex);
    const enrichedGame = {
      id: dbGame.id,
      status: 'PLAYING',
      mode: dbGame.mode || 'PARTNERS',
      rated: dbGame.isRated ?? false,
      league: dbGame.isLeague ?? false,
      solo: (dbGame.mode === 'SOLO') || false,
      minPoints: dbGame.minPoints || -100,
      maxPoints: dbGame.maxPoints || 150,
      buyIn: dbGame.buyIn || 100000,
      dealerIndex: actualDealerIndex,
      hands: handsArray,
      currentPlayer: firstPlayer.id,
      players: gamePlayers.map(p => {
        const playerBid = bidMap.get(p.userId) ?? null;
        console.log(`[BIDDING COMPLETE] Player ${p.userId} (seat ${p.seatIndex}) bid:`, playerBid);
        return {
          id: p.userId,
          username: userMap.get(p.userId)?.username || `Bot ${p.userId.slice(-4)}`,
          avatarUrl: userMap.get(p.userId)?.avatarUrl || null,
          type: p.isHuman ? 'human' : 'bot',
          seatIndex: p.seatIndex,
          teamIndex: p.teamIndex ?? null,
          bid: playerBid,
          tricks: null as number | null,
          points: null as number | null,
          bags: null as number | null
        };
      }),
      bidding: {
        currentPlayer: firstPlayer.id,
        currentBidderIndex: (actualDealerIndex + 1) % 4,
        bids: gamePlayers.map(p => bidMap.get(p.userId) ?? null)
      },
      play: {
      currentPlayer: firstPlayer.id,
      currentPlayerIndex: (actualDealerIndex + 1) % 4,
        currentTrick: [],
        tricks: [],
        trickNumber: 0,
        spadesBroken: false
      },
      rules: {
        minPoints: dbGame.minPoints || -100,
        maxPoints: dbGame.maxPoints || 150,
        allowNil: dbGame.nilAllowed ?? true,
        allowBlindNil: dbGame.blindNilAllowed ?? false,
        assassin: false,
        screamer: false
      },
      createdAt: dbGame.createdAt
    };
    
    // Emit events with enriched game data
    console.log('[BIDDING COMPLETE] Sending game_update with bids:', {
      players: enrichedGame.players.map(p => ({ id: p.id, bid: p.bid })),
      bidding: enrichedGame.bidding
    });
    console.log('[BIDDING COMPLETE] EnrichedGame dealerIndex:', enrichedGame.dealerIndex);
    console.log('[BIDDING COMPLETE] EnrichedGame status:', enrichedGame.status);
    console.log('[BIDDING COMPLETE] Sending game_update with dealerIndex:', enrichedGame.dealerIndex);
    console.log('[BIDDING COMPLETE] FULL ENRICHED GAME OBJECT:', JSON.stringify(enrichedGame, null, 2));
    
    // Debug socket connection before sending
    const roomSockets = await io.in(game.id).fetchSockets();
    console.log('[BIDDING COMPLETE] Room sockets count:', roomSockets.length);
    console.log('[BIDDING COMPLETE] Room socket IDs:', roomSockets.map(s => s.id));
    
    io.to(game.id).emit('game_update', enrichedGame);
    console.log('[BIDDING COMPLETE] game_update event sent to room:', game.id);
    io.to(game.id).emit('bidding_complete', { currentBidderIndex: null, bids: gamePlayers.map(p => bidMap.get(p.userId) ?? null) });
  } else {
    // Fallback to original game object - but still use enrichedGame if available
    console.log('[BIDDING COMPLETE] Using fallback game update');
    io.to(game.id).emit('game_update', enrichGameForClient(game));
    io.to(game.id).emit('bidding_complete', { currentBidderIndex: null, bids: game.bidding.bids });
  }
  io.to(game.id).emit('play_start', {
    gameId: game.id,
    currentPlayerIndex: game.play.currentPlayerIndex,
    currentTrick: game.play.currentTrick,
    // trickNumber: game.play.trickNumber,
  });
  
  // If first player is a bot, trigger bot card play
  if (firstPlayer.type === 'bot') {
    setTimeout(async () => {
      // Get the updated game from in-memory store with hands
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
