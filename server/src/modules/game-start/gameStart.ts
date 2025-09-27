import { io } from '../../index';
import { enrichGameForClient } from '../../routes/games/shared/gameUtils';
import { botMakeMove } from '../bot-play/botLogic';
import { handleBiddingComplete } from '../socket-handlers/game-state/gameStateHandler';
import type { Game } from '../../types/game';

/**
 * Start a game - deal cards and begin bidding
 */
export async function startGame(game: Game): Promise<void> {
  try {
    console.log('[GAME START] Starting game:', game.id);
    
    // Update game status
    game.status = 'BIDDING';
    
    // Deal cards to all players
    const { dealCards } = await import('../dealing/cardDealing');
    // Fix: Pass both required arguments to dealCards
    const hands = dealCards(game.players, game.dealerIndex || 0);
    game.hands = hands;
    
    // Set up bidding state
    if (!game.bidding) {
      game.bidding = {
        currentPlayer: '',
        currentBidderIndex: -1,
        bids: [null, null, null, null],
        nilBids: {}
      };
    }
    
    // Set up play state
    if (!game.play) {
      game.play = {
        currentPlayer: '',
        currentPlayerIndex: -1,
        currentTrick: [],
        tricks: [],
        trickNumber: 1,
        spadesBroken: false
      };
    }
    
    // Determine dealer and first bidder
    const dealerIndex = game.dealerIndex || 0;
    const firstBidderIndex = (dealerIndex + 1) % 4;
    
    // Set current bidder
    game.bidding.currentBidderIndex = firstBidderIndex;
    game.bidding.currentPlayer = game.players[firstBidderIndex]?.id || '';
    game.currentPlayer = game.players[firstBidderIndex]?.id || '';
    
    // Emit game update
    io.to(game.id).emit('game_update', enrichGameForClient(game));

    // MIRROR: Auto-bid for all seats, then immediately complete bidding
    if ((game as any).rules?.bidType === 'MIRROR') {
      console.log('[GAME START][MIRROR] Auto-bidding for all players based on spade counts');
      for (let i = 0; i < 4; i++) {
        const hand = game.hands[i] || [];
        const spades = hand.filter((c: any) => c.suit === 'SPADES').length;
        const bid = spades === 0 ? 0 : spades;
        game.bidding.bids[i] = bid;
        if (game.players[i]) {
          game.players[i]!.bid = bid;
        }
      }
      // Broadcast updated bids before moving to play
      io.to(game.id).emit('game_update', enrichGameForClient(game));
      await handleBiddingComplete(game);
      io.to(game.id).emit('game_update', enrichGameForClient(game));
      return; // Do not proceed with per-turn bidding scheduling
    }

    // If first to bid is a bot, trigger bot move shortly after so UI can render dealing/animation
    const firstBidderPlayer = game.players[firstBidderIndex];
    if (firstBidderPlayer && firstBidderPlayer.type === 'bot') {
      console.log('[GAME START] First bidder is a bot; triggering bot bid');
      setTimeout(() => botMakeMove(game, firstBidderIndex, 'bidding'), 150);
    }

  } catch (error) {
    console.error("[GAME START] Error starting game:", error);
  }
}
