import { GameService } from './GameService.js';
import { GameLoggingService } from './GameLoggingService.js';
import { BotUserService } from './BotUserService.js';
import { prisma } from '../config/database.js';

class BotService {
  constructor() {
    // Use static logging service methods directly
    this.loggingService = GameLoggingService;
  }

  /**
   * Get numeric value of a card rank for comparison
   */
  getCardValue(rank) {
    const values = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
      'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };
    return values[rank] || 0;
  }

  /**
   * Create a bot player for a specific seat
   */
  async createBotPlayer(gameId, seatIndex) {
    const botNames = ['Bot Alice', 'Bot Bob', 'Bot Charlie', 'Bot Diana'];
    const botAvatars = [
      'https://api.dicebear.com/7.x/bottts/svg?seed=alice',
      'https://api.dicebear.com/7.x/bottts/svg?seed=bob',
      'https://api.dicebear.com/7.x/bottts/svg?seed=charlie',
      'https://api.dicebear.com/7.x/bottts/svg?seed=diana'
    ];

    const botId = `bot_${seatIndex}_${Date.now()}`;
    
    // Create bot user in database
    const botUser = await BotUserService.createBotUser(botId, gameId);
    
    // Create GamePlayer record
    await prisma.gamePlayer.create({
      data: {
        gameId: gameId,
        userId: botUser.id,
        seatIndex: seatIndex,
        teamIndex: seatIndex % 2,
        isHuman: false,
        joinedAt: new Date()
      }
    });
    
    const bot = {
      id: botUser.id,
      username: botUser.username,
      avatarUrl: botUser.avatarUrl || botAvatars[seatIndex] || 'https://api.dicebear.com/7.x/bottts/svg?seed=default',
      type: 'bot',
      seatIndex: seatIndex,
      team: seatIndex % 2, // Team 0 or 1
      hand: [],
      bid: null,
      tricks: 0,
      isHuman: false
    };

    console.log(`[BOT SERVICE] Created bot ${bot.username} for seat ${seatIndex}`);
    return bot;
  }

  /**
   * Add a bot to an empty seat
   */
  async addBotToGame(game, seatIndex) {
    const botNames = ['Bot Alice', 'Bot Bob', 'Bot Charlie', 'Bot Diana'];
    const botAvatars = [
      'https://api.dicebear.com/7.x/bottts/svg?seed=alice',
      'https://api.dicebear.com/7.x/bottts/svg?seed=bob',
      'https://api.dicebear.com/7.x/bottts/svg?seed=charlie',
      'https://api.dicebear.com/7.x/bottts/svg?seed=diana'
    ];

    const botId = `bot_${seatIndex}_${Date.now()}`;
    
    // Create bot user in database
    const botUser = await BotUserService.createBotUser(botId, game.id);
    
    // Create GamePlayer record
    await prisma.gamePlayer.create({
      data: {
        gameId: game.id,
        userId: botUser.id,
        seatIndex: seatIndex,
        teamIndex: seatIndex % 2,
        isHuman: false,
        joinedAt: new Date()
      }
    });
    
    const bot = {
      id: botUser.id,
      username: botUser.username,
      avatarUrl: botUser.avatarUrl || botAvatars[seatIndex] || 'https://api.dicebear.com/7.x/bottts/svg?seed=default',
      type: 'bot',
      seatIndex: seatIndex,
      team: seatIndex % 2, // Team 0 or 1
      hand: [],
      bid: null,
      tricks: 0,
      isHuman: false
    };

    game.players[seatIndex] = bot;
    console.log(`[BOT SERVICE] Added bot ${bot.username} to seat ${seatIndex}`);
    return bot;
  }

  /**
   * Make a bid for a bot using intelligent logic
   */
  async makeBotBid(game, seatIndex) {
    const bot = game.players[seatIndex];
    if (!bot || bot.type !== 'bot') {
      console.log(`[BOT SERVICE] Seat ${seatIndex} is not a bot`);
      return;
    }

    const hand = game.hands[seatIndex] || [];
    let bid = 0;

    if (hand.length === 0) {
      bid = 2; // Default bid if no hand
    } else {
      bid = this.calculateIntelligentBid(game, seatIndex, hand);
    }

    console.log(`[BOT SERVICE] Bot ${bot.username} bidding ${bid} (intelligent logic)`);

    // Apply bid to game state (advances current bidder)
    game.makeBid(bot.id, bid, bid === 0, false);

    // Resolve current roundId from DB and log bid
    const round = await prisma.round.findFirst({
      where: { gameId: game.id },
      orderBy: { createdAt: 'desc' }
    });
    if (round) {
      try {
        await this.loggingService.logBid(
          game.id,
          round.id,
          bot.id,
          seatIndex,
          bid,
          bid === 0,
          false
        );
      } catch (logError) {
        console.error('[BOT SERVICE] Error logging bid (continuing):', logError);
        // Continue even if logging fails
      }
    }

    return bid;
  }

  /**
   * Calculate intelligent bid based on game state, position, partner's bid, and cards
   */
  calculateIntelligentBid(game, seatIndex, hand) {
    // 1. Analyze hand strength
    const handAnalysis = this.analyzeHand(hand);
    
    // 2. Get game context
    const gameContext = this.getGameContext(game, seatIndex);
    
    // 3. Get partner's bid if available
    const partnerBid = this.getPartnerBid(game, seatIndex);
    
    // 4. Calculate base bid from hand strength
    let baseBid = handAnalysis.totalStrength;
    
    // 5. Adjust for game score (aggressive if losing, conservative if winning)
    if (gameContext.teamScore < 0) {
      baseBid = Math.min(13, baseBid + 1); // More aggressive when losing
    } else if (gameContext.teamScore > 50) {
      baseBid = Math.max(0, baseBid - 1); // More conservative when winning
    }
    
    // 6. Adjust for position in bidding order
    if (gameContext.biddingPosition === 'early') {
      baseBid = Math.max(0, baseBid - 1); // Conservative early
    } else if (gameContext.biddingPosition === 'late') {
      baseBid = Math.min(13, baseBid + 1); // More aggressive late
    }
    
    // 7. Adjust for partner's bid
    if (partnerBid !== null) {
      if (partnerBid === 0) {
        // Partner went nil - be more aggressive
        baseBid = Math.min(13, baseBid + 1);
      } else if (partnerBid >= 5) {
        // Partner bid high - be more conservative
        baseBid = Math.max(0, baseBid - 1);
      }
    }
    
    // 8. Consider nil bid
    if (handAnalysis.spadesCount === 0 && handAnalysis.highCards <= 1 && 
        handAnalysis.totalStrength <= 2 && game.rules?.allowNil) {
      return 0; // Nil
    }
    
    // 9. Final bounds check
    return Math.max(0, Math.min(13, Math.round(baseBid)));
  }

  /**
   * Analyze hand strength and composition
   */
  analyzeHand(hand) {
    const spadesCount = hand.filter(card => card.suit === 'SPADES').length;
    const highCards = hand.filter(card => ['A', 'K', 'Q', 'J'].includes(card.rank)).length;
    const aces = hand.filter(card => card.rank === 'A').length;
    const kings = hand.filter(card => card.rank === 'K').length;
    
    // Count cards by suit for distribution analysis
    const suitCounts = {
      SPADES: hand.filter(card => card.suit === 'SPADES').length,
      HEARTS: hand.filter(card => card.suit === 'HEARTS').length,
      DIAMONDS: hand.filter(card => card.suit === 'DIAMONDS').length,
      CLUBS: hand.filter(card => card.suit === 'CLUBS').length
    };
    
    // Calculate distribution bonus (balanced hands are better)
    const maxSuit = Math.max(...Object.values(suitCounts));
    const minSuit = Math.min(...Object.values(suitCounts));
    const distributionBonus = maxSuit <= 5 ? 1 : 0;
    
    // Calculate total strength (more realistic)
    const totalStrength = Math.min(6, 
      Math.floor(spadesCount / 2) + // Spades are worth more
      Math.floor(highCards / 3) + // High cards bonus (reduced)
      Math.floor(aces / 2) + // Ace bonus (reduced)
      Math.floor(kings / 4) + // King bonus (reduced)
      (distributionBonus ? 1 : 0) // Small distribution bonus
    );
    
    return {
      spadesCount,
      highCards,
      aces,
      kings,
      suitCounts,
      totalStrength,
      distributionBonus
    };
  }

  /**
   * Get game context (score, position, etc.)
   */
  getGameContext(game, seatIndex) {
    // Get team scores
    const teamIndex = Math.floor(seatIndex / 2);
    const teamScore = game.scores?.[teamIndex] || 0;
    const opponentScore = game.scores?.[1 - teamIndex] || 0;
    
    // Determine bidding position
    const totalBids = game.bids?.length || 0;
    let biddingPosition = 'middle';
    if (totalBids === 0) biddingPosition = 'early';
    else if (totalBids >= 2) biddingPosition = 'late';
    
    return {
      teamScore,
      opponentScore,
      biddingPosition,
      totalBids
    };
  }

  /**
   * Get partner's bid if available
   */
  getPartnerBid(game, seatIndex) {
    const partnerSeatIndex = (seatIndex + 2) % 4; // Partner is 2 seats away
    const partner = game.players[partnerSeatIndex];
    
    if (partner && game.bids) {
      const partnerBid = game.bids.find(bid => bid.userId === partner.id);
      return partnerBid ? partnerBid.bid : null;
    }
    
    return null;
  }

  /**
   * Play a card for a bot
   */
  async playBotCard(game, seatIndex) {
    const bot = game.players[seatIndex];
    if (!bot || bot.type !== 'bot') {
      console.log(`[BOT SERVICE] Seat ${seatIndex} is not a bot`);
      return null;
    }

    const hand = game.hands[seatIndex] || [];
    if (hand.length === 0) {
      console.log(`[BOT SERVICE] Bot ${bot.username} has no cards to play`);
      return null;
    }

    let cardToPlay = null;
    
    // Get current trick from database
    const round = game.rounds?.find(r => r.roundNumber === game.currentRound);
    if (!round) {
      console.error(`[BOT SERVICE] No round found for round ${game.currentRound}`);
      return hand[0]; // Fallback
    }

    const currentTrickCards = await prisma.trickCard.findMany({
      where: {
        trick: {
          roundId: round.id,
          trickNumber: game.currentTrick
        }
      },
      orderBy: { playOrder: 'asc' }
    });

    // Simple bot card playing logic
    if (currentTrickCards.length === 0) {
      // Leading - play lowest card of longest suit (checking spades broken)
      cardToPlay = this.getLeadCard(hand, game);
    } else {
      // Following - follow suit if possible, otherwise play low
      const leadSuit = currentTrickCards[0].suit;
      cardToPlay = this.getFollowCard(hand, leadSuit);
    }

    if (!cardToPlay) {
      cardToPlay = hand[0]; // Fallback
    }

    console.log(`[BOT SERVICE] Bot ${bot.username} playing ${cardToPlay.suit}${cardToPlay.rank}`);

    // Don't remove card from hand here - CardPlayHandler.processCardPlay() will do it
    // Just return the card choice - the handler will log it to the database

    return cardToPlay;
  }

  /**
   * Get best card to lead with
   */
  getLeadCard(hand, game = null) {
    // Group cards by suit
    const suits = {};
    hand.forEach(card => {
      if (!suits[card.suit]) suits[card.suit] = [];
      suits[card.suit].push(card);
    });

    // Check if spades are broken (if game state is available)
    const spadesBroken = game ? this.areSpadesBroken(game) : false;

    // Find longest suit (prefer non-spades)
    let longestSuit = null;
    let longestLength = 0;
    
    Object.keys(suits).forEach(suit => {
      if (suits[suit].length > longestLength) {
        longestSuit = suit;
        longestLength = suits[suit].length;
      }
    });

    // NEVER lead spades unless they're broken
    if (longestSuit === 'SPADES' && !spadesBroken) {
      // Find next longest non-spade suit
      let nextLongestSuit = null;
      let nextLongestLength = 0;
      
      Object.keys(suits).forEach(suit => {
        if (suit !== 'SPADES' && suits[suit].length > nextLongestLength) {
          nextLongestSuit = suit;
          nextLongestLength = suits[suit].length;
        }
      });
      
      if (nextLongestSuit) {
        longestSuit = nextLongestSuit;
        longestLength = nextLongestLength;
      }
    }

    if (longestSuit && longestSuit !== 'SPADES') {
      // Play lowest card of longest non-spade suit
      const cards = suits[longestSuit].sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank));
      return cards[0];
    } else if (longestSuit === 'SPADES' && spadesBroken) {
      // Only lead spades if they're broken
      const cards = suits['SPADES'].sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank));
      return cards[0];
    } else {
      // Play lowest card overall (avoiding spades if not broken)
      const nonSpadeCards = hand.filter(card => card.suit !== 'SPADES');
      if (nonSpadeCards.length > 0) {
        return nonSpadeCards.sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank))[0];
      } else {
        // Only spades left - play lowest
        const sortedHand = hand.sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank));
        return sortedHand[0];
      }
    }
  }

  /**
   * Check if spades have been broken in this round
   */
  areSpadesBroken(game) {
    // Check if any spades have been played in this round
    if (!game.play || !game.play.completedTricks) {
      return false;
    }
    
    // Look through completed tricks for any spades
    for (const trick of game.play.completedTricks) {
      if (trick.cards) {
        for (const card of trick.cards) {
          if (card.suit === 'SPADES') {
            return true;
          }
        }
      }
    }
    
    // Also check current trick if it has cards
    if (game.play.currentTrick) {
      for (const card of game.play.currentTrick) {
        if (card.suit === 'SPADES') {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Get best card to follow with
   */
  getFollowCard(hand, leadSuit) {
    // Try to follow suit
    const suitCards = hand.filter(card => card.suit === leadSuit);
    if (suitCards.length > 0) {
      // Play lowest card of lead suit
      return suitCards.sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank))[0];
    }

    // Can't follow suit - play lowest card (prefer non-spades)
    const nonSpades = hand.filter(card => card.suit !== 'SPADES');
    if (nonSpades.length > 0) {
      return nonSpades.sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank))[0];
    } else {
      // Only spades left
      return hand.sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank))[0];
    }
  }

  /**
   * Fill empty seats with bots
   */
  async fillEmptySeatsWithBots(game) {
    const emptySeats = [];
    for (let i = 0; i < 4; i++) {
      if (!game.players[i]) {
        emptySeats.push(i);
      }
    }

    for (const seatIndex of emptySeats) {
      await this.addBotToGame(game, seatIndex);
    }

    console.log(`[BOT SERVICE] Filled ${emptySeats.length} empty seats with bots`);
    return emptySeats.length;
  }
}

export { BotService };
