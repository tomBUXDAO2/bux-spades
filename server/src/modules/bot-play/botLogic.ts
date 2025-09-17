import type { Game, Card, Suit } from '../../types/game';
import { io } from '../../index';
import { enrichGameForClient } from '../../routes/games/shared/gameUtils';
import { handleTrickComplete } from '../socket-handlers/game-state/trick/trickCompletion';
import { getRegularBid, getWhizBid, getMirrorBid, getSuicideBid, getBidHearts, getBid3, getBid4OrNil, getCrazyAces } from '../bot-bidding/index';
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
      } else if (bidType === 'GIMMICK') {
        const gimmickType = (game as any).rules?.gimmickType;
        if (gimmickType === 'SUICIDE') {
          const result = getSuicideBid({ hand, seatIndex, existingBids, dealerIndex: game.dealerIndex });
          bid = result.bid;
          reason = result.reason;
        } else if (gimmickType === 'BID_HEARTS') {
          const result = getBidHearts({ hand, seatIndex, existingBids });
          bid = result.bid;
          reason = result.reason;
        } else if (gimmickType === 'BID_3') {
          const result = getBid3({ hand, seatIndex, existingBids });
          bid = result.bid;
          reason = result.reason;
        } else if (gimmickType === 'BID_4_OR_NIL') {
          const result = getBid4OrNil({ hand, seatIndex, existingBids });
          bid = result.bid;
          reason = result.reason;
        } else if (gimmickType === 'CRAZY_ACES') {
          const result = getCrazyAces({ hand, seatIndex, existingBids });
          bid = result.bid;
          reason = result.reason;
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
          const result = getRegularBid({ hand, seatIndex, existingBids });
          bid = result.bid;
          reason = result.reason;
        }      } else if (game.specialRules?.screamer) {
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
        const result = getRegularBid({ hand, seatIndex, existingBids });
        bid = result.bid;
        reason = result.reason;
      }
      const allowNil = Boolean((game as any).rules?.allowNil);
      const finalBid = (!allowNil && bid === 0) ? 1 : bid;
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
  const playableCards = getPlayableCards(hand, leadSuit, game.play.spadesBroken, game, seatIndex);

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
  // Use bot-specific card play logic
  await botPlayCardDirect(game, seatIndex, card!);
  return;}

function getPlayableCards(hand: Card[], leadSuit: Suit | null, spadesBroken: boolean): Card[] {
  if (!leadSuit) {
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

/**
 * Direct card play for bots (without socket dependency)
 */
async function botPlayCardDirect(game: Game, playerIndex: number, card: Card): Promise<void> {
  const bot = game.players[playerIndex];
  if (!bot || bot.type !== 'bot') {
    console.log('[BOT CARD DEBUG] botPlayCardDirect called for non-bot player');
    return;
  }

  console.log(`[BOT CARD DEBUG] Bot ${bot.username} playing card: ${card.rank}${card.suit}`);

  // Validate card can be played
  const hand = game.hands[playerIndex];
  if (!hand || !hand.some(c => c.suit === card.suit && c.rank === card.rank)) {
    console.log(`[BOT CARD DEBUG] Card ${card.rank}${card.suit} not in bot's hand`);
    return;
  }

  // Enforce leading spades rule
  const isLeading = game.play.currentTrick.length === 0;
  if (isLeading && card.suit === 'SPADES' && !game.play.spadesBroken) {
    const onlySpadesLeft = hand.every(c => c.suit === 'SPADES');
    if (!onlySpadesLeft) {
      console.log(`[BOT CARD DEBUG] Bot cannot lead spades, selecting different card`);
      // Select a non-spade card
      const nonSpadeCard = hand.find(c => c.suit !== 'SPADES');
      if (nonSpadeCard) {
        return botPlayCardDirect(game, playerIndex, nonSpadeCard);
      }
    }
  }

  // Remove card from hand
  const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
  hand.splice(cardIndex, 1);

  // Add to current trick
  game.play.currentTrick.push({ ...card, playerIndex });
  
  console.log(`[BOT CARD DEBUG] Card played: ${card.rank}${card.suit}, trick length: ${game.play.currentTrick.length}`);

  // Break spades if a spade is played on a non-spade lead
  if (game.play.currentTrick.length > 0) {
    const leadSuit = game.play.currentTrick[0].suit;
    if (!game.play.spadesBroken && card.suit === 'SPADES' && leadSuit !== 'SPADES') {
      game.play.spadesBroken = true;
      console.log('[RULES] Spades are now broken');
    }
  }

  // Emit card played event
  io.to(game.id).emit('card_played', {
    gameId: game.id,
    playerId: bot.id,
    card: card,
  });

  // Check if trick is complete
  if (game.play.currentTrick.length === 4) {
    await handleTrickComplete(game);
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
    // Move to next player
    const nextPlayerIndex = (playerIndex + 1) % 4;
    game.play.currentPlayerIndex = nextPlayerIndex;
    game.play.currentPlayer = game.players[nextPlayerIndex]?.id ?? '';
    
    io.to(game.id).emit('game_update', enrichGameForClient(game));
    
    // If next player is bot, trigger their move
    if (game.players[nextPlayerIndex] && game.players[nextPlayerIndex].type === 'bot') {
      setTimeout(() => botMakeMove(game, nextPlayerIndex), 1000);
    }
  }
}
