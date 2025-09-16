import { io } from '../../../index';
import { enrichGameForClient } from '../../../routes/games/shared/gameUtils';
import type { Game } from '../../../types/game';
import { botPlayCard } from '../../../modules/bot-play';
import { determineTrickWinner } from '../utils/cardUtils';
import { handleHandCompletion } from '../hand/handCompletion';

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
              userId = 'bot-user-universal';
            }
            await updatePlayerTrickCount(game.dbGameId, game.currentRound, userId, player.tricks);
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
      trick: {
        cards: completedTrick,
        winnerIndex,
      },
      trickNumber: game.play.trickNumber,
    });
    
    // CRITICAL: Set winner as next trick leader BEFORE any delays
    game.play.currentPlayerIndex = winnerIndex;
    console.log('[TRICK COMPLETION] Set currentPlayerIndex to winner:', winnerIndex);
    
    // Defer clearing the trick until after clients have started the animation
    setTimeout(async () => {
      if (!game.play) return;
      game.play.currentTrick = []; // Clear the trick for proper game state
      
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
          // Human player's turn - they will play when ready
          console.log('[HUMAN TURN] Human player', winnerPlayer.username, 'at index', winnerIndex, 'can now play');
        }
      }
    }, 1000); // 1 second delay to match frontend animation
    
  } catch (error) {
    console.error('[TRICK COMPLETION ERROR] Failed to complete trick:', error);
    throw error;
  } catch (error) {
    console.error('[TRICK COMPLETION ERROR]', error);
  }
}
