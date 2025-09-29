import { prisma } from '../../prisma';
import { io } from '../../../index';
import { enrichGameForClient } from '../../../routes/games/shared/gameUtils';
import { determineTrickWinner } from '../utils/cardUtils';
import { handleHandCompletion } from '../hand/handCompletion';
import type { Game } from '../../../types/game';
import { saveGameState } from '../../../lib/game-state-persistence/save/gameStateSaver';
import { queueSave } from '../../../lib/game-state-persistence/save/debouncedGameSaver';

/**
 * Complete trick completion handler
 */
export async function completeTrick(game: any, leadPlayerId: string, winningPlayerId: string) {
  try {
    console.log('[TRICK COMPLETION] Trick completion not yet fully implemented');
    
    // Add the trick to the game state
    game.play.tricks.push({
      cards: game.play.currentTrick,
      leadPlayer: leadPlayerId,
      winner: winningPlayerId,
      completedAt: new Date()
    });
    
    // Clear the current trick
    game.play.currentTrick = [];
    
    return { success: true };
  } catch (error) {
    console.error('[TRICK COMPLETION] Error completing trick:', error);
    return { success: false, error };
  }
}

/**
 * Handle trick completion - determine winner, award points, start new trick
 */
export async function handleTrickCompletion(game: Game, leadPlayerId: string, winningPlayerId: string): Promise<void> {
  try {
    console.log('[TRICK COMPLETION] Starting trick completion for game:', game.id);
    
    if (!game.play || !game.play.currentTrick || game.play.currentTrick.length !== 4) {
      console.log('[TRICK COMPLETION] Invalid trick state, skipping');
      return;
    }
    
    // Store the completed trick data for animation
    const completedTrick = [...game.play.currentTrick];
    
    // Determine trick winner from the four TrickCard plays
    const winnerIndex = determineTrickWinner(game.play.currentTrick);
    console.log('[TRICK COMPLETION] Trick winner determined:', winnerIndex);
    
    // Update the Trick row in the database with the correct winningSeatIndex
    try {
      const currentRound = await prisma.round.findFirst({
        where: { gameId: game.id },
        orderBy: { roundNumber: 'desc' }
      });
      if (currentRound) {
        // Ensure we are updating the same trick number as the one just completed
        const trickNumberToUpdate = (game.play.trickNumber || 0) + 1; // current trick number (1-based)
        console.log('[TRICK COMPLETION DEBUG] Looking for trick number:', trickNumberToUpdate, 'in round:', currentRound.id);
        
        const latestTrick = await prisma.trick.findFirst({
          where: { roundId: currentRound.id, trickNumber: trickNumberToUpdate },
          orderBy: { trickNumber: 'desc' }
        });
        
        if (latestTrick) {
          console.log('[TRICK COMPLETION DEBUG] Found trick:', latestTrick.id, 'trickNumber:', latestTrick.trickNumber, 'current winningSeatIndex:', latestTrick.winningSeatIndex);
          
          await prisma.trick.update({
            where: { id: latestTrick.id },
            data: { winningSeatIndex: winnerIndex }
          });
          console.log('[TRICK COMPLETION] ✅ Persisted winningSeatIndex to DB for trick', latestTrick.trickNumber, ':', winnerIndex);
        } else {
          console.error('[TRICK COMPLETION] ❌ No trick found for trickNumber:', trickNumberToUpdate, 'in round:', currentRound.id);
        }
      }
    } catch (e) {
      console.error('[TRICK COMPLETION] Failed to persist winningSeatIndex:', e);
    }
    
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
            try {
              const fn: any = updatePlayerTrickCount as any;
              if (typeof fn === 'function') {
                if (fn.length === 3) {
                  await fn(game.dbGameId, userId, player.tricks);
                } else {
                  await fn(game.dbGameId, game.currentRound, userId, player.tricks);
                }
              }
            } catch (e) {
              console.error('[TRICK COMPLETION] updatePlayerTrickCount failed:', e);
            }
            console.log('[TRICK COMPLETION DEBUG] updatePlayerTrickCount completed');
          }
        } catch (error) {
          console.error('[TRICK COMPLETION] Failed to update PlayerTrickCount:', error);
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
    const isLastTrick = currentTrickNumber >= 12; // 0-based, so trick 12 is the 13th trick
    
    // Increment trick number
    game.play.trickNumber = currentTrickNumber + 1;
    
    // Emit trick complete with the stored trick data for animation
    io.to(game.id).emit('trick_complete', {
      gameId: game.id,
      completedTrick: completedTrick,
      winnerIndex: winnerIndex,
      isLastTrick: isLastTrick
    });
    
    // Clear current trick
    game.play.currentTrick = [];
    game.currentTrickCards = [];
    
    // Set next player to the trick winner and persist immediately
    game.play.currentPlayer = game.players[winnerIndex]?.id || '';
    game.play.currentPlayerIndex = winnerIndex;
    game.currentPlayer = game.play.currentPlayer;
    try {
      await prisma.game.update({ where: { id: game.id }, data: { currentPlayer: game.currentPlayer } });
    } catch (e) {
      console.error('[TRICK COMPLETION] Failed to persist currentPlayer:', e);
    }
    
    // Check if hand is complete
    if (isLastTrick) {
      console.log('[TRICK COMPLETION] Hand complete, triggering hand completion');
      // Persist final trick of hand synchronously to avoid loss
      try { await saveGameState(game); } catch {}
      await handleHandCompletion(game);
    } else {
      // Emit game update for next trick
      const enrichedGame = enrichGameForClient(game);
      io.to(game.id).emit('game_update', enrichedGame);
      // Debounced save of inter-trick state
      queueSave(game);
      
      // If next player is a bot, trigger bot play
      if (game.players[winnerIndex]?.type === 'bot') {
        setTimeout(async () => {
          try {
            const { playBotCard } = await import('../../../modules/bot-play/botLogic');
            playBotCard(game, winnerIndex, io);
          } catch (e) {
            console.error('[TRICK COMPLETION] Failed to trigger next bot play:', e);
          }
        }, 1000);
      }
    }
    
    console.log('[TRICK COMPLETION] Trick completion completed successfully');
  } catch (error) {
    console.error('[TRICK COMPLETION] Error in trick completion:', error);
  }
}