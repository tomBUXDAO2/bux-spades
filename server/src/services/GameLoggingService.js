import { prisma } from '../config/database.js';
import redisGameState from './RedisGameStateService.js';

// PERFORMANCE: In-memory cache for lead suits to avoid database queries
const leadSuitCache = new Map(); // trickId -> leadSuit

export class GameLoggingService {
  /**
   * Clear lead suit cache for a trick (call when trick is complete)
   * @param {string} trickId - The trick ID to clear from cache
   */
  static clearLeadSuitCache(trickId) {
    leadSuitCache.delete(trickId);
  }
  /**
   * Log a game action to the database
   * @param {string} gameId - The game ID
   * @param {string} action - The action type (bid, play_card, trick_complete, etc.)
   * @param {Object} data - Action-specific data
   * @param {string} userId - User who performed the action
   * @param {number} seatIndex - Seat index of the player
   */
  static async logGameAction(gameId, action, data, userId, seatIndex) {
    try {
      // Skip logging if gameActionLog doesn't exist
      console.log(`[GAME LOGGING] Skipping action ${action} for game ${gameId}:`, data);
      return null;
    } catch (error) {
      // NUCLEAR: No logging for performance
      return null;
    }
  }

  /**
   * Log a bid action
   * @param {string} gameId - The game ID
   * @param {string} roundId - The round ID
   * @param {string} userId - User who bid
   * @param {number} seatIndex - Seat index
   * @param {number} bid - The bid amount
   * @param {boolean} isNil - Whether it's a nil bid
   * @param {boolean} isBlindNil - Whether it's a blind nil bid
   */
  static async logBid(gameId, roundId, userId, seatIndex, bid, isBlindNil = false) {
    try {
      // Update PlayerRoundStats with bid
      await prisma.playerRoundStats.updateMany({
        where: {
          roundId: roundId,
          userId: userId
        },
        data: {
          bid: bid,
          isBlindNil: isBlindNil
        }
      });
      
      // Don't clear Redis cache - we want to keep the bids in Redis
      // The Redis bids will be updated separately in the bidding handler
      
      console.log(`[GAME LOGGING] Logged bid: user=${userId}, bid=${bid}, blind=${isBlindNil}`);
      return true;
    } catch (error) {
      console.error('[GAME LOGGING] Error logging bid:', error);
      throw error;
    }
  }

  /**
   * Log a card play action
   * @param {string} gameId - The game ID
   * @param {string} roundId - The round ID
   * @param {string} trickId - The trick ID
   * @param {string} userId - User who played the card
   * @param {number} seatIndex - Seat index
   * @param {string} suit - Card suit
   * @param {string} rank - Card rank
   * @param {number} playOrder - Order in which the card was played
   * @param {number} trickNumber - Trick number in the round (default: 1)
   */
  static async logCardPlay(gameId, roundId, trickId, userId, seatIndex, suit, rank, playOrder, trickNumber = 1) {
    try {
      // First, ensure the Trick exists in the database
      let trickRecord = null;
      
      // If trickId is provided, try to find it
      if (trickId) {
        trickRecord = await prisma.trick.findUnique({
          where: { id: trickId }
        });
      }
      
      // If trick doesn't exist and trickId is provided, that's an error
      if (trickId && !trickRecord) {
        throw new Error(`Trick with id ${trickId} not found`);
      }
      
      // If no trickId provided, create a new trick
      if (!trickRecord) {
        // NUCLEAR: No logging for performance
        try {
          // First check if a trick already exists for this round/trickNumber combination
          const existingTrick = await prisma.trick.findFirst({
            where: {
              roundId: roundId,
              trickNumber: trickNumber
            }
          });

          if (existingTrick) {
            // NUCLEAR: No logging for performance
            trickRecord = existingTrick;
          } else {
            const trickData = {
              roundId: roundId,
              trickNumber: trickNumber,
              leadSeatIndex: seatIndex,
              winningSeatIndex: null
            };
            
            // Only set id if trickId is provided and not null
            if (trickId) {
              trickData.id = trickId;
            }
            
            // CRITICAL FIX: Do NOT create tricks in logging service
            // Tricks should only be created by the main game logic
            console.error(`[GAME LOGGING] ERROR: Attempted to create trick in logging service - this should not happen!`);
            throw new Error('Trick creation attempted in logging service');
            // NUCLEAR: No logging for performance
          }
        } catch (createError) {
          // NUCLEAR: No logging for performance
          throw createError;
        }
      } else {
        // NUCLEAR: No logging for performance
      }

      // Guards before inserting a card
      // 1) Do not allow more than 4 cards in a trick
      const existingCardsCount = await prisma.trickCard.count({ where: { trickId: trickRecord.id } });
      if (existingCardsCount >= 4) {
        console.log(`[GAME LOGGING] Guard: trick ${trickRecord.id} already has ${existingCardsCount} cards. Skipping insert.`);
        return { cardRecord: null, actualTrickId: trickRecord.id, playOrder: existingCardsCount, rejected: true };
      }
      // 2) Do not allow the same seat to play twice in a trick
      const seatAlreadyPlayed = await prisma.trickCard.findFirst({ where: { trickId: trickRecord.id, seatIndex } });
      if (seatAlreadyPlayed) {
        console.log(`[GAME LOGGING] Guard: seat ${seatIndex} already played in trick ${trickRecord.id}. Skipping insert.`);
        return { cardRecord: null, actualTrickId: trickRecord.id, playOrder: existingCardsCount, rejected: true };
      }
      
      // 3) CRITICAL: Enforce suit following rules and special rules (optimized with cache)
      
      // Get game for special rules validation
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        select: { specialRules: true }
      });
      
      const specialRules = game?.specialRules || {};
      
      // Get player hand for all validations
      const playerHand = await redisGameState.getPlayerHands(gameId);
      const currentHand = playerHand && playerHand[seatIndex] ? playerHand[seatIndex] : [];
      
      // Get spades broken status (robust): check flag AND trick history/current trick
      const cachedGameState = await redisGameState.getGameState(gameId);
      let spadesBroken = cachedGameState?.play?.spadesBroken || false;
      try {
        // Check completed tricks for any spade
        const completed = cachedGameState?.play?.completedTricks || [];
        if (!spadesBroken && Array.isArray(completed) && completed.length > 0) {
          for (const t of completed) {
            if (Array.isArray(t?.cards) && t.cards.some((c)=>c && c.suit === 'SPADES')) { spadesBroken = true; break; }
          }
        }
        // Check current trick (in-progress) for any spade
        const cur = cachedGameState?.play?.currentTrick || [];
        if (!spadesBroken && Array.isArray(cur) && cur.some((c)=>c && c.suit === 'SPADES')) {
          spadesBroken = true;
        }
      } catch {}
      
      // Determine per-seat rule for Secret Assassin
      let isAssassinSeat = false;
      try {
        let secretSeat = cachedGameState?.play?.secretAssassinSeat ?? specialRules?.secretAssassinSeat;
        // Fallback: derive secret seat from Redis hands if not present in state
        if (specialRules?.specialRule1 === 'SECRET_ASSASSIN' && (secretSeat === undefined || secretSeat === null)) {
          try {
            // playerHand is already loaded above from Redis
            if (Array.isArray(playerHand)) {
              for (let s = 0; s < playerHand.length; s++) {
                const hasAceOfSpades = (playerHand[s] || []).some(c => c && c.suit === 'SPADES' && c.rank === 'A');
                if (hasAceOfSpades) { secretSeat = s; break; }
              }
            }
          } catch {}
        }
        if (specialRules?.specialRule1 === 'SECRET_ASSASSIN' && (secretSeat === 0 || secretSeat === 1 || secretSeat === 2 || secretSeat === 3)) {
          isAssassinSeat = (seatIndex === secretSeat);
        }
      } catch {}

      const rule1 = specialRules?.specialRule1;
      const rule2 = specialRules?.specialRule2;

      const ruleAssassin = (rule1 === 'ASSASSIN') || (rule1 === 'SECRET_ASSASSIN' && isAssassinSeat);
      const ruleScreamer = (rule1 === 'SCREAMER') || (rule1 === 'SECRET_ASSASSIN' && !isAssassinSeat && rule1 === 'SECRET_ASSASSIN');

      // Validate leading card
      if (existingCardsCount === 0) {
        // Player is leading the trick
        
        // CORE RULE: Cannot lead spades until broken unless only have spades
        if (!spadesBroken && suit === 'SPADES') {
          const hasNonSpades = currentHand.some(card => card.suit !== 'SPADES');
          if (hasNonSpades) {
            console.log(`[GAME LOGGING] CORE: seat ${seatIndex} cannot lead spades before broken. Rejecting.`);
            return { cardRecord: null, actualTrickId: trickRecord.id, playOrder: 0, rejected: true };
          }
        }

        // ASSASSIN: Must lead spades if broken and has spades
        if (ruleAssassin && spadesBroken && suit !== 'SPADES') {
          const hasSpades = currentHand.some(card => card.suit === 'SPADES');
          if (hasSpades) {
            console.log(`[GAME LOGGING] ASSASSIN: seat ${seatIndex} must lead spades (broken) but played ${suit}. Rejecting.`);
            return { cardRecord: null, actualTrickId: trickRecord.id, playOrder: 0, rejected: true };
          }
        }
        
        // SCREAMER: Cannot lead spades unless only have spades
        if (ruleScreamer && suit === 'SPADES') {
          const hasNonSpades = currentHand.some(card => card.suit !== 'SPADES');
          if (hasNonSpades) {
            console.log(`[GAME LOGGING] SCREAMER: seat ${seatIndex} cannot lead spades, has non-spades. Rejecting.`);
            return { cardRecord: null, actualTrickId: trickRecord.id, playOrder: 0, rejected: true };
          }
        }
      }
      
      // Validate following card
      if (existingCardsCount > 0) {
        // PERFORMANCE: Get lead suit from cache first, fallback to database
        let leadCard = null;
        let leadSuit = leadSuitCache.get(trickRecord.id);
        
        if (leadSuit) {
          // Use cached lead suit
          leadCard = { suit: leadSuit };
        } else {
          // Cache miss - get from database and cache it
          leadCard = await prisma.trickCard.findFirst({
            where: { trickId: trickRecord.id },
            orderBy: { playOrder: 'asc' }
          });
          
          if (leadCard) {
            leadSuitCache.set(trickRecord.id, leadCard.suit);
          }
        }
        
        if (leadCard && leadCard.suit !== suit) {
          // Player is not following suit - check if they have cards of the lead suit
          const hasLeadSuit = currentHand.some(card => 
            card.suit === leadCard.suit
          );
          
          if (hasLeadSuit) {
            console.log(`[GAME LOGGING] Guard: seat ${seatIndex} must follow suit ${leadCard.suit} but played ${suit}. Rejecting card play.`);
            return { cardRecord: null, actualTrickId: trickRecord.id, playOrder: existingCardsCount, rejected: true };
          } else {
            // Player is void in lead suit - check special rules
            console.log(`[GAME LOGGING] Seat ${seatIndex} is void in lead suit ${leadCard.suit}, playing ${suit} is valid`);
            
            // ASSASSIN: Must cut with spades when void
            if (ruleAssassin && suit !== 'SPADES') {
              const hasSpades = currentHand.some(card => card.suit === 'SPADES');
              if (hasSpades) {
                console.log(`[GAME LOGGING] ASSASSIN: seat ${seatIndex} must cut with spades but played ${suit}. Rejecting.`);
                return { cardRecord: null, actualTrickId: trickRecord.id, playOrder: existingCardsCount, rejected: true };
              }
            }
            
            // SCREAMER: Cannot play spades unless only have spades (never applies to Assassin seat)
            if (!ruleAssassin && ruleScreamer && suit === 'SPADES') {
              const hasNonSpades = currentHand.some(card => card.suit !== 'SPADES');
              if (hasNonSpades) {
                console.log(`[GAME LOGGING] SCREAMER: seat ${seatIndex} cannot play spades, has non-spades. Rejecting.`);
                return { cardRecord: null, actualTrickId: trickRecord.id, playOrder: existingCardsCount, rejected: true };
              }
            }
          }
        }
      }

      // LOWBALL / HIGHBALL enforcement among legal options
      try {
        if (rule2 === 'LOWBALL' || rule2 === 'HIGHBALL') {
          // Build legal set based on rules already checked above
          let legal = [];
          if (existingCardsCount === 0) {
            // Leading
            legal = currentHand.slice();
            if (ruleAssassin && spadesBroken) {
              const sp = currentHand.filter(c => c.suit === 'SPADES');
              if (sp.length > 0) legal = sp;
            }
            if (!ruleAssassin && ruleScreamer) {
              const nonSp = currentHand.filter(c => c.suit !== 'SPADES');
              if (nonSp.length > 0) legal = nonSp;
            }
          } else {
            // Following
            const leadSuit = leadSuitCache.get(trickRecord.id) || leadCard?.suit || (await prisma.trickCard.findFirst({ where: { trickId: trickRecord.id }, orderBy: { playOrder: 'asc' } }))?.suit;
            const hasLead = currentHand.some(c => c.suit === leadSuit);
            if (hasLead) {
              legal = currentHand.filter(c => c.suit === leadSuit);
            } else {
              legal = currentHand.slice();
              if (ruleAssassin) {
                const sp = currentHand.filter(c => c.suit === 'SPADES');
                if (sp.length > 0) legal = sp;
              }
              if (!ruleAssassin && ruleScreamer) {
                const nonSp = currentHand.filter(c => c.suit !== 'SPADES');
                if (nonSp.length > 0) legal = nonSp;
              }
            }
          }

          // Rank ordering helper
          const order = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14 };
          const chosen = { suit, rank };
          
          if (rule2 === 'LOWBALL') {
            if (existingCardsCount === 0) {
              // When leading: must be lowest card in the chosen suit (from legal set)
              const suitCards = legal.filter(c => c.suit === suit);
              const sortedSuit = suitCards.sort((a,b) => order[a.rank] - order[b.rank]);
              const lowestInSuit = sortedSuit[0];
              if (!lowestInSuit || lowestInSuit.suit !== chosen.suit || lowestInSuit.rank !== chosen.rank) {
                console.log(`[GAME LOGGING] LOWBALL: seat ${seatIndex} must play lowest ${lowestInSuit?.suit}${lowestInSuit?.rank} in ${suit} but tried ${suit}${rank}. Rejecting.`);
                return { cardRecord: null, actualTrickId: trickRecord.id, playOrder: existingCardsCount, rejected: true };
              }
            } else {
              // When following:
              // - If player has lead suit: must be lowest card in lead suit (current legal will only be lead suit)
              // - If void in lead suit: must be lowest card in the CHOSEN suit among legal suits
              const leadSuit = leadSuitCache.get(trickRecord.id) || leadCard?.suit || (await prisma.trickCard.findFirst({ where: { trickId: trickRecord.id }, orderBy: { playOrder: 'asc' } }))?.suit;
              const hasLead = currentHand.some(c => c.suit === leadSuit);
              if (hasLead) {
                const sorted = legal.sort((a,b)=> order[a.rank]-order[b.rank]);
                const lowest = sorted[0];
                if (lowest.suit !== chosen.suit || lowest.rank !== chosen.rank) {
                  console.log(`[GAME LOGGING] LOWBALL: seat ${seatIndex} must play lowest ${lowest.suit}${lowest.rank} (lead suit) but tried ${suit}${rank}. Rejecting.`);
                  return { cardRecord: null, actualTrickId: trickRecord.id, playOrder: existingCardsCount, rejected: true };
                }
              } else {
                const suitCards = legal.filter(c => c.suit === suit);
                const sortedSuit = suitCards.sort((a,b) => order[a.rank] - order[b.rank]);
                const lowestInChosenSuit = sortedSuit[0];
                if (!lowestInChosenSuit || lowestInChosenSuit.suit !== chosen.suit || lowestInChosenSuit.rank !== chosen.rank) {
                  console.log(`[GAME LOGGING] LOWBALL: seat ${seatIndex} (void) must play lowest ${lowestInChosenSuit?.suit}${lowestInChosenSuit?.rank} in ${suit} but tried ${suit}${rank}. Rejecting.`);
                  return { cardRecord: null, actualTrickId: trickRecord.id, playOrder: existingCardsCount, rejected: true };
                }
              }
            }
          }
          
          if (rule2 === 'HIGHBALL') {
            if (existingCardsCount === 0) {
              // When leading: must be highest card in the chosen suit (from legal set)
              const suitCards = legal.filter(c => c.suit === suit);
              const sortedSuit = suitCards.sort((a,b) => order[a.rank] - order[b.rank]);
              const highestInSuit = sortedSuit[sortedSuit.length-1];
              if (!highestInSuit || highestInSuit.suit !== chosen.suit || highestInSuit.rank !== chosen.rank) {
                console.log(`[GAME LOGGING] HIGHBALL: seat ${seatIndex} must play highest ${highestInSuit?.suit}${highestInSuit?.rank} in ${suit} but tried ${suit}${rank}. Rejecting.`);
                return { cardRecord: null, actualTrickId: trickRecord.id, playOrder: existingCardsCount, rejected: true };
              }
            } else {
              // When following:
              // - If player has lead suit: must be highest card in lead suit (current legal will only be lead suit)
              // - If void in lead suit: must be highest card in the CHOSEN suit among legal suits
              const leadSuit = leadSuitCache.get(trickRecord.id) || leadCard?.suit || (await prisma.trickCard.findFirst({ where: { trickId: trickRecord.id }, orderBy: { playOrder: 'asc' } }))?.suit;
              const hasLead = currentHand.some(c => c.suit === leadSuit);
              if (hasLead) {
                const sorted = legal.sort((a,b)=> order[a.rank]-order[b.rank]);
                const highest = sorted[sorted.length-1];
                if (highest.suit !== chosen.suit || highest.rank !== chosen.rank) {
                  console.log(`[GAME LOGGING] HIGHBALL: seat ${seatIndex} must play highest ${highest.suit}${highest.rank} (lead suit) but tried ${suit}${rank}. Rejecting.`);
                  return { cardRecord: null, actualTrickId: trickRecord.id, playOrder: existingCardsCount, rejected: true };
                }
              } else {
                const suitCards = legal.filter(c => c.suit === suit);
                const sortedSuit = suitCards.sort((a,b) => order[a.rank] - order[b.rank]);
                const highestInChosenSuit = sortedSuit[sortedSuit.length-1];
                if (!highestInChosenSuit || highestInChosenSuit.suit !== chosen.suit || highestInChosenSuit.rank !== chosen.rank) {
                  console.log(`[GAME LOGGING] HIGHBALL: seat ${seatIndex} (void) must play highest ${highestInChosenSuit?.suit}${highestInChosenSuit?.rank} in ${suit} but tried ${suit}${rank}. Rejecting.`);
                  return { cardRecord: null, actualTrickId: trickRecord.id, playOrder: existingCardsCount, rejected: true };
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('[GAME LOGGING] Low/Highball enforcement skipped due to error:', e?.message || e);
      }
      const calculatedPlayOrder = existingCardsCount + 1;
      console.log(`[GAME LOGGING] Calculated playOrder from DB: ${calculatedPlayOrder} (${existingCardsCount} existing cards in trick ${trickRecord.id})`);

      // PERFORMANCE FIX: Remove redundant spadesBroken update - handled in cardPlayHandler

      // Create the trick card record (simplified - no transaction)
      const cardRecord = await prisma.trickCard.create({
        data: {
          trickId: trickRecord.id,
          seatIndex,
          suit,
          rank,
          playOrder: calculatedPlayOrder,
          playedAt: new Date()
        }
      });

      // NUCLEAR: Skip ALL logging for maximum speed
      // this.logGameAction(gameId, 'play_card', {
      //   roundId,
      //   trickId: trickRecord.id,
      //   suit,
      //   rank,
      //   playOrder: calculatedPlayOrder
      // }, userId, seatIndex).catch(err => 
      //   console.log('[GAME LOGGING] Async action log failed:', err)
      // );

      // Remove card from hand (required for game logic) - SYNCHRONOUS
      await this.removeCardFromHand(roundId, seatIndex, suit, rank);

      return { cardRecord, actualTrickId: trickRecord.id, playOrder: calculatedPlayOrder };
    } catch (error) {
      console.error('[GAME LOGGING] Error logging card play:', error);
      throw error;
    }
  }

  /**
   * Remove a played card from the player's hand in RoundHandSnapshot and Redis
   */
  static async removeCardFromHand(roundId, seatIndex, suit, rank) {
    try {
      // Find the hand snapshot for this player
      const handSnapshot = await prisma.roundHandSnapshot.findFirst({
        where: { roundId, seatIndex }
      });

      if (!handSnapshot) {
        console.error(`[GAME LOGGING] No hand snapshot found for round ${roundId}, seat ${seatIndex}`);
        return;
      }

      // Get current hand - ensure it's an array
      let currentHand = handSnapshot.cards || [];
      if (typeof currentHand === 'string') {
        try {
          currentHand = JSON.parse(currentHand);
        } catch (error) {
          console.error(`[GAME LOGGING] Failed to parse cards JSON for seat ${seatIndex}:`, error);
          currentHand = [];
        }
      }
      
      // Find and remove the played card
      const updatedHand = currentHand.filter(card => 
        !(card.suit === suit && card.rank === rank)
      );

      if (updatedHand.length === currentHand.length) {
        console.warn(`[GAME LOGGING] Card ${suit}${rank} not found in hand for seat ${seatIndex}`);
        return;
      }

      // Update the hand snapshot in database
      await prisma.roundHandSnapshot.update({
        where: { id: handSnapshot.id },
        data: { cards: updatedHand }
      });

      // Update Redis cache
      try {
        const { redisClient } = await import('../config/redis.js');
        // Get gameId from round
        const round = await prisma.round.findUnique({
          where: { id: roundId },
          select: { gameId: true }
        });
        
        if (round?.gameId) {
          // Get current hands from Redis using correct key format
          const currentRedisHands = await redisClient.get(`game:hands:${round.gameId}`);
          if (currentRedisHands) {
            const hands = JSON.parse(currentRedisHands);
            if (hands[seatIndex]) {
              hands[seatIndex] = hands[seatIndex].filter(card => 
                !(card.suit === suit && card.rank === rank)
              );
              await redisClient.set(`game:hands:${round.gameId}`, JSON.stringify(hands), { EX: 3600 });
              console.log(`[GAME LOGGING] Updated Redis hands for seat ${seatIndex}`);
              
              // CRITICAL: Also update the main game state cache with new hands
              const gameStateKey = `game:state:${round.gameId}`;
              const currentGameState = await redisClient.get(gameStateKey);
              if (currentGameState) {
                const gameState = JSON.parse(currentGameState);
                gameState.hands = hands; // Update hands in main game state
                gameState.playerHands = hands; // Also update playerHands field
                gameState.timestamp = Date.now(); // Update timestamp to ensure cache freshness
                await redisClient.set(gameStateKey, JSON.stringify(gameState), { EX: 3600 });
                console.log(`[GAME LOGGING] Updated main game state cache with new hands`);
              }
              
              // CRITICAL: Also update the RedisGameStateService cache to ensure consistency
              try {
                const redisGameState = await import('./RedisGameStateService.js');
                await redisGameState.default.setPlayerHands(round.gameId, hands);
                console.log(`[GAME LOGGING] Updated RedisGameStateService hands cache`);
              } catch (redisServiceError) {
                console.error('[GAME LOGGING] Error updating RedisGameStateService:', redisServiceError);
              }
            }
          }
        }
      } catch (redisError) {
        console.error('[GAME LOGGING] Error updating Redis hands:', redisError);
      }

      console.log(`[GAME LOGGING] Removed card ${suit}${rank} from seat ${seatIndex} hand (${currentHand.length} -> ${updatedHand.length})`);
    } catch (error) {
      console.error('[GAME LOGGING] Error removing card from hand:', error);
      throw error;
    }
  }

  /**
   * Log a trick completion
   * @param {string} gameId - The game ID
   * @param {string} roundId - The round ID
   * @param {string} trickId - The trick ID
   * @param {number} trickNumber - The trick number
   * @param {number} winningSeatIndex - The winning seat index
   * @param {Array} cards - Array of cards played in the trick
   */
  static async logTrickComplete(gameId, roundId, trickId, trickNumber, winningSeatIndex, cards) {
    try {
      // Update the trick record
      const trickRecord = await prisma.trick.update({
        where: { id: trickId },
        data: {
          winningSeatIndex
        }
      });

      // Log the action
      await this.logGameAction(gameId, 'trick_complete', {
        roundId,
        trickId,
        trickNumber,
        winningSeatIndex,
        cards
      }, 'system', 0);

      return trickRecord;
    } catch (error) {
      console.error('[GAME LOGGING] Error logging trick completion:', error);
      throw error;
    }
  }

  /**
   * Log a round completion
   * @param {string} gameId - The game ID
   * @param {string} roundId - The round ID
   * @param {number} roundNumber - The round number
   * @param {Array} playerStats - Array of player statistics for the round
   */
  static async logRoundComplete(gameId, roundId, roundNumber, playerStats) {
    try {
      // No finishedAt column on Round; skip updating round timestamps
      const roundRecord = await prisma.round.findUnique({ where: { id: roundId } });

      // Update player stats for the round
      for (const stats of playerStats) {
        await prisma.playerRoundStats.upsert({
          where: {
            roundId_userId: {
              roundId,
              userId: stats.userId
            }
          },
          update: {
            seatIndex: stats.seatIndex,
            teamIndex: stats.teamIndex ?? null,
            bid: stats.bid ?? null,
            isBlindNil: stats.isBlindNil ?? false,
            tricksWon: stats.tricksWon ?? 0,
            bagsThisRound: stats.bagsThisRound ?? 0,
            madeNil: stats.madeNil ?? false,
            madeBlindNil: stats.madeBlindNil ?? false
          },
          create: {
            roundId,
            userId: stats.userId,
            seatIndex: stats.seatIndex,
            teamIndex: stats.teamIndex ?? null,
            bid: stats.bid ?? null,
            isBlindNil: stats.isBlindNil ?? false,
            tricksWon: stats.tricksWon ?? 0,
            bagsThisRound: stats.bagsThisRound ?? 0,
            madeNil: stats.madeNil ?? false,
            madeBlindNil: stats.madeBlindNil ?? false
          }
        });
      }

      // Log the action
      await this.logGameAction(gameId, 'round_complete', {
        roundId,
        roundNumber,
        playerStats
      }, 'system', 0);

      return roundRecord;
    } catch (error) {
      console.error('[GAME LOGGING] Error logging round completion:', error);
      throw error;
    }
  }

  /**
   * Log a game completion
   * @param {string} gameId - The game ID
   * @param {Object} gameResult - The final game result
   */
  static async logGameComplete(gameId, gameResult) {
    try {
      // Create the game result record
      const resultRecord = await prisma.gameResult.create({
        data: {
          gameId,
          winner: gameResult.winner,
          team0Final: gameResult.team0Final,
          team1Final: gameResult.team1Final,
          player0Final: gameResult.player0Final,
          player1Final: gameResult.player1Final,
          player2Final: gameResult.player2Final,
          player3Final: gameResult.player3Final,
          totalRounds: gameResult.totalRounds,
          totalTricks: gameResult.totalTricks,
          meta: gameResult.meta || {}
        }
      });

      // Update the game status - DISABLED - use GameService instead
      console.log(`[GAME LOGGING] WOULD mark game as FINISHED but this is DISABLED`);
      // await prisma.game.update({
      //   where: { id: gameId },
      //   data: {
      //     status: 'FINISHED',
      //     finishedAt: new Date()
      //   }
      // });

      // Log the action
      await this.logGameAction(gameId, 'game_complete', gameResult, 'system', 0);

      return resultRecord;
    } catch (error) {
      console.error('[GAME LOGGING] Error logging game completion:', error);
      throw error;
    }
  }

  /**
   * Get game state from database (single source of truth)
   * @param {string} gameId - The game ID
   * @returns {Object} Complete game state from database
   */
  static async getGameStateFromDB(gameId) {
    try {
      // First get the basic game
      const game = await prisma.game.findUnique({
        where: { id: gameId }
      });

      if (!game) {
        throw new Error('Game not found');
      }

      // Get players separately
      const players = await prisma.gamePlayer.findMany({
        where: { gameId }
      });

      // Get user info for each player
      const playersWithUsers = await Promise.all(
        players.map(async (player) => {
          const user = await prisma.user.findUnique({
            where: { id: player.userId },
            select: {
              id: true,
              username: true,
              avatarUrl: true
            }
          });
          return {
            ...player,
            user
          };
        })
      );

      // Get rounds separately
      const rounds = await prisma.round.findMany({
        where: { gameId },
        orderBy: { roundNumber: 'asc' }
      });

      // Get bids, tricks, and player stats for each round
      const roundsWithData = await Promise.all(
        rounds.map(async (round) => {
          const [bids, tricks, playerStats] = await Promise.all([
            prisma.roundBid.findMany({ where: { roundId: round.id } }),
            prisma.trick.findMany({ 
              where: { roundId: round.id },
              include: {
                cards: true
              }
            }),
            prisma.playerRoundStats.findMany({ where: { roundId: round.id } })
          ]);

          return {
            ...round,
            bids,
            tricks,
            playerStats
          };
        })
      );

      // Get result if exists
      const result = await prisma.gameResult.findUnique({
        where: { gameId }
      });

      return {
        ...game,
        players: playersWithUsers,
        rounds: roundsWithData,
        result
      };
    } catch (error) {
      console.error('[GAME LOGGING] Error getting game state from DB:', error);
      throw error;
    }
  }

  /**
   * Update game state in database
   * @param {string} gameId - The game ID
   * @param {Object} gameState - The game state to save
   */
  static async updateGameState(gameId, gameState) {
    try {
      const updatedGame = await prisma.game.update({
        where: { id: gameId },
        data: {
          gameState: JSON.stringify(gameState),
          currentRound: gameState.currentRound,
          currentTrick: gameState.currentTrick,
          currentPlayer: gameState.currentPlayer,
          lastActionAt: new Date()
        }
      });

      console.log(`[GAME LOGGING] Updated game state for ${gameId}`);
      return updatedGame;
    } catch (error) {
      console.error('[GAME LOGGING] Error updating game state:', error);
      throw error;
    }
  }

  /**
   * Get game action logs
   * @param {string} gameId - The game ID
   * @param {number} limit - Number of logs to retrieve
   * @returns {Array} Array of game action logs
   */
  static async getGameActionLogs(gameId, limit = 100) {
    try {
      const logs = await prisma.gameActionLog.findMany({
        where: { gameId },
        orderBy: { timestamp: 'desc' },
        take: limit
      });

      return logs;
    } catch (error) {
      console.error('[GAME LOGGING] Error getting game action logs:', error);
      throw error;
    }
  }
}