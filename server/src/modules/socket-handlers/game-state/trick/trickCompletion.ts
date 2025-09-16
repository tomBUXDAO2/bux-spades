import type { Game } from '../../../../types/game';
import { io } from '../../../../index';
import { enrichGameForClient } from '../../../../routes/games/shared/gameUtils';
import { botPlayCard } from '../../../bot-play/botLogic';
import { trickLogger } from "../../../../lib/trick-logging";
import { getCardValue } from '../utils/cardUtils';

/**
 * Handles trick completion
 */
export async function handleTrickComplete(game: Game): Promise<void> {
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
  
  const winnerPlayerIndex = trick[winnerIndex].playerIndex;
  const winnerPlayer = game.players[winnerPlayerIndex];
  
  console.log('[TRICK COMPLETE] Winner:', winnerPlayer?.username, 'at index:', winnerPlayerIndex);
  
  // Update player trick count
  if (winnerPlayer) {
    winnerPlayer.tricks = (winnerPlayer.tricks || 0) + 1;
    
    // Update PlayerTrickCount in database
    if (game.dbGameId) {
      try {
        const { updatePlayerTrickCount } = await import('../../../../lib/database-scoring/trick-count/trickCountManager');
        let userId = winnerPlayer.id;
        if (winnerPlayer.type === 'bot') {
          userId = winnerPlayer.id;
        }
        await updatePlayerTrickCount(game.dbGameId, game.currentRound, userId, winnerPlayer.tricks);
        console.log('[TRICK COMPLETE] Updated PlayerTrickCount for', winnerPlayer.username, ':', winnerPlayer.tricks);
      } catch (error) {
        console.error('[TRICK COMPLETE] Failed to update PlayerTrickCount:', error);
      }
    }
  }
  
  // Store trick
  game.play.tricks.push({
    cards: [...trick],
    winnerIndex: winnerPlayerIndex,
    // winnerId: winnerPlayer?.id || '',
    // trickNumber: game.play.trickNumber
  });
  
  // Log trick to database
  try {
    await trickLogger.logTrickFromGame(game, game.play.trickNumber + 1);
  } catch (err) {
    console.error('Failed to log trick to database:', err);
  }
  
  // Check if hand is complete
  if (game.play.trickNumber >= 12) {
    console.log('[TRICK COMPLETE] Hand complete, triggering hand completion');
    const { handleHandCompletion } = await import('../../../../lib/hand-completion/hand/handCompletion');
    await handleHandCompletion(game);
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
