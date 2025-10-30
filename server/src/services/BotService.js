import { GameService } from './GameService.js';
import { GameLoggingService } from './GameLoggingService.js';
import { BotUserService } from './BotUserService.js';
import { prisma } from '../config/database.js';
import SpadesRuleService from './SpadesRuleService.js';

class BotService {
  constructor() {
    // Use static logging service methods directly
    this.loggingService = GameLoggingService;
  }

  // Normalize a card from either object or string formats like 'SPADES10','HEARTSA','CLUBS3'
  static normalizeCard(card) {
    if (typeof card === 'string') {
      const m = card.match(/^([A-Z]+)([0-9AQJK]{1,2})$/i);
      if (m) {
        const suit = m[1].toUpperCase();
        const rank = m[2].toUpperCase() === '0' ? '10' : m[2].toUpperCase();
        return { suit: suit, rank: rank };
      }
      // Fallback: last char as rank
      return { suit: card.slice(0, -1).toUpperCase(), rank: card.slice(-1).toUpperCase() };
    }
    return card;
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


  // DELETED: calculateIntelligentBid - conflicts with unified bidding system

  // DELETED: calculateWhizBid - conflicts with unified bidding system

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
    
    // Try to get from gameState bidding data
    if (game.bidding && game.bidding.bids) {
      return game.bidding.bids[partnerSeatIndex] || null;
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
        handsCount: game.hands?.length,
        specialRules: game.specialRules
      });
      
      bot = game.players[seatIndex];
      if (!bot || bot.isHuman !== false) {
        console.log(`[BOT SERVICE] Seat ${seatIndex} is not a bot:`, bot);
        return null;
      }

      // CRITICAL: Handle different bot object structures
      const botUsername = bot.username || bot.user?.username || `Bot_${seatIndex}`;
      console.log(`[BOT SERVICE] Bot object structure:`, {
        hasUsername: !!bot.username,
        hasUser: !!bot.user,
        hasUserUsername: !!bot.user?.username,
        botUsername
      });

      // CRITICAL: Handle both 'hands' and 'playerHands' properties
      const hands = game.hands || game.playerHands || [];
      const hand = hands[seatIndex] || [];
      if (hand.length === 0) {
        console.log(`[BOT SERVICE] Bot ${botUsername} has no cards to play`);
        return null;
      }
      
    console.log(`[BOT SERVICE] Bot ${botUsername} has ${hand.length} cards to choose from`);

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

    console.log(`[BOT SERVICE] Bot ${botUsername} current trick query result:`, currentTrickCards.map(c => `${c.suit}${c.rank} (seat ${c.seatIndex})`));

    // Get special rules from game
    const specialRules = game.specialRules || {};
    const rule1 = specialRules.specialRule1 || (specialRules.assassin ? 'ASSASSIN' : (specialRules.screamer ? 'SCREAMER' : 'NONE'));
    const rule2 = specialRules.specialRule2 || 'NONE';
    
    // Get secret assassin seat - check multiple sources
    let secretSeat = (game.play?.secretAssassinSeat ?? specialRules.secretAssassinSeat ?? game.specialRules?.secretAssassinSeat);
    
    // If still no secret seat and this is SECRET_ASSASSIN, find who has Ace of Spades
    if (!secretSeat && rule1 === 'SECRET_ASSASSIN') {
      try {
        const playerHands = hands; // use already-loaded hands from game state
        if (playerHands && playerHands.length >= 4) {
          for (let s = 0; s < 4; s++) {
            const seatHand = (playerHands[s] || []).map(BotService.normalizeCard);
            if (seatHand.some(card => card.suit === 'SPADES' && card.rank === 'A')) {
              secretSeat = s;
              break;
            }
          }
        }
      } catch (e) {
        console.warn('[BOT SERVICE] Could not determine secret assassin seat:', e?.message || e);
      }
    }
    
    // DEBUG: Log secret assassin detection for bots
    console.log(`[BOT SERVICE] Secret Assassin Debug - rule1: ${rule1}, secretSeat: ${secretSeat}, seatIndex: ${seatIndex}`);
    const isAssassinSeat = (rule1 === 'ASSASSIN') || (rule1 === 'SECRET_ASSASSIN' && secretSeat === seatIndex);
    const isScreamerSeat = (rule1 === 'SCREAMER') || (rule1 === 'SECRET_ASSASSIN' && secretSeat !== seatIndex);
    console.log(`[BOT SERVICE] Bot ${botUsername} - isAssassinSeat: ${isAssassinSeat}, isScreamerSeat: ${isScreamerSeat}`);
    console.log(`[BOT SERVICE] Special rules for bot ${botUsername}:`, specialRules);
    
    // CRITICAL: Get spadesBroken from Redis cache for real-time accuracy
    const cachedGameState = await redisGameState.default.getGameState(game.id);
    const spadesBroken = cachedGameState?.play?.spadesBroken || game.play?.spadesBroken || false;
    console.log(`[BOT SERVICE] spadesBroken status: ${spadesBroken} (from ${cachedGameState?.play?.spadesBroken !== undefined ? 'Redis' : 'game state'})`);

    // AI V2 path (default ON unless explicitly disabled)
    if (process.env.BOT_AI_V2 !== 'false') {
      const ctx = this.buildDecisionContext(game, seatIndex, hand, currentTrickCards, spadesBroken);
      const v2Card = this.selectCardV2(ctx);
      if (v2Card) {
        // Enforce core legality + Lowball/Highball if applicable
        const order = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
        const normalizedHandAI = hand.map(card => typeof card === 'string' ? { suit: card.substring(0, card.length - 1), rank: card.substring(card.length - 1) } : card);
        let legal = [];
        if (currentTrickCards.length === 0) {
          legal = normalizedHandAI.slice();
          // CORE: cannot lead spades before broken unless only spades
          if (!spadesBroken) {
            const nonSp = legal.filter(c => c.suit !== 'SPADES');
            if (nonSp.length > 0) legal = nonSp;
          }
          if (isAssassinSeat && spadesBroken) {
            const sp = legal.filter(c => c.suit === 'SPADES');
            if (sp.length > 0) legal = sp;
          } else if (isScreamerSeat) {
            const nonSp = legal.filter(c => c.suit !== 'SPADES');
            if (nonSp.length > 0) legal = nonSp;
          }
        } else {
          const leadSuit = currentTrickCards[0].suit;
          const suitCards = normalizedHandAI.filter(c => c.suit === leadSuit);
          if (suitCards.length > 0) {
            legal = suitCards;
          } else {
            legal = normalizedHandAI.slice();
            if (isAssassinSeat) {
              const sp = legal.filter(c => c.suit === 'SPADES');
              if (sp.length > 0) legal = sp;
            } else if (isScreamerSeat) {
              const nonSp = legal.filter(c => c.suit !== 'SPADES');
              if (nonSp.length > 0) legal = nonSp;
            }
          }
        }
        console.log(`[BOT SERVICE][AI_V2] After filtering - legal cards:`, legal.map(c => `${c.suit}${c.rank}`));

        // Prefer policy-selected v2Card only if it passes LOW/HIGHBALL constraints as well
        const v2InLegal = legal.some(c => c.suit === v2Card.suit && c.rank === v2Card.rank);
        const lowHighOk = (() => {
          if (!v2InLegal) return false;
          if (rule2 !== 'LOWBALL' && rule2 !== 'HIGHBALL') return true;
          // Leading
          if (currentTrickCards.length === 0) {
            const suitCards = legal.filter(c => c.suit === v2Card.suit).sort((a,b)=>order[a.rank]-order[b.rank]);
            if (suitCards.length === 0) return false;
            const lowest = suitCards[0];
            const highest = suitCards[suitCards.length-1];
            return rule2 === 'LOWBALL'
              ? (v2Card.suit === lowest.suit && v2Card.rank === lowest.rank)
              : (v2Card.suit === highest.suit && v2Card.rank === highest.rank);
          }
          // Following
          // If has lead suit, legal is already lead-suit only; must be lowest/highest of that suit
          const suits = [...new Set(legal.map(c=>c.suit))];
          const suitCards = legal.filter(c => c.suit === v2Card.suit).sort((a,b)=>order[a.rank]-order[b.rank]);
          if (suitCards.length === 0) return false;
          const lowest = suitCards[0];
          const highest = suitCards[suitCards.length-1];
          if (suits.length === 1) {
            return rule2 === 'LOWBALL'
              ? (v2Card.suit === lowest.suit && v2Card.rank === lowest.rank)
              : (v2Card.suit === highest.suit && v2Card.rank === highest.rank);
          }
          // Void in lead: must be lowest/highest in the chosen suit
          return rule2 === 'LOWBALL'
            ? (v2Card.suit === lowest.suit && v2Card.rank === lowest.rank)
            : (v2Card.suit === highest.suit && v2Card.rank === highest.rank);
        })();

        if (v2InLegal && lowHighOk) {
          console.log(`[BOT SERVICE][AI_V2] Using policy pick (legal + LOW/HIGH compliant) -> ${v2Card.suit}${v2Card.rank}`);
          return v2Card;
        } else if (v2InLegal && !lowHighOk) {
          console.log(`[BOT SERVICE][AI_V2] Policy pick fails LOW/HIGH constraint, replacing`);
        }
        if (rule2 === 'LOWBALL' && legal.length > 0) {
          if (currentTrickCards.length === 0) {
            // When leading: for each suit, find lowest card
            const suits = [...new Set(legal.map(card => card.suit))];
            const suitOptions = [];
            for (const suit of suits) {
              const suitCards = legal.filter(card => card.suit === suit);
              const sorted = [...suitCards].sort((a,b) => order[a.rank] - order[b.rank]);
              suitOptions.push(sorted[0]);
            }
            const lowest = suitOptions[0];
            console.log(`[BOT SERVICE][AI_V2] LOWBALL leading -> ${lowest.suit}${lowest.rank}`);
            return lowest;
          } else {
            // When following: if has lead suit, lowest in lead suit (legal already filtered)
            // If void: choose lowest in the CHOSEN suit among legal suits
            const suits = [...new Set(legal.map(card => card.suit))];
            const targetSuit = suits[0]; // deterministic: first legal suit
            const suitCards = legal.filter(c => c.suit === targetSuit);
            const sorted = suitCards.sort((a,b)=>order[a.rank]-order[b.rank]);
            const lowest = sorted[0];
            console.log(`[BOT SERVICE][AI_V2] LOWBALL following ${suits.length>1?'(void)': '(lead)'} -> ${lowest.suit}${lowest.rank}`);
            return lowest;
          }
        }
        if (rule2 === 'HIGHBALL' && legal.length > 0) {
          if (currentTrickCards.length === 0) {
            // When leading: for each suit, find highest card
            const suits = [...new Set(legal.map(card => card.suit))];
            const suitOptions = [];
            for (const suit of suits) {
              const suitCards = legal.filter(card => card.suit === suit);
              const sorted = [...suitCards].sort((a,b) => order[a.rank] - order[b.rank]);
              suitOptions.push(sorted[sorted.length-1]);
            }
            const highest = suitOptions[0];
            console.log(`[BOT SERVICE][AI_V2] HIGHBALL leading -> ${highest.suit}${highest.rank}`);
            return highest;
          } else {
            // When following: if has lead suit, highest in lead suit (legal already filtered)
            // If void: choose highest in the CHOSEN suit among legal suits
            const suits = [...new Set(legal.map(card => card.suit))];
            const targetSuit = suits[0];
            const suitCards = legal.filter(c => c.suit === targetSuit);
            const sorted = suitCards.sort((a,b)=>order[a.rank]-order[b.rank]);
            const highest = sorted[sorted.length-1];
            console.log(`[BOT SERVICE][AI_V2] HIGHBALL following ${suits.length>1?'(void)':'(lead)'} -> ${highest.suit}${highest.rank}`);
            return highest;
          }
        }
        // If we have a legal set after constraints, pick a default when policy isn't legal
        if (legal.length > 0) {
          // Heuristic: try highest safe when not LOW/HIGHBALL constrained
          const pick = [...legal].sort((a,b)=> order[b.rank]-order[a.rank])[0];
          console.log(`[BOT SERVICE][AI_V2] Policy not legal, picking heuristic -> ${pick.suit}${pick.rank}`);
          return pick;
        }
        // Otherwise, if policy card is still in hand (but filtered by constraints), fail safe to lowest in hand
        console.warn('[BOT SERVICE][AI_V2] Policy card not legal/available, falling back to lowest card in hand');
        const fallback = [...normalizedHandAI].sort((a,b)=> order[a.rank]-order[b.rank])[0];
        return fallback;
      }
      console.warn('[BOT SERVICE][AI_V2] Fallback to legacy logic');
    }

    // LEGACY: MANDATORY suit following logic
    if (currentTrickCards.length === 0) {
      // Leading - apply special rules
      // Normalize
      const normalizedHandLead = hand.map(BotService.normalizeCard);
      let legalLead = normalizedHandLead.slice();
      // CORE: Cannot lead spades before broken unless only spades
      if (!spadesBroken) {
        const nonSp = legalLead.filter(c => c.suit !== 'SPADES');
        if (nonSp.length > 0) legalLead = nonSp;
      }
      if (isAssassinSeat && spadesBroken) {
        const sp = legalLead.filter(c => c.suit === 'SPADES');
        if (sp.length > 0) legalLead = sp;
      }
      if (isScreamerSeat) {
        const nonSp = legalLead.filter(c => c.suit !== 'SPADES');
        if (nonSp.length > 0) legalLead = nonSp;
      }
      // LOW/HIGHBALL: For each legal suit, find the lowest/highest card in that suit
      const order = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
      if (rule2 === 'LOWBALL' || rule2 === 'HIGHBALL') {
        const suits = [...new Set(legalLead.map(card => card.suit))];
        const suitOptions = [];
        
        for (const suit of suits) {
          const suitCards = legalLead.filter(card => card.suit === suit);
          const sorted = [...suitCards].sort((a,b) => order[a.rank] - order[b.rank]);
          if (rule2 === 'LOWBALL') {
            suitOptions.push(sorted[0]); // Lowest card in this suit
          } else { // HIGHBALL
            suitOptions.push(sorted[sorted.length-1]); // Highest card in this suit
          }
        }
        
        // Bot can choose any of these suit options (for now, pick first one)
        cardToPlay = suitOptions[0] || legalLead[0];
      } else {
        // Default lowest
        cardToPlay = legalLead.sort((a,b)=>order[a.rank]-order[b.rank])[0] || legalLead[0];
      }
    } else {
      // FOLLOWING - MUST follow suit if possible, NO EXCEPTIONS
      const leadSuit = currentTrickCards[0].suit;
      console.log(`[BOT SERVICE] Bot ${botUsername} MUST follow suit ${leadSuit}, current trick:`, currentTrickCards.map(c => `${c.suit}${c.rank}`));
      console.log(`[BOT SERVICE] Bot ${botUsername} hand:`, hand);
      
      // Convert string format cards to object format if needed
      const normalizedHand = hand.map(BotService.normalizeCard);

      // MANDATORY: Find cards of the lead suit
      const suitCards = normalizedHand.filter(card => card.suit === leadSuit);
      console.log(`[BOT SERVICE] Bot ${botUsername} has ${suitCards.length} cards of lead suit ${leadSuit}:`, suitCards.map(c => `${c.suit}${c.rank}`));
      
      if (suitCards.length > 0) {
        // LOW/HIGHBALL within lead suit
        const order = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
        if (rule2 === 'LOWBALL') {
          cardToPlay = suitCards.sort((a,b)=>order[a.rank]-order[b.rank])[0];
        } else if (rule2 === 'HIGHBALL') {
          cardToPlay = suitCards.sort((a,b)=>order[b.rank]-order[a.rank])[0];
        } else {
          cardToPlay = suitCards.sort((a,b)=>order[a.rank]-order[b.rank])[0];
        }
        console.log(`[BOT SERVICE] Bot ${botUsername} following suit ${leadSuit}, chose ${cardToPlay.suit}${cardToPlay.rank}`);
      } else {
        // Void in lead suit - apply special rules
        let playableCards = normalizedHand;
        
        // ASSASSIN: Must cut with spades when void
        if (isAssassinSeat) {
          const spades = normalizedHand.filter(card => card.suit === 'SPADES');
          if (spades.length > 0) {
            playableCards = spades; // CRITICAL: ONLY spades are playable
            console.log(`[BOT SERVICE] ASSASSIN: Bot ${botUsername} MUST cut with spades, available:`, spades.map(c => `${c.suit}${c.rank}`));
          } else {
            console.log(`[BOT SERVICE] ASSASSIN: Bot ${botUsername} has no spades to cut with!`);
            // If no spades, bot cannot play any card (this should never happen in a valid game)
            playableCards = [];
          }
        }
        
        // SCREAMER: Cannot play spades unless only have spades
        if (isScreamerSeat) {
          const nonSpades = normalizedHand.filter(card => card.suit !== 'SPADES');
          if (nonSpades.length > 0) {
            playableCards = playableCards.filter(card => card.suit !== 'SPADES');
            console.log(`[BOT SERVICE] SCREAMER: Bot ${botUsername} cannot play spades, has non-spades available`);
          }
        }
        
        // LOW/HIGHBALL among legal options when void
        if (playableCards.length > 0) {
          const order = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
          if (rule2 === 'LOWBALL') {
            // Choose lowest within a chosen suit (first legal suit)
            const suits = [...new Set(playableCards.map(c=>c.suit))];
            const targetSuit = suits[0];
            const inSuit = playableCards.filter(c=>c.suit===targetSuit);
            cardToPlay = inSuit.sort((a,b)=>order[a.rank]-order[b.rank])[0];
          } else if (rule2 === 'HIGHBALL') {
            // Choose highest within a chosen suit (first legal suit)
            const suits = [...new Set(playableCards.map(c=>c.suit))];
            const targetSuit = suits[0];
            const inSuit = playableCards.filter(c=>c.suit===targetSuit);
            cardToPlay = inSuit.sort((a,b)=>order[a.rank]-order[b.rank])[inSuit.length-1];
          } else {
            cardToPlay = playableCards.sort((a,b)=>order[a.rank]-order[b.rank])[0];
          }
          console.log(`[BOT SERVICE] Bot ${botUsername} is void in ${leadSuit}, choosing ${cardToPlay.suit}${cardToPlay.rank}`);
        } else {
          // CRITICAL: If special rules left no valid cards, ignore special rules and play any card
          console.error(`[BOT SERVICE] ERROR: Special rules left bot ${botUsername} with no valid cards! Ignoring special rules.`);
          cardToPlay = normalizedHand.sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank))[0];
          console.log(`[BOT SERVICE] Bot ${botUsername} emergency fallback, playing ${cardToPlay.suit}${cardToPlay.rank}`);
        }
      }
    }

    if (!cardToPlay) {
      cardToPlay = hand[0]; // Fallback
    }

    // CRITICAL: Final validation - ensure card is legal for Assassin mode
    if (isAssassinSeat && currentTrickCards.length > 0) {
      const leadSuit = currentTrickCards[0].suit;
      const hasLeadSuit = (hand.map(BotService.normalizeCard)).some(card => card.suit === leadSuit);
      
      if (!hasLeadSuit && cardToPlay.suit !== 'SPADES') {
        console.error(`[BOT SERVICE] ASSASSIN VALIDATION FAILED: Bot ${botUsername} is void in ${leadSuit} but chose ${cardToPlay.suit}${cardToPlay.rank} instead of spades!`);
        // Force bot to play a spade
        const spades = normalizedHand.filter(card => card.suit === 'SPADES');
        if (spades.length > 0) {
          cardToPlay = spades.sort((a, b) => this.getCardValue(a.rank) - this.getCardValue(b.rank))[0];
          console.log(`[BOT SERVICE] ASSASSIN CORRECTION: Bot ${botUsername} forced to play ${cardToPlay.suit}${cardToPlay.rank}`);
        } else {
          console.error(`[BOT SERVICE] ASSASSIN ERROR: Bot ${botUsername} has no spades to cut with!`);
          return null;
        }
      }
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
      console.error(`[BOT SERVICE] ERROR: Bot ${botUsername} chose card ${cardToPlay.suit}${cardToPlay.rank} but it's not in their hand!`);
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
        console.error(`[BOT SERVICE] ERROR: Bot ${botUsername} has no cards at all!`);
        return null;
      }
    }


    console.log(`[BOT SERVICE] Bot ${botUsername} playing ${cardToPlay.suit}${cardToPlay.rank}`);

    // Don't remove card from hand here - CardPlayHandler.processCardPlay() will do it
    // Just return the card choice - the handler will log it to the database

    return cardToPlay;
    } catch (error) {
      console.error(`[BOT SERVICE] ERROR in playBotCard for bot ${bot?.username || bot?.user?.username || 'unknown'}:`, error);
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

      // Get special rules and robust spadesBroken status
      const specialRules = game.specialRules || {};
      // Single source of truth
      const spadesBroken = await SpadesRuleService.areSpadesBroken(game.id);

      // Determine Secret Assassin seat and role flags
      const rule1 = specialRules.specialRule1 || (specialRules.assassin ? 'ASSASSIN' : (specialRules.screamer ? 'SCREAMER' : 'NONE'));
      let secretSeat = (game.play?.secretAssassinSeat ?? specialRules.secretAssassinSeat ?? game.specialRules?.secretAssassinSeat);
      if (!secretSeat && rule1 === 'SECRET_ASSASSIN') {
        try {
          const playerHands = hands;
          if (playerHands && playerHands.length >= 4) {
            for (let s = 0; s < 4; s++) {
              const seatHand = (playerHands[s] || []).map(BotService.normalizeCard);
              if (seatHand.some(card => card.suit === 'SPADES' && card.rank === 'A')) {
                secretSeat = s;
                break;
              }
            }
          }
        } catch {}
      }
      const isAssassinSeat = (rule1 === 'ASSASSIN') || (rule1 === 'SECRET_ASSASSIN' && secretSeat === seatIndex);
      const isScreamerSeat = (rule1 === 'SCREAMER') || (rule1 === 'SECRET_ASSASSIN' && secretSeat !== seatIndex);

      // Feature toggle for new AI policy
      if (process.env.BOT_AI_V2 === 'true') {
        const ctx = this.buildDecisionContext(game, seatIndex, hand, currentTrickCards, spadesBroken);
        cardToPlay = this.selectCardV2(ctx);
        if (cardToPlay) {
          console.log(`[BOT SERVICE][AI_V2] Selected ${cardToPlay.suit}${cardToPlay.rank} by policy`, { scenario: ctx.scenario });
          return cardToPlay;
        }
        console.warn('[BOT SERVICE][AI_V2] Fallback to legacy logic');
      }

      // Card selection logic (same as playBotCard)
      if (currentTrickCards.length === 0) {
        // Leading
        cardToPlay = this.getLeadCard(hand, game, specialRules, spadesBroken, isAssassinSeat);
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
          
          if (isAssassinSeat) {
            const spades = normalizedHand.filter(card => card.suit === 'SPADES');
            if (spades.length > 0) {
              playableCards = spades;
            }
          }
          
          if (isScreamerSeat) {
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

  // =====================
  // AI V2: Decision Context
  // =====================
  buildDecisionContext(game, seatIndex, hand, currentTrickCards, spadesBroken) {
    // Normalize hand to objects {suit, rank}
    const norm = (c) => (typeof c === 'string' ? { suit: c.slice(0, c.length - 1), rank: c.slice(-1) } : c);
    const normalizedHand = hand.map(norm);

    const partnerSeat = (seatIndex + 2) % 4;
    const partner = game.players[partnerSeat];
    const bidsArray = game.bidding?.bids || []; // seat-indexed when available
    const myBid = bidsArray?.[seatIndex] ?? game.players[seatIndex]?.bid ?? (game.bids?.find(b => b.userId === game.players[seatIndex]?.id)?.bid ?? null);
    const partnerBid = bidsArray?.[partnerSeat] ?? partner?.bid ?? (game.bids?.find(b => b.userId === partner?.id)?.bid ?? null);
    const oppSeats = [0,1,2,3].filter(s => s !== seatIndex && s !== partnerSeat);
    const oppBids = oppSeats.map(s => bidsArray?.[s] ?? null);
    const tableBidTotal = [myBid, partnerBid, ...oppBids].reduce((a,b)=>a+(Number.isFinite(b)?b:0),0);

    const tricksTakenBySeat = game.trickWins || [0,0,0,0];
    const teamTricks = (tricksTakenBySeat[seatIndex] || 0) + (tricksTakenBySeat[partnerSeat] || 0);

    const trick = currentTrickCards || [];
    const leadSuit = trick.length > 0 ? trick[0].suit : null;
    const positionInTrick = trick.length; // 0 lead, 1 second, 2 third, 3 last
    const isLeading = positionInTrick === 0;
    const isLast = positionInTrick === 3;
    const partnerHasPlayed = trick.some(c => c.seatIndex === partnerSeat);
    const partnerCard = partnerHasPlayed ? trick.find(c => c.seatIndex === partnerSeat) : null;

    const scenario = (game.players[seatIndex]?.isNil || myBid === 0)
      ? 'self_nil'
      : ((partner?.isNil || partnerBid === 0) ? 'cover_nil' : (tableBidTotal >= 12 ? 'high_pressure' : 'normal'));

    return {
      game,
      seatIndex,
      partnerSeat,
      hand: normalizedHand,
      myBid: typeof myBid === 'number' ? myBid : null,
      partnerBid: typeof partnerBid === 'number' ? partnerBid : null,
      oppBids,
      tableBidTotal,
      teamTricks,
      spadesBroken: !!spadesBroken,
      trick,
      leadSuit,
      positionInTrick,
      isLeading,
      isLast,
      partnerHasPlayed,
      partnerCard,
      scenario,
      specialRules: game.specialRules || {} // CRITICAL: Include special rules for Assassin/Screamer enforcement
    };
  }

  // =====================
  // AI V2: Selection policy
  // =====================
  selectCardV2(ctx) {
    switch (ctx.scenario) {
      case 'self_nil':
        return this.playSelfNil(ctx);
      case 'cover_nil':
        return this.playCoverNil(ctx);
      case 'high_pressure':
        return this.playHighPressure(ctx);
      default:
        return this.playNormalPressure(ctx);
    }
  }

  // Helpers
  sortByRankAsc(cards) { return [...cards].sort((a,b)=> this.getCardValue(a.rank) - this.getCardValue(b.rank)); }
  sortByRankDesc(cards) { return [...cards].sort((a,b)=> this.getCardValue(b.rank) - this.getCardValue(a.rank)); }
  groupBySuit(cards) { return cards.reduce((m,c)=>(m[c.suit]=(m[c.suit]||[]).concat(c),m),{}); }

  currentHighestOfSuit(ctx, suit) {
    const inSuit = ctx.trick.filter(c => c.suit === suit);
    if (inSuit.length === 0) return null;
    return this.sortByRankDesc(inSuit)[0];
  }

  canWinFollowing(ctx, card) {
    // If following suit, it wins if rank > current highest of lead suit and no spade trump already played
    const { trick, leadSuit } = ctx;
    if (!leadSuit) return true; // leading case handled elsewhere
    if (card.suit !== leadSuit) return false;
    const highestLead = this.currentHighestOfSuit(ctx, leadSuit);
    // if any spade already in trick, only spades can win
    const spadeInTrick = trick.some(c => c.suit === 'SPADES');
    if (spadeInTrick) return false;
    return !highestLead || this.getCardValue(card.rank) > this.getCardValue(highestLead.rank);
  }

  minimalWinningFollowing(ctx, hand) {
    const { leadSuit } = ctx;
    const leadSuitCards = hand.filter(c => c.suit === leadSuit);
    const sorted = this.sortByRankAsc(leadSuitCards);
    for (const c of sorted) {
      if (this.canWinFollowing(ctx, c)) return c;
    }
    return null;
  }

  minimalSpadeToWin(ctx, hand) {
    // If void, try to win with the lowest spade higher than any spade in trick, else any lowest spade
    const spades = this.sortByRankAsc(hand.filter(c => c.suit === 'SPADES'));
    if (spades.length === 0) return null;
    const spadesInTrick = this.sortByRankAsc(ctx.trick.filter(c => c.suit === 'SPADES'));
    if (spadesInTrick.length === 0) return spades[0];
    const highestTrickSpade = spadesInTrick[spadesInTrick.length - 1];
    for (const s of spades) {
      if (this.getCardValue(s.rank) > this.getCardValue(highestTrickSpade.rank)) return s;
    }
    return null;
  }

  playHighPressure(ctx) {
    const { hand, isLeading, leadSuit, trick, partnerSeat, partnerHasPlayed, partnerCard, spadesBroken } = ctx;
    const suits = this.groupBySuit(hand);
    if (isLeading) {
      // Lead Aces first (prefer non-spade unless only spades or broken)
      const nonSpades = ['HEARTS','DIAMONDS','CLUBS'];
      for (const s of nonSpades) {
        const cards = suits[s] || [];
        const ace = cards.find(c => c.rank === 'A');
        if (ace) return ace;
      }
      // Ace of spades if legal
      const spAce = (suits['SPADES']||[]).find(c => c.rank === 'A');
      if (spAce && (spadesBroken || Object.keys(suits).length === 1)) return spAce;
      // Else lead from longest suit, highest-first if likely to carry, else lowest safe
      let longestSuit = null; let longestLen = 0;
      Object.keys(suits).forEach(s => { if (suits[s].length > longestLen) { longestSuit=s; longestLen=suits[s].length; } });
      if (longestSuit && (longestSuit !== 'SPADES' || spadesBroken)) {
        const sorted = this.sortByRankDesc(suits[longestSuit]);
        return sorted[0];
      }
      // Fallback: lowest non-spade, else lowest
      const nonSp = hand.filter(c => c.suit !== 'SPADES');
      return this.sortByRankAsc(nonSp.length?nonSp:hand)[0];
    }

    // Following
    const leadCards = hand.filter(c => c.suit === leadSuit);
    if (leadCards.length > 0) {
      const winning = this.minimalWinningFollowing(ctx, hand);
      if (winning) {
        // Do not over partner's sure win
        if (partnerHasPlayed && partnerCard && partnerCard.suit === leadSuit) {
          const partnerWinning = this.canWinFollowing(ctx, partnerCard);
          if (partnerWinning) {
            // partner already winning, dump lowest lead-suit
            return this.sortByRankAsc(leadCards)[0];
          }
        }
        return winning;
      }
      // cannot win -> dump lowest of lead suit
      return this.sortByRankAsc(leadCards)[0];
    }

    // Void in lead suit
    // If opponent currently winning, try to cut with minimal spade that wins
    const cut = this.minimalSpadeToWin(ctx, hand);
    if (cut) return cut;
    // Else dump lowest losing (prefer non-spades)
    const nonSp = hand.filter(c => c.suit !== 'SPADES');
    return this.sortByRankAsc(nonSp.length?nonSp:hand)[0];
  }

  playNormalPressure(ctx) {
    const { hand, isLeading, leadSuit, partnerHasPlayed, partnerCard, specialRules, spadesBroken } = ctx;
    const suits = this.groupBySuit(hand);
    if (isLeading) {
      // ASSASSIN: Must lead spades if broken and have spades
      if (specialRules.assassin && spadesBroken) {
        const spades = suits['SPADES'] || [];
        if (spades.length > 0) {
          console.log(`[BOT SERVICE][AI_V2] ASSASSIN: Bot MUST lead spades (broken), available:`, spades.map(c => `${c.suit}${c.rank}`));
          return this.sortByRankAsc(spades)[0]; // Play lowest spade
        } else {
          console.log(`[BOT SERVICE][AI_V2] ASSASSIN: Bot has no spades to lead with!`);
        }
      }
      
      // Lead safe low from longest non-spade; avoid leading easy overtake
      let bestSuit = null; let bestLen = 0;
      ['HEARTS','DIAMONDS','CLUBS'].forEach(s => { const len=(suits[s]||[]).length; if (len>bestLen){bestLen=len; bestSuit=s;} });
      if (bestSuit) return this.sortByRankAsc(suits[bestSuit])[0];
      // fallback: lowest overall (avoid spade if not broken is enforced elsewhere on lead legality)
      return this.sortByRankAsc(hand)[0];
    }
    // Following
    const leadCards = hand.filter(c => c.suit === leadSuit);
    if (leadCards.length > 0) {
      // If partner is winning, support them by dumping
      if (partnerHasPlayed && partnerCard && partnerCard.suit === leadSuit && this.canWinFollowing(ctx, partnerCard)) {
        return this.sortByRankAsc(leadCards)[0];
      }
      // Try to win, else play high to force opponents to use good cards
      const win = this.minimalWinningFollowing(ctx, hand);
      return win || this.sortByRankDesc(leadCards)[0];
    }
    // Void: apply special rules first
    
    // ASSASSIN: Must cut with spades when void
    if (specialRules.assassin) {
      const spades = hand.filter(c => c.suit === 'SPADES');
      if (spades.length > 0) {
        console.log(`[BOT SERVICE][AI_V2] ASSASSIN: Bot MUST cut with spades, available:`, spades.map(c => `${c.suit}${c.rank}`));
        return this.sortByRankAsc(spades)[0]; // Play lowest spade
      } else {
        console.log(`[BOT SERVICE][AI_V2] ASSASSIN: Bot has no spades to cut with!`);
        // If no spades, play any card (should never happen in valid game)
        return this.sortByRankDesc(hand)[0];
      }
    }
    
    // SCREAMER: Cannot play spades unless only have spades
    if (specialRules.screamer) {
      const nonSpades = hand.filter(c => c.suit !== 'SPADES');
      if (nonSpades.length > 0) {
        console.log(`[BOT SERVICE][AI_V2] SCREAMER: Bot cannot play spades, has non-spades available`);
        return this.sortByRankDesc(nonSpades)[0];
      }
    }
    
    // Default void behavior: try to cut and win tricks
    const spades = hand.filter(c => c.suit === 'SPADES');
    if (spades.length > 0) {
      const cut = this.minimalSpadeToWin(ctx, hand);
      return cut || this.sortByRankAsc(spades)[0];
    }
    // No spades, dump lowest non-spade
    const nonSp = hand.filter(c => c.suit !== 'SPADES');
    return this.sortByRankAsc(nonSp.length ? nonSp : hand)[0];
  }

  playCoverNil(ctx) {
    const { hand, isLeading, partnerSeat, trick, leadSuit, partnerHasPlayed, partnerCard, spadesBroken } = ctx;
    const suits = this.groupBySuit(hand);
    if (isLeading) {
      // Lead high winners to cover; prefer spades if broken since we can win them
      // If spades broken and have good spades, lead spades to take tricks
      const spades = this.sortByRankDesc(suits['SPADES']||[]);
      if (spades.length && spadesBroken) {
        // Lead high spades to take tricks when broken
        return spades[0];
      }
      // Otherwise lead high from non-spades
      const nonSp = ['HEARTS','DIAMONDS','CLUBS'];
      for (const s of nonSp) {
        const cards = this.sortByRankDesc(suits[s]||[]);
        if (cards.length) return cards[0];
      }
      // Fallback: any high card
      return this.sortByRankDesc(hand)[0];
    }
    // Following after nil partner already played
    if (partnerHasPlayed) {
      // If nil partner is safe (won't win), don't waste; otherwise take with Q (if hold QKA), else with minimal winning
      const partnerSafe = (()=>{
        if (!partnerCard) return true;
        if (leadSuit && partnerCard.suit !== leadSuit) return true; // void, likely safe unless cutting
        return !this.canWinFollowing(ctx, partnerCard);
      })();
      if (partnerSafe) {
        // Dump lowest legal card
        const leadCards = hand.filter(c => c.suit === leadSuit);
        if (leadCards.length) return this.sortByRankAsc(leadCards)[0];
        const nonSp = hand.filter(c => c.suit !== 'SPADES');
        return this.sortByRankAsc(nonSp.length?nonSp:hand)[0];
      }
      // Need to win to cover
      const leadCards = hand.filter(c => c.suit === leadSuit);
      if (leadCards.length) {
        // If holding QKA, prefer Q to take control
        const q = leadCards.find(c => c.rank === 'Q');
        const k = leadCards.find(c => c.rank === 'K');
        const a = leadCards.find(c => c.rank === 'A');
        if (q && k && a) return q;
        const win = this.minimalWinningFollowing(ctx, hand);
        if (win) return win;
        return this.sortByRankAsc(leadCards)[0];
      }
      // Void: try to win with minimal spade; else dump lowest
      const cut = this.minimalSpadeToWin(ctx, hand);
      if (cut) return cut;
      const nonSp = hand.filter(c => c.suit !== 'SPADES');
      return this.sortByRankAsc(nonSp.length?nonSp:hand)[0];
    }
    // Following before nil partner: play aggressively to try to win or force opponents to play high
    const leadCards = hand.filter(c => c.suit === leadSuit);
    if (leadCards.length) {
      // Try to win with minimal card, else play high to force opponents to burn cards
      const win = this.minimalWinningFollowing(ctx, hand);
      if (win) return win;
      // No win possible, play high to force opponent to burn
      return this.sortByRankDesc(leadCards)[0];
    }
    // Void: must cut with spades if possible to prevent nil partner from winning
    const spades = hand.filter(c => c.suit === 'SPADES');
    if (spades.length > 0) {
      // Play lowest spade that might win, or just lowest to cut
      const cut = this.minimalSpadeToWin(ctx, hand);
      return cut || this.sortByRankAsc(spades)[0];
    }
    // No spades, dump lowest
    const nonSp = hand.filter(c => c.suit !== 'SPADES');
    return this.sortByRankAsc(nonSp.length?nonSp:hand)[0];
  }

  playSelfNil(ctx) {
    const { hand, isLeading, leadSuit, trick } = ctx;
    const suits = this.groupBySuit(hand);
    if (isLeading) {
      // Lead suits where we have safely low cards; avoid high leads
      const candidates = ['HEARTS','DIAMONDS','CLUBS','SPADES'];
      for (const s of candidates) {
        const cards = this.sortByRankAsc(suits[s]||[]);
        if (cards.length) return cards[0];
      }
      return this.sortByRankAsc(hand)[0];
    }
    // Following
    const leadCards = hand.filter(c => c.suit === leadSuit);
    if (leadCards.length) {
      // Play highest that still loses to current highest
      const currentHighest = this.currentHighestOfSuit(ctx, leadSuit);
      const losing = this.sortByRankDesc(leadCards).find(c => this.getCardValue(c.rank) < (currentHighest ? this.getCardValue(currentHighest.rank) : 99));
      if (losing) return losing;
      // If all would win, choose smallest risk: the lowest
      return this.sortByRankAsc(leadCards)[0];
    }
    // Void: never cut unless someone already cut and we can play lower spade than existing spade
    const trickSpades = trick.filter(c => c.suit === 'SPADES');
    if (trickSpades.length > 0) {
      const lowestTrickSpade = this.sortByRankAsc(trickSpades)[0];
      const mySpades = this.sortByRankAsc(hand.filter(c => c.suit === 'SPADES'));
      const safeLower = mySpades.find(s => this.getCardValue(s.rank) < this.getCardValue(lowestTrickSpade.rank));
      if (safeLower) return safeLower;
    }
    // Prefer discarding highest risky non-trumps first
    const nonSp = hand.filter(c => c.suit !== 'SPADES');
    const dumpPool = nonSp.length ? nonSp : hand;
    return this.sortByRankDesc(dumpPool)[0];
  }

  /**
   * Get best card to lead with
   */
  getLeadCard(hand, game = null, specialRules = {}, spadesBrokenParam = false, isAssassinSeat = false) {
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
    if (isAssassinSeat && spadesBroken && suits['SPADES'] && suits['SPADES'].length > 0) {
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
