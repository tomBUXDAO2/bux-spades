import type { Game } from "../../types/game";
import { io } from "../../index";
import { enrichGameForClient } from "../../routes/games/shared/gameUtils";
import prisma from "../../lib/prisma";
import { getCardValue } from "../../lib/hand-completion/utils/cardUtils";

const BOT_USER_ID = 'bot-user-universal';

/**
 * Get the database user ID for a bot player
 */
function getBotDbUserId(player: any): string {
  return player.id;
}

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
    // Bot bidding logic
    if (game.bidding && (game.bidding.bids[seatIndex] === null || typeof game.bidding.bids[seatIndex] === 'undefined')) {
      console.log(`[BOT DEBUG] Bot ${bot.username} is making a bid...`);
      
      // Simple bot bidding: random bid between 0-4
      const bid = Math.floor(Math.random() * 5);
      game.bidding.bids[seatIndex] = bid;
      console.log(`[BOT DEBUG] Bot ${bot.username} bid ${bid}`);

      // Persist RoundBid using universal bot user ID - FIXED VERSION
      if (game.dbGameId) {
        try {
          console.log('[BOT BIDDING] Bot', bot.username, 'logging bid', bid, 'to database');
          let roundNumber = game.currentRound || 1;
          let roundRecord = await prisma.round.findFirst({ where: { gameId: game.dbGameId, roundNumber } });
          if (!roundRecord) {
            console.log('[BOT BIDDING] Creating new round record for game', game.dbGameId, 'round', roundNumber);
            roundRecord = await prisma.round.create({
              data: {
                id: `round_${game.dbGameId}_${roundNumber}_${Date.now()}`,
                gameId: game.dbGameId,
                roundNumber,
                createdAt: new Date(),
                updatedAt: new Date()
              }
            });
          }
          
          const botUserId = getBotDbUserId(bot);
          console.log('[BOT BIDDING] Upserting bid for bot', bot.username, 'with userId', botUserId);
          
          const result = await prisma.roundBid.upsert({
            where: {
              roundId_playerId: {
                roundId: roundRecord.id,
                playerId: botUserId
              }
            },
            update: { bid, isBlindNil: bid === -1 },
            create: {
              id: `bid_${roundRecord.id}_${seatIndex}_${Date.now()}`,
              roundId: roundRecord.id,
              playerId: botUserId,
              bid,
              isBlindNil: bid === -1,
              createdAt: new Date()
            }
          });
          console.log('[BOT BIDDING] SUCCESS: Logged bid for bot', bot.username, 'bid:', bid, 'result:', result.id);
        } catch (err) {
          console.error('[BOT BIDDING ERROR] Failed to persist RoundBid for bot', bot.username, ':', err);
          // Don't throw - continue with game flow
        }
      } else {
        console.log('[BOT BIDDING ERROR] No dbGameId for bot', bot.username);
      }
      
      // Emit game update to frontend
      io.to(game.id).emit("game_update", enrichGameForClient(game));      
      // Find next player who hasn't bid
      let next = (seatIndex + 1) % 4;
      while (next !== seatIndex && game.bidding.bids[next] !== null && game.bidding.bids[next] !== undefined) {
        next = (next + 1) % 4;
      }
      
      if (next === seatIndex) {
        // All players have bid, use the centralized bidding completion handler
        const { handleBiddingComplete } = await import("../socket-handlers/game-state/bidding/biddingCompletion");
        await handleBiddingComplete(game);
      } else {
        // Move to next player
        game.bidding.currentBidderIndex = next;
        game.bidding.currentPlayer = game.players[next]?.id || '';
        
        // Emit game update when moving to next bidder
        io.to(game.id).emit("game_update", enrichGameForClient(game));        
        if (game.players[next] && game.players[next].type === 'bot') {
          setTimeout(() => botMakeMove(game, next), 1000);
        }
      }
    }
  } else if (game.status === 'PLAYING') {
    // Bot card playing logic - use sophisticated logic
    await botPlayCard(game, seatIndex);
  }
}

/**
 * Sophisticated bot card playing logic
 */
export async function botPlayCard(game: Game, seatIndex: number): Promise<void> {
  const bot = game.players[seatIndex];
  if (!bot || bot.type !== 'bot' || !game.hands || !game.play) return;
  
  // Guard: Make sure it's actually this bot's turn
  if (game.play.currentPlayerIndex !== seatIndex) {
    console.log('[BOT GUARD] Bot', bot.username, 'at seat', seatIndex, 'tried to play but current player is', game.play.currentPlayerIndex);
    return;
  }
  
  const hand = game.hands[seatIndex]!;
  if (!hand || hand.length === 0) return;
  
  // Determine lead suit for this trick
  const leadSuit = game.play.currentTrick.length > 0 ? game.play.currentTrick[0].suit : null;
  
  // Find playable cards with special rules consideration
  let playableCards: any[] = [];
  const specialRules = game.rules?.specialRules;
  
  console.log(`[BOT CARD DEBUG] Bot ${bot.username} at seat ${seatIndex} - leadSuit:`, leadSuit);
  console.log(`[BOT CARD DEBUG] Bot ${bot.username} hand:`, hand.map(c => `${c.rank}${c.suit}`));
  
  if (leadSuit) {
    // Following suit - must follow lead suit if possible
    playableCards = hand.filter(c => c.suit === leadSuit);
    if (playableCards.length === 0) {
      // Void in lead suit - can play any card
      playableCards = hand;
      console.log(`[BOT CARD DEBUG] Bot ${bot.username} - void in lead suit, can play anything:`, playableCards.map(c => `${c.rank}${c.suit}`));
    } else {
      console.log(`[BOT CARD DEBUG] Bot ${bot.username} - must follow suit:`, playableCards.map(c => `${c.rank}${c.suit}`));
    }
  } else {
    // Bot is leading - cannot lead spades unless spades broken or only spades left
    if (game.play.spadesBroken || hand.every(c => c.suit === 'SPADES')) {
      playableCards = hand; // Can lead any card
      console.log(`[BOT CARD DEBUG] Bot ${bot.username} - leading: spades broken or only spades, can lead anything:`, playableCards.map(c => `${c.rank}${c.suit}`));
    } else {
      // Cannot lead spades unless only spades left
      playableCards = hand.filter(c => c.suit !== 'SPADES');
      if (playableCards.length === 0) {
        playableCards = hand; // Only spades left, must lead spades
      }
      console.log(`[BOT CARD DEBUG] Bot ${bot.username} - leading: cannot lead spades, using non-spades:`, playableCards.map(c => `${c.rank}${c.suit}`));
    }
  }
  
  console.log(`[BOT CARD DEBUG] Bot ${bot.username} final playableCards:`, playableCards.map(c => `${c.rank}${c.suit}`));
  
  // Smart bot card selection
  let card: any;
  
  // Get bot's bid and partner's bid to determine strategy
  const botBid = game.bidding?.bids[seatIndex];
  const partnerIndex = (seatIndex + 2) % 4; // Partner is 2 seats away
  const partnerBid = game.bidding?.bids[partnerIndex];
  
  if (botBid === 0) {
    // Bot is nil - try to avoid winning tricks
    card = selectCardForNil(playableCards, game.play.currentTrick, hand);
  } else if (partnerBid === 0) {
    // Partner is nil - try to cover partner
    card = selectCardToCoverPartner(playableCards, game.play.currentTrick, hand, game.hands[partnerIndex] || [], game, seatIndex);
  } else {
    // Normal bidding - play to win
    card = selectCardToWin(playableCards, game.play.currentTrick, hand, game, seatIndex);
  }
  
  if (!card) {
    console.log(`[BOT CARD DEBUG] Bot ${bot.username} - no card selected, using first playable card`);
    card = playableCards[0];
  }
  
  console.log(`[BOT CARD DEBUG] Bot ${bot.username} selected card:`, `${card.rank}${card.suit}`);
  
  // Play the card
  const cardIndex = hand.findIndex(c => c.suit === card.suit && c.rank === card.rank);
  if (cardIndex === -1) {
    console.log(`[BOT CARD DEBUG] Bot ${bot.username} - selected card not found in hand`);
    return;
  }
  
  hand.splice(cardIndex, 1);
  game.play.currentTrick.push({ ...card, playerIndex: seatIndex });
  
  // Set spadesBroken if a spade is played
  if (card.suit === 'SPADES') {
    game.play.spadesBroken = true;
  }
  
  console.log(`[BOT DEBUG] Bot ${bot.username} played ${card.suit} ${card.rank}`);
  
  // Emit game update after playing card
  io.to(game.id).emit("game_update", enrichGameForClient(game));
  
  // Check if trick is complete
  if (game.play.currentTrick.length === 4) {
    // Use the centralized trick completion handler
    const { handleTrickComplete } = await import("../socket-handlers/game-state/trick/trickCompletion");
    await handleTrickComplete(game);
  } else {
    // Move to next player
    const nextPlayerIndex = (seatIndex + 1) % 4;
    game.play.currentPlayer = game.players[nextPlayerIndex]?.id || '';
    game.play.currentPlayerIndex = nextPlayerIndex;
    
    // Emit game update after turn advancement
    io.to(game.id).emit("game_update", enrichGameForClient(game));
    
    if (game.players[nextPlayerIndex] && game.players[nextPlayerIndex].type === 'bot') {
      setTimeout(() => botPlayCard(game, nextPlayerIndex), 1000);
    }
  }
}

/**
 * Select card for nil players (try to avoid winning tricks)
 */
function selectCardForNil(playableCards: any[], currentTrick: any[], hand: any[]): any {
  if (currentTrick.length === 0) {
    // Leading - play lowest card possible
    return playableCards.reduce((lowest, card) => 
      getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
    );
  }
  
  // Following - try to play highest card under the current highest
  const leadSuit = currentTrick[0].suit;
  const highestOnTable = currentTrick.reduce((highest, card) => 
    getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
  );
  
  const cardsOfLeadSuit = playableCards.filter(c => c.suit === leadSuit);
  if (cardsOfLeadSuit.length > 0) {
    // Must follow suit - play highest card under the highest on table
    const cardsUnderHighest = cardsOfLeadSuit.filter(c => 
      getCardValue(c.rank) < getCardValue(highestOnTable.rank)
    );
    
    if (cardsUnderHighest.length > 0) {
      // Play highest card under the highest on table
      return cardsUnderHighest.reduce((highest, card) => 
        getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
      );
    } else {
      // All cards are higher - play the lowest
      return cardsOfLeadSuit.reduce((lowest, card) => 
        getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
      );
    }
  } else {
    // Void in lead suit - discard highest cards in other suits (not spades)
    const nonSpades = playableCards.filter(c => c.suit !== 'SPADES');
    if (nonSpades.length > 0) {
      // Discard highest non-spade
      return nonSpades.reduce((highest, card) => 
        getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
      );
    } else {
      // Only spades left - play lowest spade
      return playableCards.reduce((lowest, card) => 
        getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
      );
    }
  }
}

/**
 * Select card to cover partner (when partner is nil)
 */
function selectCardToCoverPartner(playableCards: any[], currentTrick: any[], hand: any[], partnerHand: any[], game: Game, seatIndex: number): any {
  // Simplified logic - play to win if partner might lose
  return selectCardToWin(playableCards, currentTrick, hand, game, seatIndex);
}

/**
 * Select card to win (normal bidding strategy)
 */
function selectCardToWin(playableCards: any[], currentTrick: any[], hand: any[], game: Game, seatIndex: number): any {
  if (currentTrick.length === 0) {
    // Leading - play highest card
    return playableCards.reduce((highest, card) => 
      getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
    );
  } else {
    // Following
    const leadSuit = currentTrick[0].suit;
    const highestOnTable = currentTrick.reduce((highest, card) => 
      getCardValue(card.rank) > getCardValue(highest.rank) ? card : highest
    );
    
    const cardsOfLeadSuit = playableCards.filter(c => c.suit === leadSuit);
    
    if (cardsOfLeadSuit.length > 0) {
      // Must follow suit
      const winningCards = cardsOfLeadSuit.filter(c => 
        getCardValue(c.rank) > getCardValue(highestOnTable.rank)
      );
      
      if (winningCards.length > 0) {
        // Can win - play lowest winning card
        return winningCards.reduce((lowest, card) => 
          getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
        );
      } else {
        // Can't win - play lowest card
        return cardsOfLeadSuit.reduce((lowest, card) => 
          getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
        );
      }
    } else {
      // Void in lead suit - can play any card
      // Play lowest spade if available, otherwise lowest card
      const spades = playableCards.filter(c => c.suit === 'SPADES');
      if (spades.length > 0) {
        return spades.reduce((lowest, card) => 
          getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
        );
      } else {
        return playableCards.reduce((lowest, card) => 
          getCardValue(card.rank) < getCardValue(lowest.rank) ? card : lowest
        );
      }
    }
  }
}
