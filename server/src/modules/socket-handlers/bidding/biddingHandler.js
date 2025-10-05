import { GameService } from '../../../services/GameService.js';
import { GameLoggingService } from '../../../services/GameLoggingService.js';
import { BotService } from '../../../services/BotService.js';
import { prisma } from '../../../config/database.js';
import redisGameState from '../../../services/RedisGameStateService.js';

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
   * Process a bid - database only
   */
  async processBid(gameId, userId, bid, isNil = false, isBlindNil = false) {
    try {
      console.log(`[BIDDING] Processing bid: user=${userId}, bid=${bid}, nil=${isNil}, blind=${isBlindNil}`);

      // Get current game state
      const gameState = await GameService.getGame(gameId);
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

      // Update bid in database first (synchronous)
      await this.loggingService.logBid(
        gameId,
        currentRound.id,
        userId,
        player.seatIndex,
        bid,
        isBlindNil
      );

      // REAL-TIME: Update bid in Redis (instant)
      let currentBids = await redisGameState.getPlayerBids(gameId) || new Array(4).fill(null);
      currentBids[player.seatIndex] = bid;
      await redisGameState.setPlayerBids(gameId, currentBids);
      
      // DEBUG: Log Redis bid update
      console.log(`[BIDDING] Updated Redis bids for game ${gameId}:`, currentBids);

      // REAL-TIME: Check if all players have bid using Redis
      const bidsComplete = currentBids.every(bid => bid !== null && bid !== undefined);

        if (bidsComplete) {
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
        // Move to next player
        const nextPlayerIndex = (player.seatIndex + 1) % 4;
        const nextPlayer = gameState.players.find(p => p.seatIndex === nextPlayerIndex);
        
        console.log(`[BIDDING] Moving to next player:`, {
          currentPlayerSeat: player.seatIndex,
          nextPlayerIndex,
          nextPlayer,
          allPlayers: gameState.players.map(p => ({ seatIndex: p.seatIndex, userId: p.userId, username: p.user?.username }))
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

          // Emit bidding update
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

        // EXTREME: NO DELAYS - TRIGGER IMMEDIATELY
          this.triggerBotBidIfNeeded(gameId);
      }

      // NUCLEAR: No logging for performance
    } catch (error) {
      // NUCLEAR: No logging for performance
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

      // Create the first trick record
      const firstTrick = await prisma.trick.create({
        data: {
          roundId: roundId,
          trickNumber: 1,
          leadSeatIndex: firstPlayer?.seatIndex || 0,
          winningSeatIndex: null // Will be set when trick is complete
        }
      });

      console.log(`[BIDDING] Created first trick: ${firstTrick.id} with leadSeatIndex: ${firstPlayer?.seatIndex || 0}`);

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
        await redisGameState.setGameState(gameId, currentGameState);
        console.log(`[BIDDING] Updated Redis game state to PLAYING`);
      } else {
        // Fallback: get full game state from database and update
        const fullGameState = await GameService.getFullGameStateFromDatabase(gameId);
        if (fullGameState) {
          fullGameState.status = 'PLAYING';
          await redisGameState.setGameState(gameId, fullGameState);
          console.log(`[BIDDING] Updated Redis game state to PLAYING (from database)`);
        }
      }

      // Emit round started event
      const updatedGameState = await GameService.getGameStateForClient(gameId);
      this.io.to(gameId).emit('round_started', {
        gameId,
        gameState: updatedGameState
      });

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
      
      // Get the game from database to check if current player is a bot
      const game = await GameService.getGame(gameId);
      if (!game) {
        console.log(`[BIDDING] No game found for game ${gameId}`);
        return;
      }

      console.log(`[BIDDING] Current player ID: ${game.currentPlayer}`);
      const currentPlayer = game.players.find(p => p.userId === game.currentPlayer);
      console.log(`[BIDDING] Found current player:`, currentPlayer ? { 
        id: currentPlayer.userId, 
        username: currentPlayer.user?.username, 
        isHuman: currentPlayer.isHuman, 
        seatIndex: currentPlayer.seatIndex 
      } : 'null');
      
      if (!currentPlayer || currentPlayer.isHuman) {
        console.log(`[BIDDING] Not triggering bot bid - currentPlayer is human or not found`);
        return;
      }

      console.log(`[BIDDING] Triggering bot bid for ${currentPlayer.user?.username} (seat ${currentPlayer.seatIndex})`);

      // Get bot's hand from Redis
      const hands = await redisGameState.getPlayerHands(gameId);
      if (!hands || !hands[currentPlayer.seatIndex]) {
        console.log(`[BIDDING] No hand found in Redis for bot ${currentPlayer.user?.username}`);
        return;
      }

      // Calculate bot bid based on hand
      const hand = hands[currentPlayer.seatIndex];
      const numSpades = hand.filter(card => card.suit === 'SPADES').length;
      
      // Simple bot logic: bid number of spades or 2 if no spades
      const botBid = numSpades > 0 ? numSpades : 2;
      
      console.log(`[BIDDING] Bot ${currentPlayer.user?.username} bidding ${botBid} (${numSpades} spades)`);

      // Process bot's bid
      await this.processBid(gameId, currentPlayer.userId, botBid, botBid === 0, false);
    } catch (error) {
      console.error('[BIDDING] Error in triggerBotBidIfNeeded:', error);
    }
  }

  /**
   * Trigger bot play if needed
   */
  async triggerBotPlayIfNeeded(gameId) {
    try {
      const gameState = await GameService.getGameStateForClient(gameId);
      if (!gameState) return;

      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
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

      // Get bot card choice
      const botCard = await this.botService.playBotCard(updatedGameState, currentPlayer.seatIndex);
      if (botCard) {
        console.log(`[BIDDING] Bot ${currentPlayer.username} chose card: ${botCard.suit}${botCard.rank}`);
        
        // Import CardPlayHandler to process the card play
        const { CardPlayHandler } = await import('../card-play/cardPlayHandler.js');
        const cardPlayHandler = new CardPlayHandler(this.io, this.socket);
        await cardPlayHandler.processCardPlay(gameId, currentPlayer.id, botCard, true);
      }
    } catch (error) {
      // NUCLEAR: No logging for performance
    }
  }
}

export { BiddingHandler };