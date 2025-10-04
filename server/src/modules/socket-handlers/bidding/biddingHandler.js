import { GameService } from '../../../services/GameService.js';
import { GameLoggingService } from '../../../services/GameLoggingService.js';
import { BotService } from '../../../services/BotService.js';
import { prisma } from '../../../config/database.js';

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
      console.error('[BIDDING] Error:', error);
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

      // Log the bid to database
      await this.loggingService.logBid(
        gameId,
        currentRound.id,
        userId,
        player.seatIndex,
        bid,
        isBlindNil
      );

      // Check if all players have bid
      const playerStats = await prisma.playerRoundStats.findMany({
        where: { 
          roundId: currentRound.id,
          bid: { not: null } // Only count players who have actually bid
        }
      });

      if (playerStats.length >= 4) {
        // All players have bid, emit final bidding update then start the round
        const updatedGameState = await GameService.getGameStateForClient(gameId);
        console.log(`[BIDDING] Final bid by ${userId}, all hands:`, updatedGameState.players.map(p => ({ id: p.id, handCount: p.hand?.length, firstCard: p.hand?.[0] })));
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
        
        // Small delay to let UI update before starting round
        setTimeout(() => {
          this.startRound(gameId, currentRound.id);
        }, 200); // Reduced delay for faster gameplay
      } else {
        // Move to next player
        const nextPlayerIndex = (player.seatIndex + 1) % 4;
        const nextPlayer = gameState.players.find(p => p.seatIndex === nextPlayerIndex);
        
        await GameService.updateGame(gameId, {
          currentPlayer: nextPlayer?.userId
        });

        // Emit bidding update
        const updatedGameState = await GameService.getGameStateForClient(gameId);
        console.log(`[BIDDING] After bid, player ${userId} hand:`, updatedGameState.players.find(p => p.id === userId)?.hand?.slice(0, 3));
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

        // Trigger bot bid if next player is a bot
        setTimeout(() => {
          this.triggerBotBidIfNeeded(gameId);
        }, 300); // Reduced delay for faster gameplay
      }

      console.log(`[BIDDING] Bid processed successfully`);
    } catch (error) {
      console.error('[BIDDING] Error processing bid:', error);
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

      // Emit round started event
      const updatedGameState = await GameService.getGameStateForClient(gameId);
      this.io.to(gameId).emit('round_started', {
        gameId,
        gameState: updatedGameState
      });

      console.log(`[BIDDING] Round started successfully`);

      // Trigger bot play if current player is a bot
      setTimeout(() => {
        this.triggerBotPlayIfNeeded(gameId);
      }, 100);
    } catch (error) {
      console.error('[BIDDING] Error starting round:', error);
      throw error;
    }
  }

  /**
   * Trigger bot bid if needed
   */
  async triggerBotBidIfNeeded(gameId) {
    try {
      const gameState = await GameService.getGameStateForClient(gameId);
      if (!gameState) return;

      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (!currentPlayer || currentPlayer.type !== 'bot') return;

      console.log(`[BIDDING] Triggering bot bid for ${currentPlayer.username} (seat ${currentPlayer.seatIndex})`);

      // Get bot's hand from database
      const round = gameState.rounds.find(r => r.roundNumber === gameState.currentRound);
      if (!round) return;

      const handSnapshot = await prisma.roundHandSnapshot.findFirst({
        where: {
          roundId: round.id,
          seatIndex: currentPlayer.seatIndex
        }
      });

      if (!handSnapshot) {
        console.log(`[BIDDING] No hand snapshot found for bot ${currentPlayer.username}`);
        return;
      }

      // Calculate bot bid based on hand
      const hand = handSnapshot.cards || [];
      const numSpades = hand.filter(card => card.suit === 'SPADES').length;
      
      // Simple bot logic: bid number of spades or 2 if no spades
      const botBid = numSpades > 0 ? numSpades : 2;
      
      console.log(`[BIDDING] Bot ${currentPlayer.username} bidding ${botBid} (${numSpades} spades)`);

      // Process bot's bid
      await this.processBid(gameId, currentPlayer.id, botBid, botBid === 0, false);
    } catch (error) {
      console.error('[BIDDING] Error triggering bot bid:', error);
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

      // Get bot's hand from database
      const round = gameState.rounds.find(r => r.roundNumber === gameState.currentRound);
      if (!round) return;

      const handSnapshot = await prisma.roundHandSnapshot.findFirst({
        where: { roundId: round.id, seatIndex: currentPlayer.seatIndex }
      });

      if (!handSnapshot) return;

      const hand = handSnapshot.cards;

      // Get bot card choice
      const botCard = await this.botService.playBotCard(gameState, currentPlayer.seatIndex);
      if (botCard) {
        console.log(`[BIDDING] Bot ${currentPlayer.username} chose card: ${botCard.suit}${botCard.rank}`);
        
        // Import CardPlayHandler to process the card play
        const { CardPlayHandler } = await import('../card-play/cardPlayHandler.js');
        const cardPlayHandler = new CardPlayHandler(this.io, this.socket);
        await cardPlayHandler.processCardPlay(gameId, currentPlayer.id, botCard, true);
      }
    } catch (error) {
      console.error('[BIDDING] Error in triggerBotPlayIfNeeded:', error);
    }
  }
}

export { BiddingHandler };