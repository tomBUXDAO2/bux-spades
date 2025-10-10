import { GameService } from '../../../services/GameService.js';
import { GameLoggingService } from '../../../services/GameLoggingService.js';
import { BotService } from '../../../services/BotService.js';
import { TrickCompletionService } from '../../../services/TrickCompletionService.js';
import { prisma } from '../../../config/database.js';
import redisGameState from '../../../services/RedisGameStateService.js';
import { playerTimerService } from '../../../services/PlayerTimerService.js';

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
      
      // User playing card
      
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
      // Processing card play

      // Clear any existing timer for this game (player has acted)
      playerTimerService.clearTimer(gameId);

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
      const player = gameState.players.find(p => p && p.userId === userId);
      if (!player) {
        throw new Error('Player not found in game');
      }

      // Get current trick
      let currentTrick = await prisma.trick.findFirst({
        where: {
          roundId: currentRound.id,
          trickNumber: gameState.currentTrick || 1
        }
      });

      if (!currentTrick) {
        throw new Error(`Current trick not found for round ${currentRound.id}, trick ${gameState.currentTrick || 1}`);
      }

      // Log the card play to database (now optimized for performance)
      const logResult = await this.loggingService.logCardPlay(
        gameId,
        currentRound.id,
        currentTrick.id,
        userId,
        player.seatIndex,
        card.suit,
        card.rank
      );

      // CRITICAL: If card play was rejected, KEEP TURN WITH SAME PLAYER
      if (logResult.rejected) {
        console.log(`[CARD PLAY] Card play rejected for seat ${player.seatIndex}, keeping turn with same player`);
        
        // DO NOT change currentPlayer - keep it with the same player
        // The player must play a valid card
        
        // Emit rejection to all players
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

        console.log(`[CARD PLAY] Card rejected - turn remains with ${userId}`);
        return;
      }

      // Check if trick is complete (4 cards played) - use cached count
      const trickCards = await prisma.trickCard.findMany({
        where: { trickId: logResult.actualTrickId },
        select: { id: true, seatIndex: true, suit: true, rank: true, playOrder: true }
      });

      // Checking trick completion
      if (trickCards.length >= 4) {
        // Trick is complete, calling TrickCompletionService
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
          // NOTE: This will be emitted again after updateCurrentPlayer with correct currentPlayer
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
            console.log(`[CARD PLAY] Available players:`, gameState.players.map(p => p ? ({ id: p.id, seatIndex: p.seatIndex, username: p.username }) : null));
            
            const winningPlayer = gameState.players.find(p => p && p.seatIndex === trickResult.winningSeatIndex);
            console.log(`[CARD PLAY] Found winning player:`, winningPlayer);
            
            if (!winningPlayer) {
              console.error(`[CARD PLAY] ERROR: No player found at seat ${trickResult.winningSeatIndex}`);
              console.error(`[CARD PLAY] Available seats:`, gameState.players.map(p => p ? p.seatIndex : null));
              return;
            }
            
            // CRITICAL: Use SINGLE unified system for currentPlayer updates
            console.log(`[CARD PLAY] About to call updateCurrentPlayer with winningPlayer.userId: ${winningPlayer.userId}`);
            await this.updateCurrentPlayer(gameId, winningPlayer.userId);

            // CRITICAL: Emit card_played event with correct currentPlayer after updateCurrentPlayer
            console.log(`[CARD PLAY] About to get corrected game state after updateCurrentPlayer`);
            const correctedGameState = await GameService.getGameStateForClient(gameId);
            console.log(`[CARD PLAY] Corrected game state currentPlayer: ${correctedGameState.currentPlayer}, expected: ${winningPlayer.userId}`);
            this.io.to(gameId).emit('card_played', {
              gameId,
              gameState: correctedGameState,
              cardPlayed: {
                userId,
                card,
                seatIndex: player.seatIndex,
                isBot
              },
              currentTrick: correctedGameState.play?.currentTrick || []
            });
            console.log(`[CARD PLAY] Emitted corrected card_played event with currentPlayer: ${correctedGameState.currentPlayer}`);

            // Start timer for winning player if they are human (card play - always apply)
            if (winningPlayer && winningPlayer.isHuman) {
              console.log(`[CARD PLAY] Starting timer for winning player ${winningPlayer.userId} (seat ${winningPlayer.seatIndex})`);
              playerTimerService.startPlayerTimer(gameId, winningPlayer.userId, winningPlayer.seatIndex, 'playing');
            }

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
                  playerId: gameState.players.find(p => p && p.seatIndex === card.seatIndex)?.userId
                }))
              }
            });

            // Clear trick cards from table after animation (3 seconds delay) - only when trick is complete
            console.log(`[CARD PLAY] Trick result - isComplete: ${trickResult.isComplete}, winningSeatIndex: ${trickResult.winningSeatIndex}`);
            if (trickResult.isComplete) {
              setTimeout(() => {
                console.log('[CARD PLAY] Emitting clear_table_cards event - trick is complete');
                this.io.to(gameId).emit('clear_table_cards', { gameId });
                
                // CRITICAL: Start new trick AFTER clearing table cards to prevent race condition
                console.log(`[CARD PLAY] Checking if round is complete - isRoundComplete: ${trickResult.isRoundComplete}`);
                if (!trickResult.isRoundComplete) {
                  console.log(`[CARD PLAY] Starting new trick - round not complete, winningSeatIndex: ${trickResult.winningSeatIndex}`);
                  this.startNewTrickAfterClear(gameId, currentRound.id, gameState.currentTrick + 1, trickResult.winningSeatIndex);
                } else {
                  console.log(`[CARD PLAY] Round is complete, not starting new trick`);
                }
              }, 800);
            } else {
              console.log(`[CARD PLAY] NOT emitting clear_table_cards event - trick is not complete`);
            }
            
            // Emit trick started event (only if new trick was created)
            if (!trickResult.isRoundComplete && !trickResult.isComplete) {
              const newGameState = await GameService.getGameStateForClient(gameId);
              console.log(`[CARD PLAY] Trick started - newGameState.currentPlayer: ${newGameState.currentPlayer}, expected: ${gameState.players.find(p => p && p.seatIndex === trickResult.winningSeatIndex)?.userId}`);
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
        
        // CRITICAL: Return here to prevent turn progression logic from running
        // when a trick is completed
        return;
      } else {
        // Simple: move to next player clockwise
        const nextPlayerIndex = (player.seatIndex + 1) % 4;
        const nextPlayer = gameState.players.find(p => p && p.seatIndex === nextPlayerIndex);
        console.log(`[CARD PLAY] Moving to next player clockwise: ${nextPlayer?.username} (seat ${nextPlayerIndex})`);
        
        // CRITICAL: Use SINGLE unified system for currentPlayer updates
        await this.updateCurrentPlayer(gameId, nextPlayer?.userId);
        console.log(`[CARD PLAY] Moved to next player: ${nextPlayer?.username} (seat ${nextPlayerIndex})`);
        
        // Update current trick data in Redis (reuse the cards we already fetched)
        const currentTrickCardsForRedis = await prisma.trickCard.findMany({
          where: { trickId: logResult.actualTrickId },
          orderBy: { playOrder: 'asc' }
        });
        
        if (currentTrickCardsForRedis && currentTrickCardsForRedis.length > 0) {
          const formattedTrickCards = currentTrickCardsForRedis.map(card => ({
            suit: card.suit,
            rank: card.rank,
            seatIndex: card.seatIndex,
            playerId: gameState.players.find(p => p.seatIndex === card.seatIndex)?.userId
          }));
          
          await redisGameState.setCurrentTrick(gameId, formattedTrickCards);
          console.log(`[CARD PLAY] Updated Redis current trick data with ${formattedTrickCards.length} cards`);
        }

        // Emit card played event
        
        // PERFORMANCE: Use cached game state from Redis and update incrementally
        let updatedGameState = await redisGameState.getGameState(gameId);
        
        // CRITICAL: For SOLO games, if playerScores are missing or all zeros, fetch from database
        if (updatedGameState && updatedGameState.gameMode === 'SOLO') {
          const hasValidScores = updatedGameState.playerScores && 
                                updatedGameState.playerScores.some(s => s !== 0);
          
          if (!hasValidScores) {
            console.log(`[CARD PLAY] WARNING: playerScores missing or all zeros, fetching from database`);
            const freshState = await GameService.getFullGameStateFromDatabase(gameId);
            if (freshState && freshState.playerScores) {
              updatedGameState.playerScores = freshState.playerScores;
              updatedGameState.playerBags = freshState.playerBags;
              console.log(`[CARD PLAY] Restored playerScores from database:`, updatedGameState.playerScores);
            }
          } else {
            console.log(`[CARD PLAY] playerScores present in Redis:`, updatedGameState.playerScores);
          }
        }
        
        // If no Redis cache, fallback to database (should rarely happen)
        if (!updatedGameState) {
          updatedGameState = await GameService.getFullGameStateFromDatabase(gameId);
        }
        
        // Update current trick data in the game state
        if (currentTrickCardsForRedis && currentTrickCardsForRedis.length > 0) {
          const formattedTrickCards = currentTrickCardsForRedis.map(card => ({
            suit: card.suit,
            rank: card.rank,
            seatIndex: card.seatIndex,
            playerId: gameState.players.find(p => p.seatIndex === card.seatIndex)?.userId
          }));
          
          // Update the game state with current trick data
          updatedGameState.play = updatedGameState.play || {};
          updatedGameState.play.currentTrick = formattedTrickCards;
          updatedGameState.currentTrickCards = formattedTrickCards;
        }
        
        // Update spadesBroken flag if needed
        if (!updatedGameState.play) updatedGameState.play = {};
        if (card.suit === 'SPADES') {
          updatedGameState.play.spadesBroken = true;
        }
        
        // Update Redis cache with the complete updated state (single operation)
        await redisGameState.setGameState(gameId, updatedGameState);
        
        // Emitting card_played event
        // Game state updated
        this.io.to(gameId).emit('card_played', {
          gameId,
          gameState: updatedGameState,
          currentTrick: updatedGameState.play?.currentTrick || [],
          cardPlayed: {
            userId,
            card,
            seatIndex: player.seatIndex,
            isBot
          }
        });

        // Start timer for next player if they are human (card play - always apply)
        const currentPlayerForTimer = updatedGameState.players.find(p => p && p.userId === updatedGameState.currentPlayer);
        if (currentPlayerForTimer && currentPlayerForTimer.isHuman) {
          console.log(`[CARD PLAY] Starting timer for next player ${currentPlayerForTimer.userId} (seat ${currentPlayerForTimer.seatIndex})`);
          playerTimerService.startPlayerTimer(gameId, currentPlayerForTimer.userId, currentPlayerForTimer.seatIndex, 'playing');
        }

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
    console.log(`[CARD PLAY] createNewTrick called - gameId: ${gameId}, roundId: ${roundId}, trickNumber: ${trickNumber}, leadSeatIndex: ${leadSeatIndex}`);
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

      // CRITICAL: Update game state to set currentTrick number
      await GameService.updateGame(gameId, {
        currentTrick: trickNumber
      });
      console.log(`[CARD PLAY] Updated game state: currentTrick=${trickNumber}`);

      // NOTE: currentPlayer is already set by the calling code (updateCurrentPlayer)
      // We don't need to set it again here
      console.log(`[CARD PLAY] createNewTrick - leadSeatIndex: ${leadSeatIndex}, currentPlayer should already be set by updateCurrentPlayer`);

      // CRITICAL: Clear current trick data from Redis cache
      await redisGameState.setCurrentTrick(gameId, []);
      console.log(`[CARD PLAY] Cleared current trick data from Redis cache`);

      // CRITICAL: Update Redis cache with fresh game state after creating new trick
      // This is already handled by updateCurrentPlayer, but ensure it's done
      console.log(`[CARD PLAY] Redis cache should already be updated by updateCurrentPlayer`);

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
      
      // CRITICAL: Get fresh player data directly from database, not from cached game state
      const game = await GameService.getGame(gameId);
      if (!game) {
        console.error(`[CARD PLAY] Game not found in database: ${gameId}`);
        return;
      }
      
      // Get fresh players from database with user data
      const dbPlayers = await prisma.gamePlayer.findMany({
        where: { gameId },
        include: { user: true }
      });
      
      const currentPlayer = dbPlayers.find(p => p.userId === gameState.currentPlayer);
      
      console.log(`[CARD PLAY] Found current player:`, currentPlayer ? { 
        id: currentPlayer.id, 
        username: currentPlayer.user?.username, 
        type: currentPlayer.isHuman ? 'human' : 'bot', 
        seatIndex: currentPlayer.seatIndex 
      } : 'null');
      
      if (!currentPlayer || currentPlayer.isHuman !== false) {
        console.log(`[CARD PLAY] Not triggering bot play - currentPlayer is not a bot`);
        return;
      }

      // CRITICAL: Get hands directly from Redis, not from game state
      const hands = await redisGameState.getPlayerHands(gameId);
      if (!hands || !Array.isArray(hands) || hands.length === 0) {
        console.error(`[CARD PLAY] No hands found in Redis for bot service`);
        return;
      }

      // CRITICAL: Get fresh current trick data from Redis
      const currentTrickCards = await redisGameState.getCurrentTrick(gameId);
      console.log(`[CARD PLAY] Current trick cards from Redis:`, currentTrickCards);
      
      // CRITICAL: Check if current trick is already full (4 cards)
      if (currentTrickCards && currentTrickCards.length >= 4) {
        console.log(`[CARD PLAY] Current trick is full (${currentTrickCards.length} cards), skipping bot play`);
        return;
      }

      // CRITICAL: Check if this bot has already played in the current trick
      const botAlreadyPlayed = currentTrickCards && currentTrickCards.some(card => card.seatIndex === currentPlayer.seatIndex);
      if (botAlreadyPlayed) {
        console.log(`[CARD PLAY] Bot ${currentPlayer.username} already played in current trick, skipping`);
        return;
      }

      // CRITICAL: Prevent same bot from playing twice in rapid succession
      const lastBotPlayTime = this.lastBotPlayTimes?.get(gameId);
      const currentTime = Date.now();
      if (lastBotPlayTime && (currentTime - lastBotPlayTime) < 100) {
        console.log(`[CARD PLAY] Bot play too recent, skipping to prevent rapid fire`);
        return;
      }
      
      // Track bot play time
      if (!this.lastBotPlayTimes) {
        this.lastBotPlayTimes = new Map();
      }
      this.lastBotPlayTimes.set(gameId, currentTime);

      console.log(`[CARD PLAY] Triggering bot play for ${currentPlayer.username} (seat ${currentPlayer.seatIndex})`);

      // Get bot's hand from Redis first, then fallback to database
      let hand = null;
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
      const updatedGameState = { ...gameState, hands: hands };

      // Get bot card choice
      const botCard = await this.botService.playBotCard(updatedGameState, currentPlayer.seatIndex);
      if (botCard) {
        console.log(`[CARD PLAY] Bot ${currentPlayer.username} chose card: ${botCard.suit}${botCard.rank}`);
        
        // INSTANT FEEDBACK: Emit card immediately for instant rendering
        const currentTrickCards = await redisGameState.getCurrentTrick(gameId);
        const optimisticTrick = [
          ...(currentTrickCards || []),
          { suit: botCard.suit, rank: botCard.rank, seatIndex: currentPlayer.seatIndex, playerId: currentPlayer.userId }
        ];
        
        const cachedGameState = await redisGameState.getGameState(gameId);
        if (cachedGameState) {
          cachedGameState.play = cachedGameState.play || {};
          cachedGameState.play.currentTrick = optimisticTrick;
          cachedGameState.currentTrickCards = optimisticTrick;
          
          // Emit immediately for instant feedback
          this.io.to(gameId).emit('card_played', {
            gameId,
            gameState: cachedGameState,
            currentTrick: optimisticTrick,
            cardPlayed: {
              userId: currentPlayer.userId,
              card: botCard,
              seatIndex: currentPlayer.seatIndex,
              isBot: true
            }
          });
        }
        
        // Process bot's card play asynchronously (don't await)
        this.processCardPlay(gameId, currentPlayer.userId, botCard, true).catch(err => {
          console.error(`[CARD PLAY] Error processing bot card play:`, err);
        });
      }
    } catch (error) {
      console.error('[CARD PLAY] Error triggering bot play:', error);
    }
  }

  /**
   * Start new trick after clearing table cards to prevent race condition
   */
  async startNewTrickAfterClear(gameId, roundId, trickNumber, leadSeatIndex) {
    try {
      console.log(`[CARD PLAY] startNewTrickAfterClear called - gameId: ${gameId}, roundId: ${roundId}, trickNumber: ${trickNumber}, leadSeatIndex: ${leadSeatIndex}`);
      
      // Create new trick
      const newTrick = await this.createNewTrick(gameId, roundId, trickNumber, leadSeatIndex);
      console.log(`[CARD PLAY] Successfully created new trick after clear:`, newTrick.id);
      
      // CRITICAL: Emit trick_started event to notify clients that new trick has started
      const updatedGameState = await GameService.getGameStateForClient(gameId);
      this.io.to(gameId).emit('trick_started', {
        gameId,
        gameState: updatedGameState,
        currentPlayer: updatedGameState.currentPlayer
      });
      console.log(`[CARD PLAY] Emitted trick_started for new trick ${trickNumber}`);
      
      // Trigger bot play if next player is a bot
      this.triggerBotPlayIfNeeded(gameId);
      
    } catch (error) {
      console.error('[CARD PLAY] Error starting new trick after clear:', error);
      throw error;
    }
  }

  /**
   * CRITICAL FIX: Update currentPlayer in both database AND Redis cache
   */
  async updateCurrentPlayer(gameId, userId) {
    try {
      // Update database
      await GameService.updateGame(gameId, {
        currentPlayer: userId
      });
      console.log(`[CURRENT PLAYER] Updated currentPlayer to ${userId} in database`);
      
      // CRITICAL: Also update Redis cache to prevent stale data
      const cachedGameState = await redisGameState.getGameState(gameId);
      if (cachedGameState) {
        cachedGameState.currentPlayer = userId;
        await redisGameState.setGameState(gameId, cachedGameState);
        console.log(`[CURRENT PLAYER] Updated currentPlayer to ${userId} in Redis cache`);
      }
    } catch (error) {
      console.error(`[CURRENT PLAYER] Error updating currentPlayer to ${userId}:`, error);
      throw error;
    }
  }
}

export { CardPlayHandler };