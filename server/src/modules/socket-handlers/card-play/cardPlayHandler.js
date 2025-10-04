import { GameService } from '../../../services/GameService.js';
import { GameLoggingService } from '../../../services/GameLoggingService.js';
import { BotService } from '../../../services/BotService.js';
import { TrickCompletionService } from '../../../services/TrickCompletionService.js';
import { prisma } from '../../../config/database.js';
import redisGameState from '../../../services/RedisGameStateService.js';

/**
 * DATABASE-FIRST CARD PLAY HANDLER
 * No in-memory state management - database is single source of truth
 */
class CardPlayHandler {
  constructor(io, socket) {
    this.io = io;
    this.socket = socket;
    this.loggingService = GameLoggingService;
    this.botService = new BotService();
  }

  async handlePlayCard(data) {
    try {
      const { gameId, card } = data;
      const userId = this.socket.userId || data.userId;
      
      if (!userId) {
        this.socket.emit('error', { message: 'User not authenticated' });
        return;
      }
      
      console.log(`[CARD PLAY] User ${userId} playing card:`, card);
      
      // Get current game state from database
      const gameState = await GameService.getGameStateForClient(gameId);
      if (!gameState) {
        this.socket.emit('error', { message: 'Game not found' });
        return;
      }

      // Validate it's the player's turn
      if (gameState.currentPlayer !== userId) {
        this.socket.emit('error', { message: 'Not your turn' });
        return;
      }

      // Process the card play in database
      await this.processCardPlay(gameId, userId, card, false);
    } catch (error) {
      console.error('[CARD PLAY] Error:', error);
      this.socket.emit('error', { message: 'Failed to play card' });
    }
  }

  /**
   * Process a card play - database only
   */
  async processCardPlay(gameId, userId, card, isBot = false) {
    try {
      console.log(`[CARD PLAY] Processing card play: user=${userId}, card=${card.rank} of ${card.suit}`);

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

      // Get current trick
      const currentTrick = await prisma.trick.findFirst({
        where: {
          roundId: currentRound.id,
          trickNumber: gameState.currentTrick || 1
        }
      });

      if (!currentTrick) {
        throw new Error(`Current trick not found for round ${currentRound.id}, trick ${gameState.currentTrick || 1}`);
      }

      // Log the card play to database (batch with other operations)
      const logResult = await this.loggingService.logCardPlay(
        gameId,
        currentRound.id,
        currentTrick.id,
        userId,
        player.seatIndex,
        card.suit,
        card.rank
      );

      // CRITICAL: If card play was rejected, move to next player immediately
      if (logResult.rejected) {
        console.log(`[CARD PLAY] Card play rejected for seat ${player.seatIndex}, moving to next player`);
        
        // Move to next player
        const nextPlayerIndex = (player.seatIndex + 1) % 4;
        const nextPlayer = gameState.players.find(p => p.seatIndex === nextPlayerIndex);
        
        // Update current player in database
        await GameService.updateGame(gameId, {
          currentPlayer: nextPlayer?.userId || null
        });

        // Clear Redis cache to force fresh game state
        const { redisClient } = await import('../../../config/redis.js');
        await redisClient.del(`game:state:${gameId}`);
        
        // Emit update to all players
        const updatedGameState = await GameService.getGameStateForClient(gameId);
        this.io.to(gameId).emit('card_played', {
          gameId,
          gameState: updatedGameState,
          cardPlayed: {
            userId,
            card,
            seatIndex: player.seatIndex,
            rejected: true
          }
        });

        // Trigger next player if it's a bot
        if (nextPlayer && nextPlayer.isHuman === false) {
          setTimeout(() => {
            this.triggerBotPlayIfNeeded(gameId);
          }, 500); // Small delay to let the UI update
        }

        console.log(`[CARD PLAY] Moved to next player: ${nextPlayer?.userId || 'null'}`);
        return;
      }

      // Check if trick is complete (4 cards played) - use cached count
      const trickCards = await prisma.trickCard.findMany({
        where: { trickId: logResult.actualTrickId },
        select: { id: true, seatIndex: true, suit: true, rank: true, playOrder: true }
      });

      if (trickCards.length >= 4) {
        // Complete the trick
        const trickResult = await TrickCompletionService.checkAndCompleteTrick(
          gameId,
          currentRound.id,
          logResult.actualTrickId,
          gameState.currentTrick,
          this.io // Pass io instance for round completion events
        );

        if (trickResult.isComplete) {
          console.log(`[CARD PLAY] Trick completed, winner: seat ${trickResult.winningSeatIndex}`);
          
          // First, emit card played event so client can render the 4th card
          const cardPlayedGameState = await GameService.getGameStateForClient(gameId);

          this.io.to(gameId).emit('card_played', {
            gameId,
            gameState: cardPlayedGameState,
            cardPlayed: {
              userId,
              card,
              seatIndex: player.seatIndex,
              isBot
            }
          });

          // EXTREME: NO DELAYS - COMPLETE IMMEDIATELY
          (async () => {
            // Find the winning player by seat index
            console.log(`[CARD PLAY] Looking for winning player at seat ${trickResult.winningSeatIndex}`);
            console.log(`[CARD PLAY] Available players:`, gameState.players.map(p => ({ id: p.id, seatIndex: p.seatIndex, username: p.username })));
            
            const winningPlayer = gameState.players.find(p => p.seatIndex === trickResult.winningSeatIndex);
            console.log(`[CARD PLAY] Found winning player:`, winningPlayer);
            
            if (!winningPlayer) {
              console.error(`[CARD PLAY] ERROR: No player found at seat ${trickResult.winningSeatIndex}`);
              console.error(`[CARD PLAY] Available seats:`, gameState.players.map(p => p.seatIndex));
              return;
            }
            
            // Update game state
            await GameService.updateGame(gameId, {
              currentTrick: gameState.currentTrick + 1,
              currentPlayer: winningPlayer.userId
            });

            // CRITICAL: Clear Redis cache to force fresh game state after trick completion
            const { redisClient } = await import('../../../config/redis.js');
            await redisClient.del(`game:state:${gameId}`);
            console.log(`[CARD PLAY] Cleared Redis cache after trick completion for fresh game state`);

            // Get the completed trick cards before updating game state
            const completedTrickCards = await prisma.trickCard.findMany({
              where: { trickId: logResult.actualTrickId },
              orderBy: { playOrder: 'asc' }
            });

            // Emit trick complete event
            const updatedGameState = await GameService.getGameStateForClient(gameId);
            this.io.to(gameId).emit('trick_complete', {
              gameId,
              gameState: updatedGameState,
              trickWinner: trickResult.winningSeatIndex,
              completedTrick: {
                cards: completedTrickCards.map(card => ({
                  suit: card.suit,
                  rank: card.rank,
                  seatIndex: card.seatIndex,
                  playerId: gameState.players.find(p => p.seatIndex === card.seatIndex)?.id
                }))
              }
            });

            // Start next trick if round not complete
            if (!trickResult.isRoundComplete) {
              // Create new trick
              await this.createNewTrick(gameId, currentRound.id, gameState.currentTrick + 1, trickResult.winningSeatIndex);
              
              // Emit trick started event
              const newGameState = await GameService.getGameStateForClient(gameId);
              this.io.to(gameId).emit('trick_started', {
                gameId,
                gameState: newGameState,
                currentPlayer: newGameState.currentPlayer
              });

              // EXTREME: NO DELAYS - TRIGGER IMMEDIATELY
              this.triggerBotPlayIfNeeded(gameId);
            }
          })(); // 500ms delay to show all 4 cards
        }
      } else {
        // Move to next player
        const nextPlayerIndex = (player.seatIndex + 1) % 4;
        const nextPlayer = gameState.players.find(p => p.seatIndex === nextPlayerIndex);
        
        await GameService.updateGame(gameId, {
          currentPlayer: nextPlayer?.userId
        });

        // CRITICAL: Clear Redis cache to force fresh game state with updated trick cards
        const { redisClient } = await import('../../../config/redis.js');
        await redisClient.del(`game:state:${gameId}`);
        console.log(`[CARD PLAY] Cleared Redis cache after card play for fresh trick cards`);

        // Emit card played event
        const updatedGameState = await GameService.getGameStateForClient(gameId);
        console.log(`[CARD PLAY] Emitting card_played event for game ${gameId}, currentTrick:`, updatedGameState.play?.currentTrick);
        this.io.to(gameId).emit('card_played', {
          gameId,
          gameState: updatedGameState,
          cardPlayed: {
            userId,
            card,
            seatIndex: player.seatIndex,
            isBot
          }
        });

        // Trigger bot play if next player is a bot
        // EXTREME: NO DELAYS - TRIGGER IMMEDIATELY
        this.triggerBotPlayIfNeeded(gameId);
      }

      console.log(`[CARD PLAY] Card play processed successfully`);
    } catch (error) {
      console.error('[CARD PLAY] Error processing card play:', error);
      throw error;
    }
  }

  /**
   * Create a new trick in database
   */
  async createNewTrick(gameId, roundId, trickNumber, leadSeatIndex) {
    try {
      const trick = await prisma.trick.create({
        data: {
          roundId,
          trickNumber,
          leadSeatIndex,
          winningSeatIndex: -1, // Will be updated when trick is complete
          createdAt: new Date()
        }
      });

      console.log(`[CARD PLAY] Created new trick ${trick.id} for round ${roundId}`);
      return trick;
    } catch (error) {
      console.error('[CARD PLAY] Error creating new trick:', error);
      throw error;
    }
  }

  /**
   * Trigger bot play if needed
   */
  async triggerBotPlayIfNeeded(gameId) {
    try {
      console.log(`[CARD PLAY] triggerBotPlayIfNeeded called for game ${gameId}`);
      const gameState = await GameService.getGameStateForClient(gameId);
      if (!gameState) {
        console.log(`[CARD PLAY] No game state found for game ${gameId}`);
        return;
      }

      console.log(`[CARD PLAY] Current player ID: ${gameState.currentPlayer}`);
      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      console.log(`[CARD PLAY] Found current player:`, currentPlayer ? { 
        id: currentPlayer.id, 
        username: currentPlayer.username, 
        type: currentPlayer.type, 
        seatIndex: currentPlayer.seatIndex 
      } : 'null');
      
      if (!currentPlayer || currentPlayer.type !== 'bot') {
        console.log(`[CARD PLAY] Not triggering bot play - currentPlayer is not a bot`);
        return;
      }

      // CRITICAL: Check if current trick is already full (4 cards)
      const currentTrickCards = gameState.play?.currentTrick || [];
      if (currentTrickCards.length >= 4) {
        console.log(`[CARD PLAY] Current trick is full (${currentTrickCards.length} cards), skipping bot play`);
        return;
      }

      // CRITICAL: Check if this bot has already played in the current trick
      const botAlreadyPlayed = currentTrickCards.some(card => card.seatIndex === currentPlayer.seatIndex);
      if (botAlreadyPlayed) {
        console.log(`[CARD PLAY] Bot ${currentPlayer.username} already played in current trick, skipping`);
        return;
      }

      console.log(`[CARD PLAY] Triggering bot play for ${currentPlayer.username} (seat ${currentPlayer.seatIndex})`);

      // Get bot's hand from Redis first, then fallback to database
      let hand = null;
      const hands = await redisGameState.getPlayerHands(gameId);
      if (hands && hands[currentPlayer.seatIndex]) {
        hand = hands[currentPlayer.seatIndex];
        console.log(`[CARD PLAY] Bot hand from Redis:`, hand.map(c => `${c.suit}${c.rank}`));
      } else {
        // Fallback to database
        const round = gameState.rounds.find(r => r.roundNumber === gameState.currentRound);
        if (!round) return;

        const handSnapshot = await prisma.roundHandSnapshot.findFirst({
          where: {
            roundId: round.id,
            seatIndex: currentPlayer.seatIndex
          }
        });

        if (!handSnapshot) return;
        hand = JSON.parse(handSnapshot.cards);
        console.log(`[CARD PLAY] Bot hand from database:`, hand.map(c => `${c.suit}${c.rank}`));
      }

      // Update the gameState with the current hands before passing to bot
      const updatedGameState = { ...gameState, hands: hands || [hand] };

      // Get bot card choice
      const botCard = await this.botService.playBotCard(updatedGameState, currentPlayer.seatIndex);
      if (botCard) {
        console.log(`[CARD PLAY] Bot ${currentPlayer.username} chose card: ${botCard.suit}${botCard.rank}`);
        // Process bot's card play
        await this.processCardPlay(gameId, currentPlayer.id, botCard, true);
      }
    } catch (error) {
      console.error('[CARD PLAY] Error triggering bot play:', error);
    }
  }
}

export { CardPlayHandler };