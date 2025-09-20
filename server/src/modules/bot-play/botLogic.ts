import type { Game, Card, Suit } from '../../types/game';
import { io } from '../../index';
import { enrichGameForClient } from '../../routes/games/shared/gameUtils';
import { handleTrickCompletion } from '../../lib/hand-completion/trick/trickCompletion';
import { getRegularBid, getWhizBid, getMirrorBid, getSuicideBid, getBid4OrNil } from '../bot-bidding/index';
import { getNilPlay, NilPlayInput } from './nil';
import { getScreamerPlay, getScreamerPlayableCards } from './screamer';
import { getAssassinPlay, getAssassinPlayableCards } from './assassin';
import { getNilCoverPlay, NilCoverPlayInput } from './nil-cover';
import { getCardValue } from '../../lib/hand-completion/utils/cardUtils';

/**
 * Makes a move for a bot player (bid or play card)
 */
export async function botMakeMove(game: Game, seatIndex: number): Promise<void> {
  const bot = game.players[seatIndex];
  if (!bot || bot.type !== 'bot') {
    console.log('[BOT DEBUG] botMakeMove called for non-bot or empty seat:', seatIndex);
    return;
  }

  console.log(`[BOT DEBUG] botMakeMove called for seat ${seatIndex} bot: ${bot.username} game.status: ${game.status}`);

  if (game.status === 'BIDDING') {
    // Bot bidding logic - use proper bidding functions and call handleMakeBid
    if (game.bidding && (game.bidding.bids[seatIndex] === null || typeof game.bidding.bids[seatIndex] === 'undefined')) {
      console.log(`[BOT DEBUG] Bot ${bot.username} is making a bid...`);
      
      // Choose bidding strategy based on game type
      const hand = game.hands[seatIndex] || [];
      const existingBids = game.bidding.bids.slice();
      const bidType = (game as any).rules?.bidType;
      
      let bid, reason;
      if (bidType === 'WHIZ') {
        const result = getWhizBid({ hand, seatIndex, existingBids, game });
        bid = result.bid;
        reason = result.reason;
      } else if (bidType === 'MIRROR') {
        const result = getMirrorBid({ hand, seatIndex, existingBids });
        bid = result.bid;
        reason = result.reason;
      } else if (bidType === 'GIMMICK' && (game as any).rules?.gimmickType === 'SUICIDE') {
        const result = getSuicideBid({ hand, seatIndex, existingBids, dealerIndex: game.dealerIndex });
        bid = result.bid;
        reason = result.reason;
      } else if (bidType === 'GIMMICK' && (game as any).rules?.gimmickType === 'BID_4_OR_NIL') {
        const result = getBid4OrNil({ hand, seatIndex, existingBids });
        bid = result.bid;
        reason = result.reason;
      } else {
        const result = getRegularBid({ hand, seatIndex, existingBids });
        bid = result.bid;
        reason = result.reason;
      }      const finalBid = (!allowNil && bid === 0) ? 1 : bid;
      console.log(`[BOT BIDDING] Heuristic result for ${bot.username}: bid=${bid}, reason=${reason}${!allowNil && bid === 0 ? ' -> adjusted to 1 (nil disabled)' : ''}`);
      
      // Call handleMakeBid to use proper turn management
      const { handleMakeBid } = await import('../socket-handlers/game-play/bidding/bidHandler');
      await handleMakeBid({ emit: () => {}, isAuthenticated: true, userId: bot.id } as any, { gameId: game.id, userId: bot.id, bid: finalBid });
    }
  } else if (game.status === 'PLAYING') {
    // Bot card playing logic
    await botPlayCard(game, seatIndex);
  }
}

/**
 * Sophisticated bot card playing logic
 */
export async function botPlayCard(game: Game, seatIndex: number): Promise<void> {
  const bot = game.players[seatIndex];
  if (!bot || bot.type !== 'bot') {
    console.log('[BOT DEBUG] botPlayCard called for non-bot or empty seat:', seatIndex);
    return;
  }

  if (!game.play) {
    console.log('[BOT DEBUG] Game.play is undefined, cannot play card.');
    return;
  }

  const hand = game.hands[seatIndex] || [];
  const leadSuit = game.play.currentTrick.length > 0 ? game.play.currentTrick[0].suit : null;
  const playableCards = getPlayableCards(hand, leadSuit, game.play.spadesBroken);

  if (playableCards.length === 0) {
    console.log(`[BOT CARD DEBUG] Bot ${bot.username} has no playable cards!`);
    return;
  }

  let card: Card | undefined;
  let reason: string = 'Normal play strategy';

  // Get bot's bid and partner's bid to determine strategy
  const botBid = game.bidding?.bids[seatIndex];
  const partnerIndex = (seatIndex + 2) % 4; // Partner is 2 seats away
  const partnerBid = game.bidding?.bids[partnerIndex];

  // Determine play order for current trick
  const playOrder: number[] = [];
  let currentPlayer = game.play.currentPlayerIndex;
  for (let i = 0; i < 4; i++) {
    playOrder.push(currentPlayer);
    currentPlayer = (currentPlayer + 1) % 4;
  }

  if (botBid === 0) {
    // Bot is nil - use sophisticated nil strategy
    console.log(`[BOT NIL] Bot ${bot.username} is playing nil`);
    const nilInput: NilPlayInput = {
      hand: playableCards,
      currentTrick: game.play.currentTrick,
      leadSuit,
      spadesBroken: game.play.spadesBroken,
      playerIndex: seatIndex,
      isLeading: leadSuit === null,
      playOrder
    };
    const nilResult = getNilPlay(nilInput);
    card = nilResult.selectedCard;
    reason = nilResult.reason;

  } else if (partnerBid === 0) {
    // Partner is nil - use sophisticated nil-cover strategy
    console.log(`[BOT NIL COVER] Bot ${bot.username} covering nil partner`);
    const nilCoverInput: NilCoverPlayInput = {
      hand: playableCards,
      currentTrick: game.play.currentTrick,
      leadSuit,
      spadesBroken: game.play.spadesBroken,
      playerIndex: seatIndex,
      isLeading: leadSuit === null,
      nilPartnerIndex: partnerIndex,
      playOrder
    };
    const nilCoverResult = getNilCoverPlay(nilCoverInput);
    card = nilCoverResult.selectedCard;
    reason = nilCoverResult.reason;

  } else if (game.specialRules?.screamer) {
    // Screamer mode - use screamer logic
    console.log(`[BOT SCREAMER] Bot ${bot.username} using screamer strategy`);
    const screamerResult = getScreamerPlay({
      game,
      hand: playableCards,
      seatIndex,
      currentTrick: game.play.currentTrick,
      isLeading: leadSuit === null
    });
    card = screamerResult.card;
    reason = screamerResult.reason;
  } else if (game.specialRules?.assassin) {
    // Assassin mode - use assassin logic
    console.log(`[BOT ASSASSIN] Bot ${bot.username} using assassin strategy`);
    const assassinResult = getAssassinPlay({
      game,
      hand: playableCards,
      seatIndex,
      currentTrick: game.play.currentTrick,
      isLeading: leadSuit === null
    });
    card = assassinResult.card;
    reason = assassinResult.reason;
  } else {
    // Normal bidding - use existing strategy
    console.log(`[BOT NORMAL] Bot ${bot.username} using normal strategy`);
    card = selectCardToWin(playableCards, game.play.currentTrick, hand, game, seatIndex);
    reason = 'Normal play strategy';
  }

  if (!card) {
    console.log(`[BOT CARD DEBUG] Bot ${bot.username} - no card selected, using first playable card`);
    card = playableCards[0];
    reason = 'Fallback to first playable card';
  }

  console.log(`[BOT CARD DEBUG] Bot ${bot.username} selected card: ${card.rank}${card.suit} - ${reason}`);

  // Play the card
  const cardIndex = hand.findIndex(c => c.suit === card!.suit && c.rank === card!.rank);
  if (cardIndex === -1) {
    console.log(`[BOT CARD DEBUG] Bot ${bot.username} - selected card not found in hand`);
    return;
  }

  hand.splice(cardIndex, 1);
  game.play.currentTrick.push({ ...card!, playerIndex: seatIndex });

  // Set spadesBroken if a spade is played
  if (card!.suit === 'SPADES') {
    game.play.spadesBroken = true;
  }

  console.log(`[BOT DEBUG] Bot ${bot.username} played ${card!.suit} ${card!.rank}`);

  // Emit game update after playing card
  io.to(game.id).emit("game_update", enrichGameForClient(game));

  // Check if trick is complete
  if (game.play.currentTrick.length === 4) {
    await handleTrickCompletion(game);
  } else {
    // Move to next player
    const nextPlayerIndex = (seatIndex + 1) % 4;
    game.play.currentPlayer = game.players[nextPlayerIndex]?.id || '';
    game.play.currentPlayerIndex = nextPlayerIndex;
    
    // Emit game update after turn advancement
    io.to(game.id).emit("game_update", enrichGameForClient(game));
    
    if (game.players[nextPlayerIndex] && game.players[nextPlayerIndex].type === 'bot') {
      setTimeout(() => botPlayCard(game, nextPlayerIndex), 300);
    }
  }
}

function getPlayableCards(hand: Card[], leadSuit: Suit | null, spadesBroken: boolean): Card[] {
  if (!leadSuit) {
    // Leading - cannot lead spades until spades are broken
    if (!spadesBroken) {
      const nonSpades = hand.filter(card => card.suit !== "SPADES");
      if (nonSpades.length > 0) {
        return nonSpades;
      }
    }
    // Spades are broken or only spades left - can play any card
    // Leading - can play any card
    return hand.slice();
  }
  
  // Following - must follow suit if possible
  const suitCards = hand.filter(card => card.suit === leadSuit);
  if (suitCards.length > 0) {
    return suitCards;
  }
  
  // Can't follow suit - can play any card
  return hand.slice();
}

function selectCardToWin(playableCards: Card[], currentTrick: Card[], hand: Card[], game: Game, seatIndex: number): Card {
  // Simple strategy: play highest card in suit, or lowest if trying to avoid winning
  if (playableCards.length === 1) {
    return playableCards[0];
  }
  
  // For now, just play the first playable card
  // TODO: Implement more sophisticated card selection
  return playableCards[0];
}
