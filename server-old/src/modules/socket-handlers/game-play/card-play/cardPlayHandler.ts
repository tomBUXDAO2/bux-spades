import type { AuthenticatedSocket } from '../../../../types/socket';
import { io } from '../../../../index';
import { enrichGameForClient } from '../../../../routes/games/shared/gameUtils';
import { prisma } from '../../../../lib/prisma';
import { clearTurnTimeout } from '../../../timeout-management/core/timeoutManager';
import { queueSave } from '../../../../lib/game-state-persistence/save/debouncedGameSaver';

/**
 * Handle play card socket event
 */
export async function handlePlayCard(socket: AuthenticatedSocket, data: any): Promise<void> {
  try {
    const { gameId, card } = data;
    const userId = socket.userId;
    
    if (!userId) {
      socket.emit('error', { message: 'Not authenticated' });
      return;
    }

    console.log('[CARD PLAY HANDLER] User playing card:', { gameId, userId, card });

    // Fetch game from database
    const dbGame = await prisma.game.findUnique({
      where: { id: gameId }
    });

    if (!dbGame) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Get game players
    const gamePlayers = await prisma.gamePlayer.findMany({
      where: { gameId: gameId },
      orderBy: { seatIndex: 'asc' }
    });

    // Find the player playing the card
    const player = gamePlayers.find(p => p.userId === userId);
    if (!player) {
      socket.emit('error', { message: 'You are not in this game' });
      return;
    }

    if (dbGame.status !== 'PLAYING') {
      // Check in-memory state; if playing there, backfill DB and proceed
      const { gamesStore } = await import('../../../../gamesStore');
      const mem = gamesStore.getGame(gameId);
      if (mem?.status === 'PLAYING') {
        try {
          await prisma.game.update({ where: { id: gameId }, data: { status: 'PLAYING' } });
          console.log('[CARD PLAY HANDLER] DB status backfilled to PLAYING based on in-memory state');
        } catch {}
      } else {
        socket.emit('error', { message: 'Game is not in playing phase' });
        return;
      }
    }

    // Get current round
    const currentRound = await prisma.round.findFirst({
      where: { gameId: gameId },
      orderBy: { roundNumber: 'desc' }
    });

    if (!currentRound) {
      socket.emit('error', { message: 'No current round found' });
      return;
    }

    // Find the current trick (most recent one)
    let currentTrick = await prisma.trick.findFirst({
      where: { roundId: currentRound.id },
      orderBy: { trickNumber: 'desc' }
    });
    
    let trickId: string;
    
    if (!currentTrick) {
      // First card of the first trick - create a new Trick record
      const newTrick = await prisma.trick.create({
        data: {
          id: `trick_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          roundId: currentRound.id,
          trickNumber: 1,
          leadSeatIndex: player.seatIndex,
          winningSeatIndex: player.seatIndex // Will be updated when trick is complete
        }
      });
      trickId = newTrick.id;
      console.log(`[CARD PLAY HANDLER] Created new trick ${trickId} for round ${currentRound.id}`);
    } else {
      // Check if current trick is complete (4 cards)
      const currentTrickCards = await prisma.trickCard.findMany({
        where: { trickId: currentTrick.id }
      });
      
      if (currentTrickCards.length >= 4) {
        // Current trick is complete, create a new one
        const newTrick = await prisma.trick.create({
          data: {
            id: `trick_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            roundId: currentRound.id,
            trickNumber: currentTrick.trickNumber + 1,
            leadSeatIndex: player.seatIndex,
            winningSeatIndex: player.seatIndex // Will be updated when trick is complete
          }
        });
        trickId = newTrick.id;
        console.log(`[CARD PLAY HANDLER] Created new trick ${trickId} for round ${currentRound.id}`);
      } else {
        // Use existing trick
        trickId = currentTrick.id;
      }
    }
    
    // Get the current trick's cards to determine play order
    const currentTrickCards = await prisma.trickCard.findMany({
      where: { trickId: trickId }
    });

    // Store the played card in the database
    await prisma.trickCard.create({
      data: {
        id: `trickcard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        trickId: trickId,
        seatIndex: player.seatIndex,
        suit: card.suit,
        rank: card.rank,
        playOrder: currentTrickCards.length + 1 // Current position in trick
      }
    });

    console.log(`[CARD PLAY HANDLER] Stored card ${card.suit}${card.rank} for player ${userId} in round ${currentRound.id}`);

    // Clear the timeout since the player has made their move
    clearTurnTimeout(gameId);
    console.log(`[CARD PLAY HANDLER] Cleared timeout for game ${gameId}`);

    // Get next player
    const currentSeatIndex = player.seatIndex;
    const nextSeatIndex = (currentSeatIndex + 1) % 4;
    const nextPlayer = gamePlayers.find(p => p.seatIndex === nextSeatIndex);

    if (nextPlayer) {
      // Update game status to next player's turn
      await prisma.game.update({
        where: { id: gameId },
        data: { 
          status: 'PLAYING'
        }
      });

      // Update in-memory game state with played card
      const { gamesStore } = await import('../../../../gamesStore');
      const inMemoryGame = gamesStore.getGame(gameId);
      
      if (inMemoryGame && inMemoryGame.play) {
        // Add card to current trick
        inMemoryGame.play.currentTrick.push({
          ...card,
          playedBy: userId,
          playerIndex: player.seatIndex
        });
        
        // Update current player (play + top-level helper)
        inMemoryGame.play.currentPlayer = nextPlayer.userId;
        inMemoryGame.play.currentPlayerIndex = nextSeatIndex;
        inMemoryGame.currentPlayer = inMemoryGame.play.currentPlayer;
        
        // Remove card from player's hand
        if (inMemoryGame.hands && inMemoryGame.hands[player.seatIndex]) {
          const originalHandSize = inMemoryGame.hands[player.seatIndex].length;
          inMemoryGame.hands[player.seatIndex] = inMemoryGame.hands[player.seatIndex].filter(
            (handCard: any) => !(handCard.suit === card.suit && handCard.rank === card.rank)
          );
          const newHandSize = inMemoryGame.hands[player.seatIndex].length;
          console.log('[CARD PLAY DEBUG] Hand size changed from', originalHandSize, 'to', newHandSize, 'for player', player.seatIndex);
          
          // Also update the player's individual hand for consistency
          const playerObj = inMemoryGame.players[player.seatIndex];
          if (playerObj) {
            playerObj.hand = inMemoryGame.hands[player.seatIndex];
            console.log('[CARD PLAY DEBUG] Updated player.hand size to', playerObj.hand.length);
          }
        }
        
        // Break spades if a spade is played on a non-spade lead
        if (inMemoryGame.play.currentTrick.length > 0) {
          const leadSuit = inMemoryGame.play.currentTrick[0].suit;
          if (!inMemoryGame.play.spadesBroken && card.suit === 'SPADES' && leadSuit !== 'SPADES') {
            inMemoryGame.play.spadesBroken = true;
            console.log('[CARD PLAY HANDLER] Spades are now broken');
          }
        }
        
        // Mirror top-level helpers used by persistence/monitoring
        inMemoryGame.currentPlayer = inMemoryGame.play.currentPlayer;
        inMemoryGame.currentTrickCards = inMemoryGame.play.currentTrick as any;
        inMemoryGame.lastAction = 'card_played';
        inMemoryGame.lastActionTime = Date.now();
        console.log(`[CARD PLAY HANDLER] Updated in-memory game with played card: ${card.suit}${card.rank}`);
        // Persist current player immediately to avoid UI/DB desync
        try {
          // Build a compact snapshot for DB gameState including updated hands and play
          const { enrichGameForClient } = await import('../../../../routes/games/shared/gameUtils');
          const snapshot = enrichGameForClient(inMemoryGame);
          await prisma.game.update({
            where: { id: gameId },
            data: {
              currentPlayer: inMemoryGame.currentPlayer,
              currentRound: (inMemoryGame.currentRound ?? 1),
              currentTrick: (Array.isArray(inMemoryGame.play?.currentTrick) ? inMemoryGame.play.currentTrick.length : 0),
              gameState: snapshot as any
            }
          });
        } catch (e) {
          console.error('[CARD PLAY HANDLER] Failed to persist currentPlayer:', e);
        }
        // Queue a debounced save to persist broader state
        queueSave(inMemoryGame);
      }

      // Emit game update with card played
      const updatedGame = await prisma.game.findUnique({
        where: { id: gameId }
      });

      if (updatedGame) {
        // Use the enriched game data that includes currentTrick
        const { enrichGameForClient } = await import('../../../../routes/games/shared/gameUtils');
        const enrichedGame = enrichGameForClient(inMemoryGame || updatedGame);
        
        io.to(gameId).emit('game_update', enrichedGame);
        console.log(`[CARD PLAY HANDLER] Emitted game_update with currentTrick:`, enrichedGame.play?.currentTrick);
      }

      // Check if trick is complete (4 cards played)
      if (inMemoryGame && inMemoryGame.play && inMemoryGame.play.currentTrick.length === 4) {
        console.log('[CARD PLAY HANDLER] Trick complete, triggering trick completion');
        const { handleTrickCompletion } = await import('../../../../lib/hand-completion/trick/trickCompletion');
        await handleTrickCompletion(inMemoryGame, inMemoryGame.play.currentTrick[0].playedBy || '', inMemoryGame.play.currentTrick[0].playedBy || '');
      } else if (nextPlayer.isHuman === false) {
        // If next player is a bot, trigger bot play
        console.log(`[CARD PLAY HANDLER] Triggering bot play for seat ${nextSeatIndex}`);
        setTimeout(async () => {
          try {
            // Import and trigger bot logic
            const { botMakeMove } = await import('../../../bot-play/botLogic');
            
            // Get the in-memory game from gamesStore
            const { gamesStore } = await import('../../../../gamesStore');
            const inMemoryGame = gamesStore.getGame(gameId);
            
            if (inMemoryGame) {
              await botMakeMove(inMemoryGame, nextSeatIndex, 'playing', io);
            } else {
              console.error('[CARD PLAY HANDLER] In-memory game not found for bot play');
            }
          } catch (error) {
            console.error('[CARD PLAY HANDLER] Error triggering bot play:', error);
          }
        }, 1000);
      }
    } else {
      // All players have played, move to next trick or hand
      await prisma.game.update({
        where: { id: gameId },
        data: { status: 'PLAYING' }
      });

      io.to(gameId).emit('game_update', {
        id: gameId,
        status: 'PLAYING',
        message: 'Trick complete, starting next trick'
      });
    }

    console.log('[CARD PLAY HANDLER] Card played successfully');

  } catch (error) {
    console.error('[CARD PLAY HANDLER] Error processing card play:', error);
    socket.emit('error', { message: 'Failed to process card play' });
  }
}
