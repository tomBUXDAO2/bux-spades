// @ts-nocheck
import type { Game } from '../../types/game';
import { handleTrickCompletion } from '../../lib/hand-completion/trick/trickCompletion';
import { enrichGameForClient } from '../../routes/games/shared/gameUtils';
import { clearTurnTimeout } from '../timeout-management/core/timeoutManager';

/**
 * Get numeric value of a card rank for comparison
 */
function getCardValue(rank: string): number {
  const values: { [key: string]: number } = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  return values[rank] || 0;
}

/**
 * Makes a move for a bot player (bid or play card)
 */
export async function botMakeMove(game: Game, seatIndex: number, action: 'bidding' | 'playing', io?: any): Promise<void> {
  const bot = game.players[seatIndex];
  if (!bot || bot.type !== 'bot') {
    console.log('[BOT DEBUG] botMakeMove called for non-bot or empty seat:', seatIndex);
    return;
  }

  console.log(`[BOT DEBUG] botMakeMove called for seat ${seatIndex} bot: ${bot.username} game.status: ${game.status} action: ${action}`);

  if (action === 'bidding') {
    await playBotBid(game, seatIndex, io);
  } else if (action === 'playing') {
    await playBotCard(game, seatIndex, io);
  }
}

/**
 * Bot logic for playing cards
 */
export async function playBotCard(game: Game, seatIndex: number, io?: any): Promise<void> {
  try {
    console.log(`[BOT LOGIC] Bot ${seatIndex} playing card in game ${game.id}`);
    console.log(`[BOT LOGIC] IO parameter:`, io ? 'available' : 'undefined');
    
    if (!game.players[seatIndex] || game.players[seatIndex]?.type !== 'bot') {
      console.log(`[BOT LOGIC] Seat ${seatIndex} is not a bot or doesn't exist`);
      return;
    }

    const bot = game.players[seatIndex];
    if (!bot) {
      console.log(`[BOT LOGIC] Bot at seat ${seatIndex} not found`);
      return;
    }

    // Get bot's hand from game.hands array
    const botHand = game.hands?.[seatIndex] || [];
    if (botHand.length === 0) {
      console.log(`[BOT LOGIC] Bot ${seatIndex} has no cards to play - hands:`, game.hands);
      return;
    }

    // Smart bot logic: follow suit if possible, otherwise play any card
    let cardToPlay: { suit: string; rank: string };
    let remainingHand: { suit: string; rank: string }[];
    
    // Check if there's a lead suit to follow
    const leadSuit = game.play.currentTrick.length > 0 ? game.play.currentTrick[0].suit : null;
    
    if (leadSuit) {
      // Try to follow suit
      const suitCards = botHand.filter(card => card.suit === leadSuit);
      if (suitCards.length > 0) {
        // Follow suit - play the lowest card of the lead suit
        cardToPlay = suitCards.reduce((lowest, current) => {
          const currentValue = getCardValue(current.rank);
          const lowestValue = getCardValue(lowest.rank);
          return currentValue < lowestValue ? current : lowest;
        });
        remainingHand = botHand.filter(card => !(card.suit === cardToPlay.suit && card.rank === cardToPlay.rank));
        console.log(`[BOT LOGIC] Bot ${seatIndex} following suit ${leadSuit} with ${cardToPlay.rank}${cardToPlay.suit}`);
      } else {
        // Can't follow suit - play any card (prefer spades if broken)
        cardToPlay = botHand[0];
        remainingHand = botHand.slice(1);
        console.log(`[BOT LOGIC] Bot ${seatIndex} cannot follow suit ${leadSuit}, playing ${cardToPlay.rank}${cardToPlay.suit}`);
      }
    } else {
      // First card of trick - do NOT lead spades unless broken or only spades left
      const spadesBroken = !!game.play.spadesBroken;
      const nonSpades = botHand.filter(c => c.suit !== 'SPADES');
      if (!spadesBroken && nonSpades.length > 0) {
        // Lead lowest non-spade
        cardToPlay = nonSpades.reduce((lowest, current) => {
          const currentValue = getCardValue(current.rank);
          const lowestValue = getCardValue(lowest.rank);
          return currentValue < lowestValue ? current : lowest;
        });
      } else {
        // Either spades are broken or only spades remain - lead lowest spade
        const candidates = spadesBroken ? botHand : botHand.filter(c => c.suit === 'SPADES');
        cardToPlay = candidates.reduce((lowest, current) => {
          const currentValue = getCardValue(current.rank);
          const lowestValue = getCardValue(lowest.rank);
          return currentValue < lowestValue ? current : lowest;
        });
      }
      remainingHand = botHand.filter(card => !(card.suit === cardToPlay.suit && card.rank === cardToPlay.rank));
      console.log(`[BOT LOGIC] Bot ${seatIndex} leading with ${cardToPlay.rank}${cardToPlay.suit} (spadesBroken=${spadesBroken})`);
    }
    
    game.hands[seatIndex] = remainingHand;

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
    
    // Remove card from bot's hand
    if (game.hands && game.hands[seatIndex]) {
      game.hands[seatIndex] = game.hands[seatIndex].filter(
        (handCard: any) => !(handCard.suit === cardToPlay.suit && handCard.rank === cardToPlay.rank)
      );
      
      // Also update the bot's individual hand for consistency
      if (game.players[seatIndex]) {
        game.players[seatIndex]!.hand = game.hands[seatIndex];
      }
    }
    
    // Break spades if a spade is played on a non-spade lead
    if (game.play.currentTrick.length > 0) {
      const leadSuit = game.play.currentTrick[0].suit;
      if (!game.play.spadesBroken && cardToPlay.suit === 'SPADES' && leadSuit !== 'SPADES') {
        game.play.spadesBroken = true;
        console.log('[BOT LOGIC] Spades are now broken');
      }
    }

    console.log(`[BOT LOGIC] Bot ${seatIndex} played card:`, cardToPlay);

    // Clear the timeout since the bot has made their move
    clearTurnTimeout(game.id);
    console.log(`[BOT LOGIC] Cleared timeout for game ${game.id}`);

    // Store the bot's played card in the database
    try {
      const { prisma } = await import('../../lib/prisma');
      
      // Get the current round for this game
      const currentRound = await prisma.round.findFirst({
        where: { gameId: game.id },
        orderBy: { roundNumber: 'desc' }
      });
      
      if (currentRound) {
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
              leadSeatIndex: seatIndex,
              winningSeatIndex: seatIndex // Will be updated when trick is complete
            }
          });
          trickId = newTrick.id;
          console.log(`[BOT LOGIC] Created new trick ${trickId} for round ${currentRound.id}`);
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
                leadSeatIndex: seatIndex,
                winningSeatIndex: seatIndex // Will be updated when trick is complete
              }
            });
            trickId = newTrick.id;
            console.log(`[BOT LOGIC] Created new trick ${trickId} for round ${currentRound.id}`);
          } else {
            // Use existing trick
            trickId = currentTrick.id;
          }
        }
        
        // Get the current trick's cards to determine play order
        const currentTrickCards = await prisma.trickCard.findMany({
          where: { trickId: trickId }
        });

        await prisma.trickCard.create({
          data: {
            id: `trickcard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            trickId: trickId,
            seatIndex: seatIndex,
            suit: cardToPlay.suit,
            rank: cardToPlay.rank,
            playOrder: currentTrickCards.length + 1 // Current position in trick
          }
        });
        console.log(`[BOT LOGIC] Stored bot card ${cardToPlay.suit}${cardToPlay.rank} in database`);
      } else {
        console.log(`[BOT LOGIC] No current round found for bot card storage`);
      }
    } catch (dbError) {
      console.error(`[BOT LOGIC] Error storing bot card in database:`, dbError);
    }

    // Always emit game update to show the played card, regardless of database success
    if (io) {
      console.log(`[BOT LOGIC] Emitting game_update for bot ${seatIndex} card play`);
      io.to(game.id).emit('game_update', enrichGameForClient(game));
    } else {
      console.log(`[BOT LOGIC] No IO available for bot ${seatIndex} card play`);
    }

    // Check if trick is complete
    if (game.play.currentTrick.length === 4) {
      console.log('[BOT LOGIC] Trick complete, triggering trick completion');
      const { handleTrickCompletion } = await import('../../lib/hand-completion/trick/trickCompletion');
      await handleTrickCompletion(game, game.play.currentTrick[0].playedBy || '', game.play.currentTrick[0].playedBy || '');
    } else {
    // Move to next player
    const nextPlayerIndex = (seatIndex + 1) % 4;
    game.play.currentPlayer = game.players[nextPlayerIndex]?.id || '';
    game.play.currentPlayerIndex = nextPlayerIndex;
    (game as any).currentPlayer = game.play.currentPlayer;
      
      // Schedule next bot turn if needed
      if (game.players[nextPlayerIndex]?.type === 'bot') {
        setTimeout(() => {
          playBotCard(game, nextPlayerIndex, io);
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
export async function playBotBid(game: Game, seatIndex: number, io?: any): Promise<void> {
  try {
    console.log(`[BOT LOGIC] Bot ${seatIndex} making bid in game ${game.id}`);
    console.log(`[BOT LOGIC] io parameter:`, io ? 'available' : 'undefined');
    
    if (!game.players[seatIndex] || game.players[seatIndex]?.type !== 'bot') {
      console.log(`[BOT LOGIC] Seat ${seatIndex} is not a bot or doesn't exist`);
      return;
    }

    const bot = game.players[seatIndex];
    if (!bot) {
      console.log(`[BOT LOGIC] Bot ${seatIndex} doesn't exist`);
      return;
    }

    // Use sophisticated bot bidding logic
    const hand = game.hands[seatIndex] || [];
    const existingBids = game.bidding?.bids || [null, null, null, null];
    const bidType = (game as any).rules?.bidType || 'REGULAR';
    
    let bid: number;
    let reason: string;
    
    try {
      // Import bot bidding modules
      const { getRegularBid, getWhizBid, getMirrorBid, getSuicideBid } = await import('../bot-bidding');
      
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
      } else {
        // Default to regular bidding
        const result = getRegularBid({ hand, seatIndex, existingBids });
        bid = result.bid;
        reason = result.reason;
      }
      
      // Ensure bid is valid (0-13)
      bid = Math.max(0, Math.min(13, bid));
      
      console.log(`[BOT LOGIC] Bot ${bot.username} (seat ${seatIndex}) bid: ${bid} (${reason})`);
      
    } catch (bidError) {
      console.error(`[BOT LOGIC] Error calculating bid, using fallback:`, bidError);
      bid = 2; // Fallback bid
      reason = 'fallback';
    }

    // Update bot's bid in memory
    bot.bid = bid;
    
    // Update game bidding state
    if (game.bidding) {
      game.bidding.bids[seatIndex] = bid;
    }

    // Store bot bid in database
    try {
      const { prisma } = await import('../../lib/prisma');
      
      // First, get the current round for this game
      const currentRound = await prisma.round.findFirst({
        where: { gameId: game.id },
        orderBy: { roundNumber: 'desc' }
      });
      
      if (currentRound) {
        // Store the bid in RoundBid table using upsert to handle duplicates
        await prisma.roundBid.upsert({
          where: { 
            roundId_userId: { 
              roundId: currentRound.id, 
              userId: bot.id 
            } 
          },
          update: { 
            bid: bid, 
            isBlindNil: false,
            seatIndex: seatIndex
          },
          create: {
            id: `bid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            roundId: currentRound.id,
            userId: bot.id,
            seatIndex: seatIndex,
            bid: bid,
            isBlindNil: false
          }
        });
        console.log(`[BOT LOGIC] Stored bot bid ${bid} for ${bot.username} in database`);
      } else {
        console.log(`[BOT LOGIC] No current round found for game ${game.id}`);
      }
    } catch (dbError) {
      console.error(`[BOT LOGIC] Error storing bot bid in database:`, dbError);
    }

    // Check if all players have bid after this bot's bid
    try {
      // Check using in-memory game state first
      let allBidsCount = 0;
      if (game.bidding && game.bidding.bids) {
        allBidsCount = game.bidding.bids.filter(bid => bid !== null && bid !== undefined).length;
      }
      
      // Fallback to database check if in-memory check fails
      if (allBidsCount < 4) {
        const { prisma } = await import('../../lib/prisma');
        const currentRound = await prisma.round.findFirst({
          where: { gameId: game.id },
          orderBy: { roundNumber: 'desc' }
        });
        
        if (currentRound) {
          const allBids = await prisma.roundBid.findMany({
            where: { roundId: currentRound.id }
          });
          
          allBidsCount = allBids.length;
        }
      }
      
      console.log(`[BOT LOGIC] After bot ${seatIndex} bid, total bids: ${allBidsCount}/4`);
      
      if (allBidsCount >= 4) {
        console.log('[BOT LOGIC] All players have bid, triggering bidding completion');
        console.log('[BOT LOGIC] Game bidding state:', game.bidding);
        
        // Import and call handleBiddingComplete
        const { handleBiddingComplete } = await import('../socket-handlers/game-state/bidding/biddingCompletion');
        const { prisma } = await import('../../lib/prisma');
        
        // Reconstruct game from database for bidding completion
        const dbGame = await prisma.game.findUnique({
          where: { id: game.id }
        });
        
        if (dbGame) {
          const gamePlayers = await prisma.gamePlayer.findMany({
            where: { gameId: game.id },
            orderBy: { seatIndex: 'asc' }
          });
          
          const userIds = gamePlayers.map(p => p.userId);
          const users = await prisma.user.findMany({
            where: { id: { in: userIds } }
          });
          const userMap = new Map(users.map(u => [u.id, u]));
          
          // Get bids for this round
          const currentRound = await prisma.round.findFirst({
            where: { gameId: game.id },
            orderBy: { roundNumber: 'desc' }
          });
          
          const roundBids = currentRound ? await prisma.roundBid.findMany({
            where: { roundId: currentRound.id }
          }) : [];
          
          const bidMap = new Map(roundBids.map(b => [b.userId, b.bid]));
          
          // Reconstruct game object for bidding completion
          const gameForCompletion = {
            id: dbGame.id,
            status: dbGame.status,
            mode: dbGame.mode || 'PARTNERS',
            players: gamePlayers.map(p => ({
              id: p.userId,
              username: userMap.get(p.userId)?.username || `Bot ${p.userId.slice(-4)}`,
              type: p.isHuman ? 'human' as const : 'bot' as const,
              seatIndex: p.seatIndex,
              teamIndex: p.teamIndex,
              bid: bidMap.get(p.userId) ?? null,
              tricks: null as number | null,
              points: null as number | null,
              bags: null as number | null
            })),
            hands: [] as any[], // Will be populated if needed
            bidding: {
              bids: gamePlayers.map(p => bidMap.get(p.userId) ?? null),
              currentBidderIndex: 0,
              currentPlayer: gamePlayers[0]?.userId || ''
            },
            dealerIndex: 0, // Default, will be updated if needed
            currentRound: 1,
            dbGameId: dbGame.id
          };
          
          await handleBiddingComplete(gameForCompletion as any);
        }
      }
    } catch (error) {
      console.error('[BOT LOGIC] Error checking bidding completion:', error);
    }

    // Move to next player
    const nextPlayerIndex = (seatIndex + 1) % 4;
    if (game.bidding) {
      game.bidding.currentBidderIndex = nextPlayerIndex;
      game.bidding.currentPlayer = game.players[nextPlayerIndex]?.id || '';
    }

    // Emit game update with bid information
    if (io) {
      const enrichedGame = enrichGameForClient(game);
      io.to(game.id).emit('game_update', enrichedGame);
    }

    // Schedule next bot turn if needed
    if (game.players[nextPlayerIndex]?.type === 'bot') {
      setTimeout(() => {
        playBotBid(game, nextPlayerIndex, io);
      }, 1500); // Slightly longer delay for better UX
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
 * Bot play card (alias for playBotCard)
 */
export async function botPlayCard(game: Game, seatIndex: number, io?: any): Promise<void> {
  return await playBotCard(game, seatIndex, io);
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