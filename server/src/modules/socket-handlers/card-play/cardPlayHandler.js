import { GameService } from '../../../services/GameService.js';
import { GameLoggingService } from '../../../services/GameLoggingService.js';
import { BotService } from '../../../services/BotService.js';
import { TrickCompletionService } from '../../../services/TrickCompletionService.js';
import { prisma } from '../../../config/database.js';

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

      // Log the card play to database
      const logResult = await this.loggingService.logCardPlay(
        gameId,
        currentRound.id,
        currentTrick.id,
        userId,
        player.seatIndex,
        card.suit,
        card.rank
      );

      // Check if trick is complete (4 cards played)
      const trickCards = await prisma.trickCard.findMany({
        where: { trickId: logResult.actualTrickId }
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

          // Wait 500ms to show all 4 cards before completing trick
          setTimeout(async () => {
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

              // Trigger bot play if current player is a bot
              setTimeout(() => {
                this.triggerBotPlayIfNeeded(gameId);
              }, 50); // Reduced delay for faster gameplay
            }
          }, 500); // 500ms delay to show all 4 cards
        }
      } else {
        // Move to next player
        const nextPlayerIndex = (player.seatIndex + 1) % 4;
        const nextPlayer = gameState.players.find(p => p.seatIndex === nextPlayerIndex);
        
        await GameService.updateGame(gameId, {
          currentPlayer: nextPlayer?.userId
        });

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
        setTimeout(() => {
          this.triggerBotPlayIfNeeded(gameId);
        }, 100);
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
      const gameState = await GameService.getGameStateForClient(gameId);
      if (!gameState) return;

      const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
      if (!currentPlayer || currentPlayer.type !== 'bot') return;

      // Get bot's hand from database
      const round = gameState.rounds.find(r => r.roundNumber === gameState.currentRound);
      if (!round) return;

      const handSnapshot = await prisma.roundHandSnapshot.findFirst({
        where: {
          roundId: round.id,
          seatIndex: currentPlayer.seatIndex
        }
      });

      if (!handSnapshot) return;

      // Get bot card choice
      const botCard = await this.botService.playBotCard(gameState, currentPlayer.seatIndex);
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