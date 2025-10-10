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
    if (!bot || bot.isHuman !== false) {
      console.log(`[BOT SERVICE] Seat ${seatIndex} is not a bot`);
      return;
    }

    // Handle both 'hands' and 'playerHands' properties
    const hands = game.hands || game.playerHands || [];
    const hand = hands[seatIndex] || [];
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
    // Check if this is a WHIZ game
    if (game.format === 'WHIZ') {
      return this.calculateWhizBid(game, seatIndex, hand);
    }
    
    // Check if this is a MIRROR game
    if (game.format === 'MIRROR') {
      const spadesCount = hand.filter(card => card.suit === 'SPADES').length;
      console.log(`[BOT SERVICE] MIRROR game - bidding ${spadesCount} (number of spades)`);
      return spadesCount;
    }
    
    // Check if this is a gimmick game with forced bids
    if (game.gimmickVariant) {
      switch (game.gimmickVariant) {
        case 'BID3':
        case 'BID 3':
          console.log(`[BOT SERVICE] BID3 game - bidding 3`);
          return 3;
        
        case 'BIDHEARTS':
        case 'BID HEARTS':
          const heartsCount = hand.filter(card => card.suit === 'HEARTS').length;
          console.log(`[BOT SERVICE] BIDHEARTS game - bidding ${heartsCount} (number of hearts)`);
          return heartsCount;
        
        case 'CRAZY_ACES':
        case 'CRAZY ACES':
          const acesCount = hand.filter(card => card.rank === 'A').length;
          const acesBid = acesCount * 3;
          console.log(`[BOT SERVICE] CRAZY_ACES game - bidding ${acesBid} (${acesCount} aces × 3)`);
          return acesBid;
        
        case 'BID4NIL':
        case '4 OR NIL':
          // Simple logic: bid 4 if strong hand, nil if weak
          const handAnalysis = this.analyzeHand(hand);
          const bid4orNil = handAnalysis.totalStrength >= 4 ? 4 : 0;
          console.log(`[BOT SERVICE] BID4NIL game - bidding ${bid4orNil} (strength: ${handAnalysis.totalStrength})`);
          return bid4orNil;
        
        case 'SUICIDE':
          // Check partner's bid
          const partnerBid = this.getPartnerBid(game, seatIndex);
          if (partnerBid === null || partnerBid === undefined) {
            // First to bid in team - analyze hand to decide
            const handAnalysis2 = this.analyzeHand(hand);
            const suicideBid = handAnalysis2.totalStrength >= 3 ? handAnalysis2.totalStrength : 0;
            console.log(`[BOT SERVICE] SUICIDE game (first bidder) - bidding ${suicideBid}`);
            return suicideBid;
          } else if (partnerBid === 0) {
            // Partner bid nil, we must bid regular
            const handAnalysis3 = this.analyzeHand(hand);
            const regularBid = Math.max(1, handAnalysis3.totalStrength);
            console.log(`[BOT SERVICE] SUICIDE game (partner nil) - bidding ${regularBid}`);
            return regularBid;
          } else {
            // Partner bid regular, we must bid nil
            console.log(`[BOT SERVICE] SUICIDE game (partner regular) - bidding 0 (nil)`);
            return 0;
          }
      }
    }
    
    // Regular game bidding logic
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
   * Calculate WHIZ bid - must bid number of spades or nil
   */
  calculateWhizBid(game, seatIndex, hand) {
    console.log(`[BOT SERVICE] Calculating WHIZ bid for seat ${seatIndex}`);
    
    // 1. Count spades in hand
    const spadesCount = hand.filter(card => card.suit === 'SPADES').length;
    console.log(`[BOT SERVICE] Spades count: ${spadesCount}`);
    
    // 2. Check if partner already bid nil
    const partnerBid = this.getPartnerBid(game, seatIndex);
    const partnerBidNil = partnerBid === 0;
    console.log(`[BOT SERVICE] Partner bid: ${partnerBid}, is nil: ${partnerBidNil}`);
    
    // 3. Check nil prevention rules
    const cannotBidNil = this.cannotBidNilInWhiz(hand, partnerBidNil);
    console.log(`[BOT SERVICE] Cannot bid nil: ${cannotBidNil}`);
    
    // 4. Make decision based on WHIZ rules
    if (spadesCount === 0) {
      // FORCED NIL: Must bid nil if 0 spades
      console.log(`[BOT SERVICE] FORCED NIL - bidding 0 (no spades)`);
      return 0;
    } else if (spadesCount >= 4) {
      // NO NIL OPTION: Must bid spade count if 4+ spades
      console.log(`[BOT SERVICE] NO NIL OPTION - bidding ${spadesCount} (4+ spades)`);
      return spadesCount;
    } else if (spadesCount >= 1 && spadesCount <= 3) {
      // OPTIONAL NIL: Can choose nil or spade count (unless rules prevent nil)
      if (cannotBidNil) {
        console.log(`[BOT SERVICE] CANNOT BID NIL - bidding ${spadesCount} (rules prevent nil)`);
        return spadesCount;
      } else {
        // Bot can choose - for now, prefer nil if hand is weak
        const handAnalysis = this.analyzeHand(hand);
        if (handAnalysis.totalStrength <= 2) {
          console.log(`[BOT SERVICE] CHOOSING NIL - bidding 0 (weak hand, can bid nil)`);
          return 0;
        } else {
          console.log(`[BOT SERVICE] CHOOSING SPADE COUNT - bidding ${spadesCount} (strong hand)`);
          return spadesCount;
        }
      }
    }
    
    // Fallback (should never reach here)
    console.log(`[BOT SERVICE] FALLBACK - bidding ${spadesCount}`);
    return spadesCount;
  }

  /**
   * Check if bot cannot bid nil in WHIZ game based on the 6 rules
   */
  cannotBidNilInWhiz(hand, partnerBidNil) {
    // Rule 1: Partner already bid nil
    if (partnerBidNil) {
      console.log(`[BOT SERVICE] Cannot bid nil - partner already bid nil`);
      return true;
    }
    
    // Rule 2: Hold Ace of spades
    const hasAceOfSpades = hand.some(card => card.suit === 'SPADES' && card.rank === 'A');
    if (hasAceOfSpades) {
      console.log(`[BOT SERVICE] Cannot bid nil - holds Ace of spades`);
      return true;
    }
    
    // Rule 3: Hold both K and Q of spades
    const hasKingOfSpades = hand.some(card => card.suit === 'SPADES' && card.rank === 'K');
    const hasQueenOfSpades = hand.some(card => card.suit === 'SPADES' && card.rank === 'Q');
    if (hasKingOfSpades && hasQueenOfSpades) {
      console.log(`[BOT SERVICE] Cannot bid nil - holds both K and Q of spades`);
      return true;
    }
    
    // Rule 4: Hold more than 3 spades
    const spadesCount = hand.filter(card => card.suit === 'SPADES').length;
    if (spadesCount > 3) {
      console.log(`[BOT SERVICE] Cannot bid nil - holds ${spadesCount} spades (>3)`);
      return true;
    }
    
    // Rule 5: Hold an ace in another suit and only 2 or less other cards in that suit
    const suits = ['HEARTS', 'DIAMONDS', 'CLUBS'];
    for (const suit of suits) {
      const suitCards = hand.filter(card => card.suit === suit);
      const hasAce = suitCards.some(card => card.rank === 'A');
      const otherCards = suitCards.filter(card => card.rank !== 'A').length;
      
      if (hasAce && otherCards <= 2) {
        console.log(`[BOT SERVICE] Cannot bid nil - holds Ace of ${suit} with only ${otherCards} other cards`);
        return true;
      }
    }
    
    // Rule 6: Hold a king in another suit and only 1 or less other cards in that suit
    for (const suit of suits) {
      const suitCards = hand.filter(card => card.suit === suit);
      const hasKing = suitCards.some(card => card.rank === 'K');
      const otherCards = suitCards.filter(card => card.rank !== 'K').length;
      
      if (hasKing && otherCards <= 1) {
        console.log(`[BOT SERVICE] Cannot bid nil - holds King of ${suit} with only ${otherCards} other cards`);
        return true;
      }
    }
    
    return false; // Can bid nil
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
    let bot = null;
    try {
      console.log(`[BOT SERVICE] playBotCard called for seat ${seatIndex}, game:`, {
        currentRound: game.currentRound,
        currentTrick: game.currentTrick,
        playersCount: game.players?.length,
        handsCount: game.hands?.length
      });
      
      bot = game.players[seatIndex];
      if (!bot || bot.isHuman !== false) {
        console.log(`[BOT SERVICE] Seat ${seatIndex} is not a bot:`, bot);
        return null;
      }

      // CRITICAL: Handle both 'hands' and 'playerHands' properties
      const hands = game.hands || game.playerHands || [];
      const hand = hands[seatIndex] || [];
      if (hand.length === 0) {
        console.log(`[BOT SERVICE] Bot ${bot.username} has no cards to play`);
        return null;
      }
      
      console.log(`[BOT SERVICE] Bot ${bot.username} has ${hand.length} cards to choose from`);

    let cardToPlay = null;
    
    // REDIS ONLY: Get current trick cards from Redis cache
    let currentTrickCards = [];
    const redisGameState = await import('./RedisGameStateService.js');
    const redisTrickData = await redisGameState.default.getCurrentTrick(game.id);
    if (redisTrickData && redisTrickData.length > 0) {
      // Convert Redis format to database format for compatibility
      currentTrickCards = redisTrickData.map(card => ({
        suit: card.suit,
        rank: card.rank,
        seatIndex: card.seatIndex,
        playOrder: card.playOrder || 0
      }));
    }

    console.log(`[BOT SERVICE] Bot ${bot.username} current trick query result:`, currentTrickCards.map(c => `${c.suit}${c.rank} (seat ${c.seatIndex})`));

    // Get special rules from game
    const specialRules = game.specialRules || {};
    
    // CRITICAL: Get spadesBroken from Redis cache for real-time accuracy
    const cachedGameState = await redisGameState.default.getGameState(game.id);
    const spadesBroken = cachedGameState?.play?.spadesBroken || game.play?.spadesBroken || false;
    console.log(`[BOT SERVICE] spadesBroken status: ${spadesBroken} (from ${cachedGameState?.play?.spadesBroken !== undefined ? 'Redis' : 'game state'})`);

    // MANDATORY suit following logic
    if (currentTrickCards.length === 0) {
      // Leading - apply special rules
      cardToPlay = this.getLeadCard(hand, game, specialRules, spadesBroken);
    } else {
      // FOLLOWING - MUST follow suit if possible, NO EXCEPTIONS
      const leadSuit = currentTrickCards[0].suit;
      console.log(`[BOT SERVICE] Bot ${bot.username} MUST follow suit ${leadSuit}, current trick:`, currentTrickCards.map(c => `${c.suit}${c.rank}`));
      console.log(`[BOT SERVICE] Bot ${bot.username} hand:`, hand);
      
      // Convert string format cards to object format if needed
      const normalizedHand = hand.map(card => {
        if (typeof card === 'string') {
          const suit = card.substring(0, card.length - 1);
          const rank = card.substring(card.length - 1);
          return { suit, rank };
        }
        return card;
      });

      // MANDATORY: Find cards of the lead suit
      const suitCards = normalizedHand.filter(card => card.suit === leadSuit);
      console.log(`[BOT SERVICE] Bot ${bot.username} has ${suitCards.length} cards of lead suit ${leadSuit}:`, suitCards.map(c => `${c.suit}${c.rank}`));
      
      if (suitCards.length > 0) {
        // MANDATORY: Play lowest card of lead suit
        cardToPlay = suitCards.sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank))[0];
        console.log(`[BOT SERVICE] Bot ${bot.username} MUST play ${cardToPlay.suit}${cardToPlay.rank} to follow suit`);
      } else {
        // Void in lead suit - apply special rules
        let playableCards = normalizedHand;
        
        // ASSASSIN: Must cut with spades when void
        if (specialRules.assassin) {
          const spades = normalizedHand.filter(card => card.suit === 'SPADES');
          if (spades.length > 0) {
            playableCards = spades;
            console.log(`[BOT SERVICE] ASSASSIN: Bot ${bot.username} MUST cut with spades`);
          }
        }
        
        // SCREAMER: Cannot play spades unless only have spades
        if (specialRules.screamer) {
          const nonSpades = normalizedHand.filter(card => card.suit !== 'SPADES');
          if (nonSpades.length > 0) {
            playableCards = playableCards.filter(card => card.suit !== 'SPADES');
            console.log(`[BOT SERVICE] SCREAMER: Bot ${bot.username} cannot play spades, has non-spades available`);
          }
        }
        
        // Play lowest available card
        if (playableCards.length > 0) {
          cardToPlay = playableCards.sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank))[0];
          console.log(`[BOT SERVICE] Bot ${bot.username} is void in ${leadSuit}, playing ${cardToPlay.suit}${cardToPlay.rank}`);
        } else {
          // Fallback (should not happen)
          cardToPlay = normalizedHand.sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank))[0];
          console.log(`[BOT SERVICE] Bot ${bot.username} fallback, playing ${cardToPlay.suit}${cardToPlay.rank}`);
        }
      }
    }

    if (!cardToPlay) {
      cardToPlay = hand[0]; // Fallback
    }

    // CRITICAL: Validate that the chosen card is actually in the bot's hand
    const cardInHand = hand.find(card => {
      if (typeof card === 'string') {
        return card === `${cardToPlay.suit}${cardToPlay.rank}`;
      } else {
        return card.suit === cardToPlay.suit && card.rank === cardToPlay.rank;
      }
    });
    
    if (!cardInHand) {
      console.error(`[BOT SERVICE] ERROR: Bot ${bot.username} chose card ${cardToPlay.suit}${cardToPlay.rank} but it's not in their hand!`);
      console.error(`[BOT SERVICE] Bot's actual hand:`, hand.map(c => typeof c === 'string' ? c : `${c.suit}${c.rank}`));
      // Use first available card as emergency fallback
      const firstCard = hand[0];
      if (typeof firstCard === 'string') {
        const suit = firstCard.substring(0, firstCard.length - 1);
        const rank = firstCard.substring(firstCard.length - 1);
        cardToPlay = { suit, rank };
      } else {
        cardToPlay = firstCard;
      }
      if (!cardToPlay) {
        console.error(`[BOT SERVICE] ERROR: Bot ${bot.username} has no cards at all!`);
        return null;
      }
    }

    console.log(`[BOT SERVICE] Bot ${bot.username} playing ${cardToPlay.suit}${cardToPlay.rank}`);

    // Don't remove card from hand here - CardPlayHandler.processCardPlay() will do it
    // Just return the card choice - the handler will log it to the database

    return cardToPlay;
    } catch (error) {
      console.error(`[BOT SERVICE] ERROR in playBotCard for bot ${bot?.username || 'unknown'}:`, error);
      return null;
    }
  }

  /**
   * Select a card to play (for auto-play, works for both bots and humans)
   * This is the core logic without the isHuman check
   */
  async selectCardForAutoPlay(game, seatIndex) {
    try {
      const player = game.players[seatIndex];
      if (!player) {
        console.log(`[BOT SERVICE] No player at seat ${seatIndex}`);
        return null;
      }

      // Get hand from Redis
      const redisGameState = await import('./RedisGameStateService.js');
      const hands = await redisGameState.default.getPlayerHands(game.id);
      const hand = hands?.[seatIndex] || [];
      
      if (hand.length === 0) {
        console.log(`[BOT SERVICE] Player at seat ${seatIndex} has no cards to play`);
        return null;
      }
      
      console.log(`[BOT SERVICE] Player at seat ${seatIndex} has ${hand.length} cards to choose from`);

      let cardToPlay = null;
      
      // Get current trick cards from Redis
      let currentTrickCards = [];
      const redisTrickData = await redisGameState.default.getCurrentTrick(game.id);
      if (redisTrickData && redisTrickData.length > 0) {
        currentTrickCards = redisTrickData.map(card => ({
          suit: card.suit,
          rank: card.rank,
          seatIndex: card.seatIndex,
          playOrder: card.playOrder || 0
        }));
      }

      // Get special rules and spadesBroken status
      const specialRules = game.specialRules || {};
      const cachedGameState = await redisGameState.default.getGameState(game.id);
      const spadesBroken = cachedGameState?.play?.spadesBroken || game.play?.spadesBroken || false;

      // Card selection logic (same as playBotCard)
      if (currentTrickCards.length === 0) {
        // Leading
        cardToPlay = this.getLeadCard(hand, game, specialRules, spadesBroken);
      } else {
        // Following - MUST follow suit if possible
        const leadSuit = currentTrickCards[0].suit;
        
        // Normalize hand
        const normalizedHand = hand.map(card => {
          if (typeof card === 'string') {
            const suit = card.substring(0, card.length - 1);
            const rank = card.substring(card.length - 1);
            return { suit, rank };
          }
          return card;
        });

        // Find cards of lead suit
        const suitCards = normalizedHand.filter(card => card.suit === leadSuit);
        
        if (suitCards.length > 0) {
          // MUST play lowest card of lead suit
          cardToPlay = suitCards.sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank))[0];
        } else {
          // Void in lead suit - apply special rules
          let playableCards = normalizedHand;
          
          if (specialRules.assassin) {
            const spades = normalizedHand.filter(card => card.suit === 'SPADES');
            if (spades.length > 0) {
              playableCards = spades;
            }
          }
          
          if (specialRules.screamer) {
            const nonSpades = normalizedHand.filter(card => card.suit !== 'SPADES');
            if (nonSpades.length > 0) {
              playableCards = playableCards.filter(card => card.suit !== 'SPADES');
            }
          }
          
          // Play highest card to dump
          cardToPlay = playableCards.sort((a, b) => this.getCardValue(b.rank) - this.getCardValue(a.rank))[0];
        }
      }

      if (!cardToPlay) {
        console.error(`[BOT SERVICE] No card selected for seat ${seatIndex}`);
        return null;
      }

      console.log(`[BOT SERVICE] Selected card for seat ${seatIndex}: ${cardToPlay.suit}${cardToPlay.rank}`);
      return cardToPlay;
    } catch (error) {
      console.error(`[BOT SERVICE] ERROR in selectCardForAutoPlay:`, error);
      return null;
    }
  }

  /**
   * Get best card to lead with
   */
  getLeadCard(hand, game = null, specialRules = {}, spadesBrokenParam = false) {
    // Convert string format cards to object format if needed
    const normalizedHand = hand.map(card => {
      if (typeof card === 'string') {
        const suit = card.substring(0, card.length - 1);
        const rank = card.substring(card.length - 1);
        return { suit, rank };
      }
      return card;
    });

    // Group cards by suit
    const suits = {};
    normalizedHand.forEach(card => {
      if (!suits[card.suit]) suits[card.suit] = [];
      suits[card.suit].push(card);
    });

    // Check if spades are broken
    const spadesBroken = spadesBrokenParam || (game ? this.areSpadesBroken(game) : false);

    // ASSASSIN: Must lead spades if broken and have spades
    if (specialRules.assassin && spadesBroken && suits['SPADES'] && suits['SPADES'].length > 0) {
      const cards = suits['SPADES'].sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank));
      console.log(`[BOT SERVICE] ASSASSIN: Bot MUST lead spades (broken), playing lowest`);
      return cards[0];
    }

    // SCREAMER: Cannot lead spades unless only have spades
    let availableSuits = Object.keys(suits);
    if (specialRules.screamer) {
      const nonSpades = availableSuits.filter(suit => suit !== 'SPADES');
      if (nonSpades.length > 0) {
        availableSuits = nonSpades;
        console.log(`[BOT SERVICE] SCREAMER: Bot cannot lead spades, has non-spades available`);
      }
    }

    // Find longest suit from available suits
    let longestSuit = null;
    let longestLength = 0;
    
    availableSuits.forEach(suit => {
      if (suits[suit].length > longestLength) {
        longestSuit = suit;
        longestLength = suits[suit].length;
      }
    });

    // NEVER lead spades unless they're broken (normal rule, applies to all formats)
    if (longestSuit === 'SPADES' && !spadesBroken) {
      // Find next longest non-spade suit
      let nextLongestSuit = null;
      let nextLongestLength = 0;
      
      availableSuits.forEach(suit => {
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
    console.log(`[BOT SERVICE] getFollowCard called with leadSuit: ${leadSuit}, hand:`, hand);
    
    // Convert string format cards to object format if needed
    const normalizedHand = hand.map(card => {
      if (typeof card === 'string') {
        const suit = card.substring(0, card.length - 1);
        const rank = card.substring(card.length - 1);
        return { suit, rank };
      }
      return card;
    });

    console.log(`[BOT SERVICE] Normalized hand:`, normalizedHand);

    // Try to follow suit
    const suitCards = normalizedHand.filter(card => card.suit === leadSuit);
    console.log(`[BOT SERVICE] Cards of lead suit ${leadSuit}:`, suitCards);
    
    if (suitCards.length > 0) {
      // Play lowest card of lead suit
      const lowestCard = suitCards.sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank))[0];
      console.log(`[BOT SERVICE] Following suit ${leadSuit} with ${lowestCard.suit}${lowestCard.rank}`);
      return lowestCard;
    }

    // Can't follow suit - play lowest card (prefer non-spades)
    const nonSpades = normalizedHand.filter(card => card.suit !== 'SPADES');
    if (nonSpades.length > 0) {
      const lowestCard = nonSpades.sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank))[0];
      console.log(`[BOT SERVICE] Can't follow suit ${leadSuit}, playing ${lowestCard.suit}${lowestCard.rank}`);
      return lowestCard;
    } else {
      // Only spades left
      const lowestCard = normalizedHand.sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank))[0];
      console.log(`[BOT SERVICE] Only spades left, playing ${lowestCard.suit}${lowestCard.rank}`);
      return lowestCard;
    }
  }

  /**
   * Fill empty seats with bots - PARALLEL for speed
   */
  async fillEmptySeatsWithBots(game) {
    const emptySeats = [];
    for (let i = 0; i < 4; i++) {
      if (!game.players[i]) {
        emptySeats.push(i);
      }
    }

    // PERFORMANCE: Add all bots in parallel instead of sequentially
    await Promise.all(
      emptySeats.map(seatIndex => this.addBotToGame(game, seatIndex))
    );

    console.log(`[BOT SERVICE] Filled ${emptySeats.length} empty seats with bots in parallel`);
    return emptySeats.length;
  }
}

export { BotService };
