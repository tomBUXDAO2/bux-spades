import { io } from '../../../index';
import { enrichGameForClient } from '../../../routes/games/shared/gameUtils';
import type { Game } from '../../../types/game';
import { botPlayCard } from '../../../modules/bot-play';
import { determineTrickWinner, getCardValue } from '../utils/cardUtils';
import { handleHandCompletion } from '../hand/handCompletion';
import prisma from '../../../lib/prisma';
import { startTurnTimeout } from '../../../modules/timeout-management/core/timeoutManager';
import { newdbEnsureRound, newdbCreateTrickAndCards } from '../../../newdb/writers';

/**
 * TRICK COMPLETION FUNCTION - FIXES TRICK LEADER ASSIGNMENT
 */
export async function handleTrickCompletion(game: Game, socketId?: string): Promise<void> {
  try {
    console.log('[TRICK COMPLETION] Starting trick completion for game:', game.id);
    
    if (!game.play || !game.play.currentTrick || game.play.currentTrick.length !== 4) {
      console.log('[TRICK COMPLETION] Invalid trick state, skipping');
      return;
    }
    
    // Store the completed trick data for animation
    const completedTrick = [...game.play.currentTrick];
    
    // Determine trick winner
    const winnerIndex = determineTrickWinner(game.play.currentTrick);
    console.log('[TRICK COMPLETION] Trick winner determined:', winnerIndex);
    
    // Award trick to winner
    if (game.players[winnerIndex]) {
      game.players[winnerIndex]!.tricks = (game.players[winnerIndex]!.tricks || 0) + 1;
      console.log('[TRICK COMPLETION] Awarded trick to player', winnerIndex, 'new count:', game.players[winnerIndex]!.tricks);
      
      // Update PlayerTrickCount in database
      if (game.dbGameId) {
        try {
          const { updatePlayerTrickCount } = await import('../../database-scoring/trick-count/trickCountManager');
          const player = game.players[winnerIndex];
          if (player) {
            // For bots, use the universal bot user ID instead of the unique bot ID
            let userId = player.id;
            if (player.type === 'bot') {
              userId = player.id;
            }
            console.log('[TRICK COMPLETION DEBUG] About to call updatePlayerTrickCount with:', {
              gameId: game.dbGameId,
              roundNumber: game.currentRound,
              userId: userId,
              tricks: player.tricks
            });
            await updatePlayerTrickCount(game.dbGameId, game.currentRound, userId, player.tricks);
            console.log('[TRICK COMPLETION DEBUG] updatePlayerTrickCount completed');
          }
        } catch (error) {
          console.error('[TRICK COMPLETION] Failed to update PlayerTrickCount:', error);
        }

        // Log the trick and cards to database
        try {
          const roundRecord = await prisma.round.findFirst({
            where: { gameId: game.dbGameId, roundNumber: game.currentRound }
          });
          if (roundRecord) {
            // Get the lead player ID from the first card
            const leadPlayerId = game.play.currentTrick[0].playedBy || game.players[game.play.currentTrick[0].playerIndex || 0]?.id;
            
            // Create Trick record
            const trickRecord = await prisma.trick.create({
              data: {
                id: `trick_${roundRecord.id}_${game.play.trickNumber || 0 + 1}_${Date.now()}`,
                roundId: roundRecord.id,
                trickNumber: (game.play.trickNumber || 0) + 1,
                leadPlayerId: leadPlayerId || '',
                winningPlayerId: game.players[winnerIndex]!.id,
                createdAt: new Date(),
                updatedAt: new Date()
              }
            });
            console.log(`[TRICK COMPLETION] Created Trick record: ${trickRecord.id}`);

            // Create Card records for each card in the trick
            for (let i = 0; i < game.play.currentTrick.length; i++) {
              const card = game.play.currentTrick[i];
              const playerId = card.playedBy || game.players[card.playerIndex || 0]?.id;
              await prisma.card.create({
                data: {
                  id: `card_${trickRecord.id}_${i}_${Date.now()}`,
                  trickId: trickRecord.id,
                  playerId: playerId || '',
                  suit: card.suit,
                  value: getCardValue(card), // Convert rank to numeric value
                  position: i,
                  createdAt: new Date(),
                  updatedAt: new Date()
                }
              });
            }
            console.log(`[TRICK COMPLETION] Created ${game.play.currentTrick.length} Card records for trick ${(game.play.trickNumber || 0) + 1}`);
          }
        } catch (error) {
          console.error('[TRICK COMPLETION] Failed to log trick and cards to database:', error);
        }

        // NEW DB: dual-write trick and cards
        try {
          const roundIdNew = await newdbEnsureRound({ gameId: game.id, roundNumber: game.currentRound, dealerSeatIndex: game.dealerIndex ?? 0 });
          const leadSeatIndex = game.play.currentTrick[0].playerIndex ?? 0;
          const plays = game.play.currentTrick.map((c, idx) => ({ seatIndex: c.playerIndex ?? 0, suit: c.suit, rank: String(c.rank), order: idx }));
          await newdbCreateTrickAndCards({
            roundId: roundIdNew,
            trickNumber: (game.play.trickNumber || 0) + 1,
            leadSeatIndex,
            winningSeatIndex: winnerIndex,
            plays
          });
        } catch (e) {
          console.warn('[NEWDB] Failed to dual-write trick/cards:', e);
        }
      }
    }
    
    // Store completed trick
    game.play.tricks.push({
      cards: completedTrick,
      winnerIndex: winnerIndex,
    });
    
    // Check if this was the last trick BEFORE incrementing
    const currentTrickNumber = game.play.trickNumber || 0;
    console.log("[TRICK COMPLETION DEBUG] currentTrickNumber:", currentTrickNumber, "isLastTrick:", currentTrickNumber >= 12);
    const isLastTrick = currentTrickNumber >= 12; // 0-based: trick 12 is the 13th and final trick
    
    // Increment trick number
    game.play.trickNumber = currentTrickNumber + 1;
    
    // Emit trick complete with the stored trick data for animation
    io.to(game.id).emit('trick_complete', {
      trick: {
        cards: completedTrick,
        winnerIndex,
      },
      trickNumber: game.play.trickNumber,
    });
    
    // CRITICAL: Set winner as next trick leader BEFORE any delays
    game.play.currentPlayerIndex = winnerIndex;
    game.play.currentPlayer = game.players[winnerIndex]?.id || '';
    console.log('[TRICK COMPLETION] Set currentPlayerIndex to winner:', winnerIndex);
    console.log('[TRICK COMPLETION] Set currentPlayer to:', game.play.currentPlayer);
    
    // Defer clearing the trick until after clients have started the animation
    setTimeout(async () => {
      if (!game.play) return;
      game.play.currentTrick = []; // Clear the trick for proper game state

      // Emit explicit table clear event for clients
      io.to(game.id).emit('clear_table_cards');
      
      // Emit game update with new status
      io.to(game.id).emit('game_update', enrichGameForClient(game));
      
      // If all tricks played, move to hand summary/scoring
      if (isLastTrick) {
        console.log('[TRICK COMPLETION] Last trick completed, triggering hand completion');
        await handleHandCompletion(game);
      } else {
        // If the winner is a bot, trigger their move for the next trick
        const winnerPlayer = game.players[winnerIndex];
        if (winnerPlayer && winnerPlayer.type === 'bot') {
          console.log('[BOT TURN] Winner is bot, triggering next turn for:', winnerPlayer.username, 'at index:', winnerIndex);
          console.log('[BOT TURN DEBUG] Current player index is:', game.play.currentPlayerIndex);
          // Add a small delay to allow the trick completion animation
          setTimeout(async () => {
            // Double-check that it's still this bot's turn before playing
            if (game.play && game.play.currentPlayerIndex === winnerIndex &&
                game.players[winnerIndex] && game.players[winnerIndex]!.type === 'bot') {
              console.log('[BOT TURN DEBUG] Calling botPlayCard for bot at index:', winnerIndex);
              // const { botPlayCard } = await import('../routes/games.routes');
              botPlayCard(game, winnerIndex);
            } else {
              console.log('[BOT TURN DEBUG] Bot turn conditions not met:', {
                hasGamePlay: !!game.play,
                currentPlayerIndex: game.play?.currentPlayerIndex,
                expectedIndex: winnerIndex,
                playerExists: !!game.players[winnerIndex],
                playerType: game.players[winnerIndex]?.type
              });
            }
          }, 100); // Reduced delay for faster gameplay
        } else if (winnerPlayer && winnerPlayer.type === 'human') {
          // Human player's turn - start their timeout for the next trick
          console.log('[HUMAN TURN] Human player', winnerPlayer.username, 'at index', winnerIndex, 'can now play');
          startTurnTimeout(game, winnerIndex, 'playing');
        }
      }
    }, isLastTrick ? 2500 : 1000); // Longer delay for final trick to allow animation + clear table
    
  } catch (error) {
    console.error('[TRICK COMPLETION ERROR] Failed to complete trick:', error);
    throw error;
  }
}
