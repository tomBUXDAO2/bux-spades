import { GameService } from '../../../services/GameService.js';
import { GameLoggingService } from '../../../services/GameLoggingService.js';
import { BotService } from '../../../services/BotService.js';
import { prisma } from '../../../config/database.js';
import redisGameState from '../../../services/RedisGameStateService.js';
import { playerTimerService } from '../../../services/PlayerTimerService.js';
import { FastGameStateService } from '../../../services/FastGameStateService.js';

/**
 * DATABASE-FIRST BIDDING HANDLER
 * No in-memory state management - database is single source of truth
 */
class BiddingHandler {
  constructor(io, socket) {
    this.io = io;
    this.socket = socket;
    this.loggingService = GameLoggingService;
    this.botService = new BotService();
    this.biddingBots = new Set(); // Prevent concurrent bot bidding
  }

  async handleMakeBid(data) {
    try {
      const { gameId, bid, isNil = false, isBlindNil = false } = data;
      const userId = this.socket.userId || data.userId;
      
      if (!userId) {
        this.socket.emit('error', { message: 'User not authenticated' });
        return;
      }
      
      console.log(`[BIDDING] User ${userId} making bid: ${bid} (nil: ${isNil}, blind: ${isBlindNil})`);
      
      // Get current game state from database
      const gameState = await GameService.getGame(gameId);
      if (!gameState) {
        this.socket.emit('error', { message: 'Game not found' });
        return;
      }

      // Validate it's the player's turn to bid
      if (gameState.currentPlayer !== userId) {
        this.socket.emit('error', { message: 'Not your turn to bid' });
        return;
      }

      // Process the bid in database
      await this.processBid(gameId, userId, bid, isNil, isBlindNil);
    } catch (error) {
      // NUCLEAR: No logging for performance
      this.socket.emit('error', { message: 'Failed to make bid' });
    }
  }

  /**
   * Validate a bid based on game rules and player's hand
   */
  async validateBid(gameState, player, bid, isNil, isBlindNil) {
    const gameType = gameState.format || 'REGULAR';
    const forcedBid = gameState.gimmickVariant;
    const specialRules = gameState.specialRules || {};
    
    // Get player's hand from Redis (same source as bot bidding)
    const hands = await redisGameState.getPlayerHands(gameState.id);
    const playerHand = hands?.[player.seatIndex] || [];
    
    // Count cards in hand
    const numSpades = playerHand.filter(card => 
      card.suit === 'SPADES' || card.suit === 'S' || card.suit === '♠'
    ).length;
    const numHearts = playerHand.filter(card => 
      card.suit === 'HEARTS' || card.suit === 'H' || card.suit === '♥'
    ).length;
    const numAces = playerHand.filter(card => card.rank === 'A').length;
    
    // Handle gimmick games
    if (forcedBid) {
      switch (forcedBid) {
        case 'SUICIDE':
          return await this.validateSuicideBid(gameState, player, bid, isNil, isBlindNil);
        case 'BID4NIL':
        case '4 OR NIL':
          return { valid: bid === 0 || bid === 4, message: '4 or Nil game: Must bid 0 (nil) or 4' };
        case 'BID3':
        case 'BID 3':
          return { valid: bid === 3, message: 'Bid 3 game: Must bid exactly 3' };
        case 'BIDHEARTS':
          return { valid: bid === numHearts, message: `Bid Hearts game: Must bid ${numHearts} (number of hearts)` };
        case 'CRAZY_ACES':
        case 'CRAZY ACES':
          return { valid: bid === (numAces * 3), message: `Crazy Aces game: Must bid ${numAces * 3} (${numAces} aces × 3)` };
        default:
          return { valid: false, message: 'Invalid gimmick game type' };
      }
    }
    
    // Handle regular game types
    switch (gameType) {
      case 'REGULAR':
        return { valid: bid >= 0 && bid <= 13, message: 'Regular game: Bid 0-13' };
      case 'WHIZ':
        const validWhizBid = bid === numSpades || bid === 0;
        return { valid: validWhizBid, message: `Whiz game: Must bid ${numSpades} (number of spades) or nil` };
      case 'MIRROR':
        return { valid: bid === numSpades, message: `Mirror game: Must bid ${numSpades} (number of spades)` };
      default:
        return { valid: false, message: 'Invalid game type' };
    }
  }

  /**
   * Validate SUICIDE game bid - exactly 1 person from each team must bid nil
   */
  async validateSuicideBid(gameState, player, bid, isNil, isBlindNil) {
    // Get current bids from Redis
    const currentBids = await redisGameState.getPlayerBids(gameState.id);
    
    // Determine bidding order based on dealer
    const dealer = gameState.dealer || 0;
    const biddingOrder = [(dealer + 1) % 4, (dealer + 2) % 4, (dealer + 3) % 4, (dealer + 4) % 4];
    
    // Find current bidder's position in bidding order
    const currentBidderIndex = biddingOrder.indexOf(player.seatIndex);
    
    // Determine teams
    const isTeam1 = player.seatIndex === 0 || player.seatIndex === 2;
    const partnerSeatIndex = isTeam1 ? 
      (player.seatIndex === 0 ? 2 : 0) : 
      (player.seatIndex === 1 ? 3 : 1);
    
    // Find partner's position in bidding order
    const partnerBidderIndex = biddingOrder.indexOf(partnerSeatIndex);
    
    // Check if partner already bid
    const partnerBid = currentBids[partnerSeatIndex];
    const partnerBidNil = partnerBid === 0;
    
    // Determine if current bidder must bid nil
    let mustBidNil = false;
    let canBidNil = true;
    
    if (partnerBidderIndex < currentBidderIndex) {
      // Partner already bid
      if (!partnerBidNil) {
        // Partner didn't bid nil, so current player must bid nil
        mustBidNil = true;
      }
    } else {
      // Partner hasn't bid yet, so current player can choose
      // But they need to consider if they want to force their partner to bid nil
      canBidNil = true;
    }
    
    // Validate the bid
    if (mustBidNil) {
      if (bid === 0) {
        return { valid: true, message: 'Suicide game: Valid nil bid' };
      } else {
        return { valid: false, message: 'Suicide game: Must bid nil since partner didn\'t bid nil' };
      }
    } else {
      // Player can bid whatever they want (0-13)
      if (bid >= 0 && bid <= 13) {
        return { valid: true, message: 'Suicide game: Valid bid' };
      } else {
        return { valid: false, message: 'Suicide game: Bid must be between 0-13' };
      }
    }
  }

  /**
   * Process a bid - database only
   */
  async processBid(gameId, userId, bid, isNil = false, isBlindNil = false) {
    try {
      console.log(`[BIDDING] Processing bid: user=${userId}, bid=${bid}, nil=${isNil}, blind=${isBlindNil}`);

      // Clear any existing timer for this game (player has acted)
      playerTimerService.clearTimer(gameId);

      // Get current game state (with caching)
      const gameState = await FastGameStateService.getGame(gameId);
      if (!gameState) {
        throw new Error('Game not found');
      }

      // Get current round
      const currentRound = gameState.rounds.find(r => r.roundNumber === gameState.currentRound);
      if (!currentRound) {
        throw new Error('Current round not found');
      }

      // Get player info
      const player = gameState.players.find(p => p.userId === userId);
      if (!player) {
        throw new Error('Player not found in game');
      }

      // Validate the bid based on game rules
      const validation = await this.validateBid(gameState, player, bid, isNil, isBlindNil);
      if (!validation.valid) {
        this.socket.emit('error', { message: validation.message });
        return;
      }

      // Update bid in database first (synchronous)
      await this.loggingService.logBid(
        gameId,
        currentRound.id,
        userId,
        player.seatIndex,
        bid,
        isBlindNil
      );
      
      // Game state has changed - invalidate cache
      FastGameStateService.invalidateGame(gameId);

      // REAL-TIME: Update bid in Redis (instant)
      let currentBids = await redisGameState.getPlayerBids(gameId) || Array.from({length: 4}, () => null);
      currentBids[player.seatIndex] = bid;
      await redisGameState.setPlayerBids(gameId, currentBids);
      
      // DEBUG: Log Redis bid update
      console.log(`[BIDDING] Updated Redis bids for game ${gameId}:`, currentBids);

      // REAL-TIME: Check if all players have bid using Redis
      // Only check bids for seats that have players
      const game = await FastGameStateService.getGame(gameId);
      const occupiedSeats = game.players.map(p => p.seatIndex);
      const bidsComplete = occupiedSeats.every(seatIndex => 
        currentBids[seatIndex] !== null && currentBids[seatIndex] !== undefined
      );

      if (bidsComplete) {
        // VALIDATION: Ensure all 4 players have valid bids before starting
        console.log(`[BIDDING] All players have bid, validating before starting round`);
        console.log(`[BIDDING] Current bids:`, currentBids);
        
        // Double-check that all bids are valid numbers (not null/undefined)
        const validBids = currentBids.filter(bid => bid !== null && bid !== undefined && typeof bid === 'number');
        if (validBids.length !== 4) {
          console.error(`[BIDDING] Invalid bid count: expected 4, got ${validBids.length}`);
          return;
        }
        
        // All players have bid, emit final bidding update then start the round
        const updatedGameState = await GameService.getGameStateForClient(gameId);
        this.io.to(gameId).emit('bidding_update', {
          gameId,
          gameState: updatedGameState,
          bid: {
            userId,
            bid,
            isNil,
            isBlindNil,
            seatIndex: player.seatIndex
          }
        });
        
        // EXTREME: NO DELAYS - START IMMEDIATELY
        this.startRound(gameId, currentRound.id);
      } else {
        // Move to next player FIRST
        const nextPlayerIndex = (player.seatIndex + 1) % 4;
        const nextPlayer = gameState.players.find(p => p.seatIndex === nextPlayerIndex);
        
        console.log(`[BIDDING] Moving to next player:`, {
          currentPlayerSeat: player.seatIndex,
          nextPlayerIndex,
          nextPlayer,
          allPlayers: gameState.players.map(p => ({ seatIndex: p.seatIndex, userId: p.userId, username: p.user?.username, isHuman: p.isHuman }))
        });
        
        console.log(`[BIDDING] Next player details:`, {
          userId: nextPlayer?.userId,
          isHuman: nextPlayer?.isHuman,
          seatIndex: nextPlayer?.seatIndex,
          username: nextPlayer?.user?.username
        });
        
        // REAL-TIME: Update current player in existing cached game state
        const currentGameState = await redisGameState.getGameState(gameId);
        if (currentGameState) {
          currentGameState.currentPlayer = nextPlayer?.userId;
          await redisGameState.setGameState(gameId, currentGameState);
          console.log(`[BIDDING] Updated Redis currentPlayer to: ${nextPlayer?.userId}`);
        } else {
          // Fallback: get full game state from database and update
          const fullGameState = await GameService.getFullGameStateFromDatabase(gameId);
          if (fullGameState) {
            fullGameState.currentPlayer = nextPlayer?.userId;
            await redisGameState.setGameState(gameId, fullGameState);
            console.log(`[BIDDING] Updated Redis currentPlayer to: ${nextPlayer?.userId} (from database)`);
          }
        }

        // ASYNC: Update current player in database (non-blocking)
        GameService.updateGame(gameId, {
          currentPlayer: nextPlayer?.userId
        }).catch(err => console.error('[BIDDING] Async currentPlayer update failed:', err));

        // OPTIMIZED: Use optimized game state service with incremental bidding updates
        const { OptimizedGameStateService } = await import('../../../services/OptimizedGameStateService.js');
        const latestBids = await redisGameState.getPlayerBids(gameId);
        
        const updatedGameState = await OptimizedGameStateService.updateBiddingState(gameId, {
          bids: latestBids,
          currentBidderIndex: nextPlayer?.seatIndex || 0,
          currentPlayer: nextPlayer?.userId
        });
        
        // Update player bids in the players array
        if (updatedGameState && latestBids) {
          updatedGameState.players = updatedGameState.players.map(p => ({
            ...p,
            bid: latestBids[p.seatIndex] || null
          }));
        }
        
        this.io.to(gameId).emit('bidding_update', {
          gameId,
          gameState: updatedGameState,
          bid: {
            userId,
            bid,
            isNil,
            isBlindNil,
            seatIndex: player.seatIndex
          }
        });

        // Start timer for next player if they are human and timer should apply
        if (nextPlayer && nextPlayer.isHuman) {
          const shouldApplyTimer = this.shouldApplyBiddingTimer(gameState);
          if (shouldApplyTimer) {
            console.log(`[BIDDING] Starting timer for human player ${nextPlayer.userId} (seat ${nextPlayer.seatIndex})`);
            playerTimerService.startPlayerTimer(gameId, nextPlayer.userId, nextPlayer.seatIndex, 'bidding');
          } else {
            console.log(`[BIDDING] Timer not applicable for this game format/situation`);
          }
        }

        // Only trigger bot bid if next player is a bot
        if (nextPlayer && !nextPlayer.isHuman) {
          console.log(`[BIDDING] Next player is bot, triggering bot bid`);
          this.triggerBotBidIfNeeded(gameId);
        } else {
          console.log(`[BIDDING] Next player is human, not triggering bot bid`);
        }
      }

      // NUCLEAR: No logging for performance
    } catch (error) {
      console.error('[BIDDING] Error in processBid:', error);
      throw error;
    }
  }

  /**
   * Start the round after all bids are in
   */
  async startRound(gameId, roundId) {
    try {
      console.log(`[BIDDING] Starting round ${roundId} for game ${gameId}`);

      // Get game state to find first player
      const gameState = await GameService.getGame(gameId);
      const firstPlayer = gameState.players.find(p => p.seatIndex === (gameState.dealer + 1) % 4);

      // Check if trick already exists
      const existingTrick = await prisma.trick.findFirst({
        where: {
          roundId: roundId,
          trickNumber: 1
        }
      });

      let firstTrick;
      if (existingTrick) {
        console.log(`[BIDDING] Trick already exists for round ${roundId}, using existing: ${existingTrick.id}`);
        firstTrick = existingTrick;
      } else {
        // Create the first trick record
        firstTrick = await prisma.trick.create({
          data: {
            roundId: roundId,
            trickNumber: 1,
            leadSeatIndex: firstPlayer?.seatIndex || 0,
            winningSeatIndex: null // Will be set when trick is complete
          }
        });
        console.log(`[BIDDING] Created first trick: ${firstTrick.id} with leadSeatIndex: ${firstPlayer?.seatIndex || 0}`);
      }

      // Update game status and current trick
      await GameService.updateGame(gameId, {
        status: 'PLAYING',
        currentPlayer: firstPlayer?.userId || null,
        currentTrick: 1
      });

      // REAL-TIME: Update game state in Redis with PLAYING status
      const currentGameState = await redisGameState.getGameState(gameId);
      if (currentGameState) {
        currentGameState.status = 'PLAYING';
        currentGameState.currentPlayer = firstPlayer?.userId || null; // CRITICAL: Update currentPlayer in Redis
        
        // Preserve bidding data in Redis cache
        const latestBids = await redisGameState.getPlayerBids(gameId);
        if (latestBids) {
          currentGameState.bidding = {
            bids: latestBids,
            currentBidderIndex: firstPlayer?.seatIndex || 0,
            currentPlayer: firstPlayer?.userId
          };
          
          // Also update player bids in the players array
          currentGameState.players = currentGameState.players.map(p => ({
            ...p,
            bid: latestBids[p.seatIndex] || null
          }));
        }
        
        await redisGameState.setGameState(gameId, currentGameState);
        console.log(`[BIDDING] Updated Redis game state to PLAYING with currentPlayer: ${firstPlayer?.userId}`);
      } else {
        // Fallback: get full game state from database and update
        const fullGameState = await GameService.getFullGameStateFromDatabase(gameId);
        if (fullGameState) {
          fullGameState.status = 'PLAYING';
          fullGameState.currentPlayer = firstPlayer?.userId || null; // CRITICAL: Update currentPlayer in fallback
          
          // Preserve bidding data in fallback state
          const latestBids = await redisGameState.getPlayerBids(gameId);
          if (latestBids) {
            fullGameState.bidding = {
              bids: latestBids,
              currentBidderIndex: firstPlayer?.seatIndex || 0,
              currentPlayer: firstPlayer?.userId
            };
            
            // Also update player bids in the players array
            fullGameState.players = fullGameState.players.map(p => ({
              ...p,
              bid: latestBids[p.seatIndex] || null
            }));
          }
          
          await redisGameState.setGameState(gameId, fullGameState);
          console.log(`[BIDDING] Updated Redis game state to PLAYING (from database) with currentPlayer: ${firstPlayer?.userId}`);
        }
      }

      // Emit round started event
      try {
        const updatedGameState = await GameService.getGameStateForClient(gameId);
        
        // CRITICAL: Preserve bidding data when transitioning to PLAYING phase
        const latestBids = await redisGameState.getPlayerBids(gameId);
        if (latestBids && updatedGameState) {
          updatedGameState.bidding = {
            bids: latestBids,
            currentBidderIndex: firstPlayer?.seatIndex || 0,
            currentPlayer: firstPlayer?.userId
          };
          
          // Also update player bids in the players array
          updatedGameState.players = updatedGameState.players.map(p => ({
            ...p,
            bid: latestBids[p.seatIndex] || null
          }));
        }
        
        this.io.to(gameId).emit('round_started', {
          gameId,
          gameState: updatedGameState
        });

        // Start timer for first player if they are human (card play - always apply)
        if (firstPlayer && firstPlayer.isHuman) {
          console.log(`[BIDDING] Starting card play timer for first player ${firstPlayer.userId} (seat ${firstPlayer.seatIndex})`);
          playerTimerService.startPlayerTimer(gameId, firstPlayer.userId, firstPlayer.seatIndex, 'playing');
        }
      } catch (error) {
        console.error(`[BIDDING] Error getting game state for client:`, error);
        // Fallback: emit minimal round started event
        this.io.to(gameId).emit('round_started', {
          gameId,
          gameState: { status: 'PLAYING', currentPlayer: firstPlayer?.userId }
        });

        // Still start timer even in fallback
        if (firstPlayer && firstPlayer.isHuman) {
          console.log(`[BIDDING] Starting card play timer for first player ${firstPlayer.userId} (fallback)`);
          playerTimerService.startPlayerTimer(gameId, firstPlayer.userId, firstPlayer.seatIndex, 'playing');
        }
      }

      console.log(`[BIDDING] Round started successfully`);

      // EXTREME: NO DELAYS - TRIGGER IMMEDIATELY
      this.triggerBotPlayIfNeeded(gameId);
    } catch (error) {
      // NUCLEAR: No logging for performance
      throw error;
    }
  }

  /**
   * Trigger bot bid if needed
   */
  async triggerBotBidIfNeeded(gameId) {
    try {
      console.log(`[BIDDING] triggerBotBidIfNeeded called for game ${gameId}`);
      
      // Prevent concurrent bot bidding
      if (this.biddingBots.has(gameId)) {
        console.log(`[BIDDING] Bot bidding already in progress for game ${gameId}, ignoring duplicate request`);
        return;
      }
      
      this.biddingBots.add(gameId);
      
      // Get the game state from Redis first (faster and more current)
      let gameState = await redisGameState.getGameState(gameId);
      if (!gameState) {
        // Fallback to database if Redis is empty
        gameState = await GameService.getGame(gameId);
        if (!gameState) {
          console.log(`[BIDDING] No game found for game ${gameId}`);
          this.biddingBots.delete(gameId);
          return;
        }
      }

      console.log(`[BIDDING] Current player ID: ${gameState.currentPlayer}`);
      console.log(`[BIDDING] All players in game:`, gameState.players.map(p => p ? ({ 
        id: p.id || p.userId, 
        username: p.username || p.user?.username, 
        isHuman: p.isHuman, 
        seatIndex: p.seatIndex 
      }) : null));
      const currentPlayer = gameState.players.find(p => p && p.userId === gameState.currentPlayer);
      console.log(`[BIDDING] Found current player:`, currentPlayer ? { 
        id: currentPlayer.id || currentPlayer.userId, 
        username: currentPlayer.username || currentPlayer.user?.username, 
        isHuman: currentPlayer.isHuman, 
        seatIndex: currentPlayer.seatIndex 
      } : 'null');
      
      if (!currentPlayer || currentPlayer.isHuman) {
        console.log(`[BIDDING] Not triggering bot bid - currentPlayer is human or not found`);
        this.biddingBots.delete(gameId);
        return;
      }

      const playerId = currentPlayer.userId;
      const playerUsername = currentPlayer.username || currentPlayer.user?.username;
      
      console.log(`[BIDDING] Triggering bot bid for ${playerUsername} (seat ${currentPlayer.seatIndex})`);

      // Get bot's hand from Redis
      const hands = await redisGameState.getPlayerHands(gameId);
      if (!hands || !hands[currentPlayer.seatIndex]) {
        console.log(`[BIDDING] No hand found in Redis for bot ${playerUsername}`);
        this.biddingBots.delete(gameId);
        return;
      }

      // Calculate bot bid based on hand and game type
      const hand = hands[currentPlayer.seatIndex];
      const numSpades = hand.filter(card => card.suit === 'SPADES').length;
      
      // CRITICAL: Get latest bids from Redis and add to gameState
      const latestBids = await redisGameState.getPlayerBids(gameId);
      if (latestBids) {
        if (!gameState.bidding) {
          gameState.bidding = {};
        }
        gameState.bidding.bids = latestBids;
        console.log(`[BIDDING] Updated gameState with latest bids from Redis:`, latestBids);
      }
      
      // Use BotService for proper bidding logic based on game type
      let botBid;
      if (gameState.format === 'WHIZ') {
        // Get partner bid for WHIZ rules
        const partnerBid = this.getPartnerBid(gameState, currentPlayer.seatIndex);
        botBid = this.botService.calculateWhizBid(gameState, currentPlayer.seatIndex, hand);
        console.log(`[BIDDING] WHIZ bot ${playerUsername} bidding ${botBid} (${numSpades} spades, partner bid: ${partnerBid})`);
      } else if (gameState.format === 'GIMMICK' && gameState.gimmickVariant === 'SUICIDE') {
        // SUICIDE game bot logic
        botBid = await this.calculateSuicideBotBid(gameState, currentPlayer.seatIndex, hand);
        console.log(`[BIDDING] SUICIDE bot ${playerUsername} bidding ${botBid}`);
      } else if (gameState.format === 'GIMMICK' && (gameState.gimmickVariant === 'BID4NIL' || gameState.gimmickVariant === '4 OR NIL')) {
        // 4 OR NIL game bot logic
        botBid = this.calculate4OrNilBotBid(hand);
        console.log(`[BIDDING] 4 OR NIL bot ${playerUsername} bidding ${botBid}`);
      } else if (gameState.format === 'GIMMICK' && (gameState.gimmickVariant === 'BID3' || gameState.gimmickVariant === 'BID 3')) {
        // BID 3 game bot logic - always bid 3
        botBid = 3;
        console.log(`[BIDDING] BID 3 bot ${playerUsername} bidding ${botBid}`);
      } else if (gameState.format === 'GIMMICK' && (gameState.gimmickVariant === 'CRAZY_ACES' || gameState.gimmickVariant === 'CRAZY ACES')) {
        // CRAZY ACES game bot logic - bid 3 points for each ace in hand
        const numAces = hand.filter(card => card.rank === 'A').length;
        botBid = numAces * 3;
        console.log(`[BIDDING] CRAZY ACES bot ${playerUsername} bidding ${botBid} (${numAces} aces × 3)`);
      } else {
        // Simple bot logic for other game types
        botBid = numSpades > 0 ? numSpades : 2;
        console.log(`[BIDDING] Bot ${playerUsername} bidding ${botBid} (${numSpades} spades)`);
      }

      // Remove from bidding bots set BEFORE processing so next bot can be triggered
      this.biddingBots.delete(gameId);
      console.log(`[BIDDING] Removed game ${gameId} from bidding bots mutex before processing bid`);
      
      // Process bot's bid
      await this.processBid(gameId, playerId, botBid, botBid === 0, false);
    } catch (error) {
      console.error('[BIDDING] Error in triggerBotBidIfNeeded:', error);
      // Remove from bidding bots set on error too
      this.biddingBots.delete(gameId);
    }
  }

  /**
   * Get partner's bid for WHIZ rules
   */
  getPartnerBid(gameState, seatIndex) {
    const partnerSeatIndex = (seatIndex + 2) % 4; // Partner is opposite seat
    const partner = gameState.players.find(p => p.seatIndex === partnerSeatIndex);
    return partner?.bid || null;
  }

  /**
   * Calculate SUICIDE bot bid - use WHIZ rules for bidders 1 & 2, team logic for bidders 3 & 4
   */
  async calculateSuicideBotBid(gameState, seatIndex, hand) {
    // Get current bids from Redis
    const currentBids = await redisGameState.getPlayerBids(gameState.id);
    
    // Determine bidding order based on dealer
    const dealer = gameState.dealer || 0;
    const biddingOrder = [(dealer + 1) % 4, (dealer + 2) % 4, (dealer + 3) % 4, (dealer + 4) % 4];
    
    // Find current bot's position in bidding order
    const currentBidderIndex = biddingOrder.indexOf(seatIndex);
    
    // Determine teams
    const isTeam1 = seatIndex === 0 || seatIndex === 2;
    const partnerSeatIndex = isTeam1 ? 
      (seatIndex === 0 ? 2 : 0) : 
      (seatIndex === 1 ? 3 : 1);
    
    // Find partner's position in bidding order
    const partnerBidderIndex = biddingOrder.indexOf(partnerSeatIndex);
    
    // Check if partner already bid
    const partnerBid = currentBids[partnerSeatIndex];
    const partnerBidNil = partnerBid === 0;
    
    if (partnerBidderIndex < currentBidderIndex) {
      // Partner already bid
      if (!partnerBidNil) {
        // Partner didn't bid nil, so current bot must bid nil
        console.log(`[BIDDING] SUICIDE bot at seat ${seatIndex} must bid nil (partner didn't bid nil)`);
        return 0;
      } else {
        // Partner bid nil, so current bot can bid whatever
        console.log(`[BIDDING] SUICIDE bot at seat ${seatIndex} can bid anything (partner bid nil)`);
        // Use simple logic - bid number of spades or nil based on hand strength
        const numSpades = hand.filter(card => card.suit === 'SPADES').length;
        return numSpades > 0 ? numSpades : 2;
      }
    } else {
      // Partner hasn't bid yet - this is bidder 1 or 2
      // Use WHIZ rules for intelligent nil decision
      console.log(`[BIDDING] SUICIDE bot at seat ${seatIndex} is bidder 1 or 2, using WHIZ rules`);
      return this.botService.calculateWhizBid(gameState, seatIndex, hand);
    }
  }

  /**
   * Calculate 4 OR NIL bot bid - must bid either 4 or nil
   * Use same nil-prevention logic as SUICIDE: only avoid nil if have Ace of Spades
   */
  calculate4OrNilBotBid(hand) {
    const hasAceSpades = hand.some(card => card.suit === 'SPADES' && card.rank === 'A');
    
    if (hasAceSpades) {
      // Must bid 4 if have Ace of Spades (can't bid nil)
      console.log(`[BIDDING] 4 OR NIL bot bidding 4 (has Ace of Spades - cannot bid nil)`);
      return 4;
    } else {
      // Can bid nil, use simple logic to decide between 4 or nil
      const numSpades = hand.filter(card => card.suit === 'SPADES').length;
      const numAces = hand.filter(card => card.rank === 'A').length;
      const numKings = hand.filter(card => card.rank === 'K').length;
      
      // Count high cards (A, K, Q, J)
      const highCards = hand.filter(card => ['A', 'K', 'Q', 'J'].includes(card.rank)).length;
      
      // Simple decision logic
      if (highCards >= 4 || numAces >= 2 || (numSpades >= 3 && highCards >= 2)) {
        console.log(`[BIDDING] 4 OR NIL bot bidding 4 (strong hand: ${highCards} high cards, ${numSpades} spades, ${numAces} aces)`);
        return 4;
      } else {
        console.log(`[BIDDING] 4 OR NIL bot bidding nil (weak hand: ${highCards} high cards, ${numSpades} spades, ${numAces} aces)`);
        return 0;
      }
    }
  }

  /**
   * Trigger bot play if needed
   */
  async triggerBotPlayIfNeeded(gameId) {
    try {
      const gameState = await GameService.getGameStateForClient(gameId);
      if (!gameState) return;

      const currentPlayer = gameState.players.find(p => p.userId === gameState.currentPlayer);
      if (!currentPlayer || currentPlayer.type !== 'bot') return;

      console.log(`[BIDDING] Triggering bot play for ${currentPlayer.username} (seat ${currentPlayer.seatIndex})`);

      // Get bot's hand from Redis (real-time updated hand)
      const hands = await redisGameState.getPlayerHands(gameId);
      if (!hands || !hands[currentPlayer.seatIndex]) {
        console.log(`[BIDDING] No hand found in Redis for bot ${currentPlayer.username}`);
        return;
      }

      const hand = hands[currentPlayer.seatIndex];
      console.log(`[BIDDING] Bot ${currentPlayer.username} (seat ${currentPlayer.seatIndex}) hand from Redis:`, hand.map(c => `${c.suit}${c.rank}`));

      // Update the gameState with the current Redis hands before passing to bot
      const updatedGameState = { ...gameState, hands: hands };

      // CRITICAL: Create proper game object for bot service with players array
      const gameForBot = {
        ...updatedGameState,
        players: gameState.players, // Use the fresh players from game state
        hands: hands
      };

      // Get bot card choice
      console.log(`[BIDDING] Calling bot service for ${currentPlayer.username} with game state:`, {
        currentRound: updatedGameState.currentRound,
        currentTrick: updatedGameState.currentTrick,
        handsLength: updatedGameState.hands?.length,
        seatIndex: currentPlayer.seatIndex
      });
      
      const botCard = await this.botService.playBotCard(gameForBot, currentPlayer.seatIndex);
      console.log(`[BIDDING] Bot service returned:`, botCard);
      
      if (botCard) {
        console.log(`[BIDDING] Bot ${currentPlayer.username} chose card: ${botCard.suit}${botCard.rank}`);
        
        // Import CardPlayHandler to process the card play
        const { CardPlayHandler } = await import('../card-play/cardPlayHandler.js');
        const cardPlayHandler = new CardPlayHandler(this.io, this.socket);
        await cardPlayHandler.processCardPlay(gameId, currentPlayer.userId, botCard, true);
      } else {
        console.log(`[BIDDING] ERROR: Bot ${currentPlayer.username} did not return a card choice`);
      }
    } catch (error) {
      console.error(`[BIDDING] ERROR triggering bot play:`, error);
    }
  }

  /**
   * Determine if bidding timer should be applied for current game state
   * @returns {boolean} - true if timer should be applied
   */
  shouldApplyBiddingTimer(gameState) {
    const format = gameState.format;
    const gimmickVariant = gameState.gimmickVariant;
    
    // Forced-bid formats that NEVER need timers during bidding
    const alwaysForcedFormats = ['MIRROR', 'BID3', 'BIDHEARTS', 'CRAZY_ACES'];
    
    if (alwaysForcedFormats.includes(format) || alwaysForcedFormats.includes(gimmickVariant)) {
      console.log(`[BIDDING TIMER] Format ${format || gimmickVariant} is always forced - no timer`);
      return false;
    }
    
    // SUICIDE: Check if current player's bid is forced
    if (gimmickVariant === 'SUICIDE') {
      const isForced = this.isSuicideBidForced(gameState);
      console.log(`[BIDDING TIMER] SUICIDE bid is ${isForced ? 'forced' : 'not forced'}`);
      return !isForced;
    }
    
    // Apply timer for REGULAR and WHIZ
    console.log(`[BIDDING TIMER] Format ${format} - applying timer`);
    return true;
  }

  /**
   * Check if current player's bid is forced in SUICIDE
   * @returns {boolean} - true if bid is forced (partner bid non-nil)
   */
  isSuicideBidForced(gameState) {
    try {
      // Find current player
      const currentPlayerIndex = gameState.players.findIndex(p => p.userId === gameState.currentPlayer);
      if (currentPlayerIndex === -1) {
        console.log(`[BIDDING TIMER] Current player not found`);
        return false;
      }

      // Find partner (opposite seat)
      const partnerIndex = (currentPlayerIndex + 2) % 4;
      
      // Get bidding state from gameState
      const bids = gameState.bidding?.bids || [];
      const partnerBid = bids[partnerIndex];
      
      console.log(`[BIDDING TIMER] SUICIDE check - current player seat ${currentPlayerIndex}, partner seat ${partnerIndex}, partner bid: ${partnerBid}`);
      
      // If partner hasn't bid yet, bid is not forced (they might bid nil)
      if (partnerBid === undefined || partnerBid === null) {
        return false;
      }
      
      // If partner bid nil (0), current player can choose
      if (partnerBid === 0) {
        return false;
      }
      
      // Partner bid non-nil, so current player MUST bid nil (forced)
      return true;
    } catch (error) {
      console.error('[BIDDING TIMER] Error checking SUICIDE forced bid:', error);
      return false;
    }
  }
}

export { BiddingHandler };