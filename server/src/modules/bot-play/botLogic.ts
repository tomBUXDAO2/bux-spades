import type { Game } from '../../types/game';
import { handleTrickCompletion } from '../../lib/hand-completion/trick/trickCompletion';
import { io } from '../../index';
import { enrichGameForClient } from '../../routes/games/shared/gameUtils';

/**
 * Bot logic for playing cards
 */
export async function playBotCard(game: Game, seatIndex: number): Promise<void> {
  try {
    console.log(`[BOT LOGIC] Bot ${seatIndex} playing card in game ${game.id}`);
    
    if (!game.players[seatIndex] || game.players[seatIndex]?.type !== 'bot') {
      console.log(`[BOT LOGIC] Seat ${seatIndex} is not a bot or doesn't exist`);
      return;
    }

    const bot = game.players[seatIndex];
    if (!bot || !bot.hand || bot.hand.length === 0) {
      console.log(`[BOT LOGIC] Bot ${seatIndex} has no cards to play`);
      return;
    }

    // Simple bot logic: play first available card
    const cardToPlay = bot.hand[0];
    bot.hand = bot.hand.slice(1);

    // Add card to current trick
    if (!game.play) {
      game.play = {
        currentPlayer: '',
        currentPlayerIndex: 0,
        currentTrick: [],
        leadSuit: undefined,
        tricks: [],
        trickNumber: 0,
        spadesBroken: false
      };
    }

    game.play.currentTrick.push({
      ...cardToPlay,
      playedBy: bot.id,
      playerIndex: seatIndex
    });

    console.log(`[BOT LOGIC] Bot ${seatIndex} played card:`, cardToPlay);

    // Check if trick is complete
    if (game.play.currentTrick.length === 4) {
      await handleTrickCompletion(game, game.play.currentTrick[0].playedBy || '', game.play.currentTrick[0].playedBy || '');
    } else {
      // Move to next player
      const nextPlayerIndex = (seatIndex + 1) % 4;
      game.play.currentPlayer = game.players[nextPlayerIndex]?.id || '';
      game.play.currentPlayerIndex = nextPlayerIndex;
      
      // Emit game update after turn advancement
      io.to(game.id).emit('game_update', enrichGameForClient(game));
      
      // Schedule next bot turn if needed
      if (game.players[nextPlayerIndex]?.type === 'bot') {
        setTimeout(() => {
          playBotCard(game, nextPlayerIndex);
        }, 1000);
      }
    }

  } catch (error) {
    console.error(`[BOT LOGIC] Error in bot card play:`, error);
  }
}

/**
 * Bot logic for bidding
 */
export async function playBotBid(game: Game, seatIndex: number): Promise<void> {
  try {
    console.log(`[BOT LOGIC] Bot ${seatIndex} making bid in game ${game.id}`);
    
    if (!game.players[seatIndex] || game.players[seatIndex]?.type !== 'bot') {
      console.log(`[BOT LOGIC] Seat ${seatIndex} is not a bot or doesn't exist`);
      return;
    }

    const bot = game.players[seatIndex];
    if (!bot) {
      console.log(`[BOT LOGIC] Bot ${seatIndex} doesn't exist`);
      return;
    }

    // Simple bot logic: bid 2
    const bid = 2;
    bot.bid = bid;

    console.log(`[BOT LOGIC] Bot ${seatIndex} bid:`, bid);

    // Move to next player
    const nextPlayerIndex = (seatIndex + 1) % 4;
    if (game.bidding) {
      game.bidding.currentBidderIndex = nextPlayerIndex;
      game.bidding.currentPlayer = game.players[nextPlayerIndex]?.id || '';
    }

    // Emit game update
    io.to(game.id).emit('game_update', enrichGameForClient(game));

    // Schedule next bot turn if needed
    if (game.players[nextPlayerIndex]?.type === 'bot') {
      setTimeout(() => {
        playBotBid(game, nextPlayerIndex);
      }, 1000);
    }

  } catch (error) {
    console.error(`[BOT LOGIC] Error in bot bid:`, error);
  }
}

/**
 * Handle bot timeout
 */
export async function handleBotTimeout(game: Game, seatIndex: number, phase: string): Promise<void> {
  try {
    console.log(`[BOT LOGIC] Handling bot timeout for seat ${seatIndex} in phase ${phase}`);
    
    if (phase === 'bidding') {
      await playBotBid(game, seatIndex);
    } else if (phase === 'playing') {
      await playBotCard(game, seatIndex);
    }

  } catch (error) {
    console.error(`[BOT LOGIC] Error handling bot timeout:`, error);
  }
}

/**
 * Bot make move (alias for handleBotTimeout)
 */
export async function botMakeMove(game: Game, seatIndex: number, phase: string): Promise<void> {
  return await handleBotTimeout(game, seatIndex, phase);
}

/**
 * Bot play card (alias for playBotCard)
 */
export async function botPlayCard(game: Game, seatIndex: number): Promise<void> {
  return await playBotCard(game, seatIndex);
}

/**
 * Get assassin playable cards (placeholder)
 */
export function getAssassinPlayableCards(hand: any[], leadSuit?: string): any[] {
  // Placeholder implementation
  return hand.filter((card: any) => {
    if (!leadSuit) return true;
    return card.suit === leadSuit;
  });
}

/**
 * Get screamer playable cards (placeholder)
 */
export function getScreamerPlayableCards(hand: any[], leadSuit?: string): any[] {
  // Placeholder implementation
  return hand.filter((card: any) => {
    if (!leadSuit) return true;
    return card.suit === leadSuit;
  });
}
