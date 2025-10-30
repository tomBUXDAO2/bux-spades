// FIXED: Removed duplicate GameService imports
import { GameService } from '../../../services/GameService.js';
import { GameLoggingService } from '../../../services/GameLoggingService.js';
import { BotService } from '../../../services/BotService.js';
import { TrickCompletionService } from '../../../services/TrickCompletionService.js';
import { prisma } from '../../../config/database.js';
import redisGameState from '../../../services/RedisGameStateService.js';
import { playerTimerService } from '../../../services/PlayerTimerService.js';
import { PerformanceMiddleware } from '../../../middleware/PerformanceMiddleware.js';

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
    const maxRetries = 2;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        const { gameId, card } = data;
        const userId = this.socket.userId || data.userId;
        
        if (!userId) {
          this.socket.emit('error', { message: 'User not authenticated' });
          return;
        }
        
        // User playing card
        
        // Get current game state from database (ultra fast)
        const gameState = await PerformanceMiddleware.timeOperation('getGameStateForClient', () => 
          GameService.getGameStateForClient(gameId)
        );
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
        return; // Success - exit retry loop
        
      } catch (error) {
        retryCount++;
        console.error(`[CARD PLAY] Error in handlePlayCard (attempt ${retryCount}/${maxRetries}):`, error);
        
        // Check if it's a database connection error
        if (error.code === 'P1017' || error.message?.includes('Server has closed the connection')) {
          if (retryCount < maxRetries) {
            console.log(`[CARD PLAY] Database connection error, retrying in ${retryCount * 1000}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryCount * 1000));
            continue;
          }
        }
        
        // If we've exhausted retries or it's not a connection error, emit error
        this.socket.emit('error', { message: 'Failed to play card' });
        return;
      }
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

      // Get current game state (ultra fast for card play)
      const gameState = await PerformanceMiddleware.timeOperation('getGameForAction', () => 
        GameService.getGameForAction(gameId)
      );
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

      // PRE-VALIDATION: Core rule - cannot lead spades before broken unless only spades
      try {
        const cachedState = await GameService.getGameStateForClient(gameId);
        const trickCards = await prisma.trickCard.count({ where: { trickId: currentTrick.id } });
        const spadesBroken = cachedState?.play?.spadesBroken || false;
        if (trickCards === 0 && card?.suit === 'SPADES' && !spadesBroken) {
          const hands = await redisGameState.getPlayerHands(gameId);
          const hand = (hands && hands[player.seatIndex]) ? hands[player.seatIndex] : [];
          const hasNonSpades = hand.some((c) => c.suit !== 'SPADES');
          if (hasNonSpades) {
            console.log(`[CARD PLAY] CORE: Rejecting spade lead before broken for user ${userId} (seat ${player.seatIndex})`);
            // Emit rejection to clients and keep turn
            const updatedGameState = await GameService.getGameStateForClient(gameId);
            this.io.to(gameId).emit('card_played', {
              gameId,
              gameState: updatedGameState,
              cardPlayed: { userId, card, seatIndex: player.seatIndex, rejected: true }
            });
            if (isBot) {
              setTimeout(() => this.triggerBotPlayIfNeeded(gameId).catch(()=>{}), 100);
            }
            return;
          }
        }
      } catch (e) {
        console.warn('[CARD PLAY] Pre-validation failed (continuing):', e?.message || e);
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
      
      // Game state has changed - no caching to ensure fresh data

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
        
        // CRITICAL FIX: If this is a bot and the card was rejected, force bot to retry
        if (isBot) {
          console.log(`[CARD PLAY] Bot card rejected - forcing bot retry for seat ${player.seatIndex}`);
          // Add a small delay to prevent rapid retries
          setTimeout(async () => {
            try {
              await this.triggerBotPlayIfNeeded(gameId);
            } catch (error) {
              console.error(`[CARD PLAY] Error triggering bot retry:`, error);
            }
          }, 100);
        }
        
        return;
      }

      // Check if trick is complete (4 cards played) - use cached count
      const trickCards = await prisma.trickCard.findMany({
        where: { trickId: logResult.actualTrickId },
        orderBy: { playOrder: 'asc' },
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
          
          // CRITICAL: Don't emit card_played here - let the normal flow handle it
          // This prevents the 4th card from flickering due to double emission

          // EXTREME: NO DELAYS - COMPLETE IMMEDIATELY
          (async () => {
            // Find the winning player by seat index
            console.log(`[CARD PLAY] Looking for winning player at seat ${trickResult.winningSeatIndex}`);
            console.log(`[CARD PLAY] Available players:`, gameState.players.map(p => p ? ({ id: p.id, seatIndex: p.seatIndex, username: p.username || p.user?.username || 'Unknown' }) : null));
            
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

            // CRITICAL FIX: Don't emit card_played event for the 4th card when trick is complete
            // This prevents the 4th card from flickering - it will be shown through trick_complete event instead
            console.log(`[CARD PLAY] Skipping card_played event for 4th card to prevent flickering`);

            // Start timer for winning player if they are human (skip if round just completed)
            if (winningPlayer && winningPlayer.isHuman && !trickResult.isRoundComplete) {
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

            // Clear trick cards from table after animation (2 seconds delay) - only when trick is complete
            console.log(`[CARD PLAY] Trick result - isComplete: ${trickResult.isComplete}, winningSeatIndex: ${trickResult.winningSeatIndex}`);
            if (trickResult.isComplete) {
              // CRITICAL FIX: Clear table cards FIRST, then start new trick to prevent flickering
              console.log(`[CARD PLAY] Checking if round is complete - isRoundComplete: ${trickResult.isRoundComplete}`);
              
              // Clear table cards first (after 2 seconds)
              setTimeout(async () => {
                console.log('[CARD PLAY] Emitting clear_table_cards event - trick is complete');
                // Include isRoundComplete so clients can hard-lock table rendering on final trick of a hand
                this.io.to(gameId).emit('clear_table_cards', { gameId, isRoundComplete: !!trickResult.isRoundComplete });
                
                // THEN start new trick after table is cleared
                if (!trickResult.isRoundComplete) {
                  // CRITICAL FIX: Check if game still exists before creating new trick
                  const gameStillExists = await GameService.getGame(gameId);
                  if (!gameStillExists) {
                    console.log(`[CARD PLAY] Game ${gameId} no longer exists, skipping new trick creation`);
                    return;
                  }
                  
                  console.log(`[CARD PLAY] Starting new trick AFTER table cleared - round not complete, winningSeatIndex: ${trickResult.winningSeatIndex}`);
                  try {
                    await this.startNewTrickAfterClear(gameId, currentRound.id, gameState.currentTrick + 1, trickResult.winningSeatIndex);
                  } catch (error) {
                    console.log(`[CARD PLAY] Error creating new trick (game may be cleaned up): ${error.message}`);
                  }
                } else {
                  console.log(`[CARD PLAY] Round is complete, not starting new trick`);
                }
              }, 2000);
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
        
        // CRITICAL: Return here to prevent turn progression logic from running
        // when a trick is completed
        return;
        }
      } else {
        // Simple: move to next player clockwise
        const nextPlayerIndex = (player.seatIndex + 1) % 4;
        const nextPlayer = gameState.players.find(p => p && p.seatIndex === nextPlayerIndex);
        console.log(`[CARD PLAY] Moving to next player clockwise: ${nextPlayer?.username} (seat ${nextPlayerIndex})`);
        console.log(`[CARD PLAY] Next player details:`, {
          userId: nextPlayer?.userId,
          username: nextPlayer?.username,
          seatIndex: nextPlayer?.seatIndex,
          isHuman: nextPlayer?.isHuman
        });
        
        // CRITICAL: Use SINGLE unified system for currentPlayer updates
        await this.updateCurrentPlayer(gameId, nextPlayer?.userId);
        console.log(`[CARD PLAY] Moved to next player: ${nextPlayer?.username} (seat ${nextPlayerIndex})`);
        
        // Update current trick data in Redis (reuse the cards we already fetched at line 173)
        const currentTrickCardsForRedis = trickCards;
        
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
        
        // OPTIMIZED: Use optimized game state service with smart caching
        // CONSOLIDATED: Using GameService directly instead of OptimizedGameStateService
        const updatedGameState = await GameService.getGameStateForClient(gameId);
        
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
        
        // CRITICAL: Ensure the game state has the correct current player
        updatedGameState.currentPlayer = nextPlayer?.userId;
        
        // CRITICAL: Get the latest hands from Redis to ensure they're up-to-date
        const latestHands = await redisGameState.getPlayerHands(gameId);
        if (latestHands && latestHands.length > 0) {
          updatedGameState.hands = latestHands;
          updatedGameState.playerHands = latestHands;
          console.log(`[CARD PLAY] Updated game state with latest hands from Redis`);
        }
        
        // CRITICAL: Preserve spadesBroken flag after database update
        if (card.suit === 'SPADES') {
          updatedGameState.play = updatedGameState.play || {};
          updatedGameState.play.spadesBroken = true;
          console.log(`[CARD PLAY] Preserved spadesBroken = true after database update`);
        }
        
        // Update Redis cache with the complete updated state (single operation)
        await redisGameState.setGameState(gameId, updatedGameState);
        
        // Emitting card_played event
        // Game state updated
        console.log(`[CARD PLAY] Emitting card_played event with currentPlayer: ${updatedGameState.currentPlayer}`);
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
        console.log(`[CARD PLAY] DEBUG - Current player for timer:`, {
          found: !!currentPlayerForTimer,
          userId: currentPlayerForTimer?.userId,
          isHuman: currentPlayerForTimer?.isHuman,
          seatIndex: currentPlayerForTimer?.seatIndex
        });
        
        if (currentPlayerForTimer && currentPlayerForTimer.isHuman) {
          console.log(`[CARD PLAY] 🕐 STARTING TIMER for human player ${currentPlayerForTimer.userId} (seat ${currentPlayerForTimer.seatIndex})`);
          playerTimerService.startPlayerTimer(gameId, currentPlayerForTimer.userId, currentPlayerForTimer.seatIndex, 'playing');
        } else {
          console.log(`[CARD PLAY] ❌ NO TIMER - Player not found or not human:`, {
            player: currentPlayerForTimer,
            isHuman: currentPlayerForTimer?.isHuman
          });
        }

        // Trigger bot play if next player is a bot
        // CRITICAL: Get fresh game state after updateCurrentPlayer
        setTimeout(async () => {
          const freshGameState = await GameService.getGameStateForClient(gameId);
          if (freshGameState) {
            await this.triggerBotPlayIfNeeded(gameId);
          }
        }, 50); // Small delay to ensure database is updated
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
      // CRITICAL FIX: Check if round still exists before creating trick
      const roundExists = await prisma.round.findUnique({
        where: { id: roundId }
      });
      
      if (!roundExists) {
        console.log(`[CARD PLAY] Round ${roundId} no longer exists, skipping trick creation`);
        throw new Error(`Round ${roundId} no longer exists`);
      }
      
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
      
      // CRITICAL: Get FRESH game state (ultra fast)
      const game = await GameService.getGame(gameId);
      if (!game) {
        console.log(`[CARD PLAY] No game found in database: ${gameId}`);
        return;
      }

      console.log(`[CARD PLAY] Current player ID from database: ${game.currentPlayer}`);
      
      // Get fresh players from database with user data
      const dbPlayers = await prisma.gamePlayer.findMany({
        where: { gameId },
        include: { user: true }
      });
      
      // CRITICAL: Use the currentPlayer from the fresh database data
      const currentPlayer = dbPlayers.find(p => p.userId === game.currentPlayer);
      
      console.log(`[CARD PLAY] Found current player:`, currentPlayer ? { 
        id: currentPlayer.id, 
        username: currentPlayer.user?.username, 
        type: currentPlayer.isHuman ? 'human' : 'bot', 
        seatIndex: currentPlayer.seatIndex 
      } : 'null');
      
      if (!currentPlayer || currentPlayer.isHuman === true) {
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
      const botAlreadyPlayed = currentTrickCards && currentTrickCards.some(card => 
        card.seatIndex === currentPlayer.seatIndex || card.playerId === currentPlayer.userId
      );
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

      // CRITICAL: Create proper game object for bot service with fresh database data
      const gameForBot = {
        ...game, // Use fresh game data from database
        players: game.players, // Use the fresh players from database
        hands: hands
      };

      // Get bot card choice
      const botCard = await this.botService.playBotCard(gameForBot, currentPlayer.seatIndex);
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
   * With database connection retry logic to prevent games from getting stuck
   */
  async updateCurrentPlayer(gameId, userId) {
    const maxRetries = 3;
    let retryCount = 0;
    
    while (retryCount < maxRetries) {
      try {
        // Update database with retry logic
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
        
        // Success - break out of retry loop
        return;
        
      } catch (error) {
        retryCount++;
        console.error(`[CURRENT PLAYER] Error updating currentPlayer to ${userId} (attempt ${retryCount}/${maxRetries}):`, error);
        
        // Check if it's a database connection error
        if (error.code === 'P1017' || error.message?.includes('Server has closed the connection')) {
          if (retryCount < maxRetries) {
            console.log(`[CURRENT PLAYER] Database connection error, retrying in ${retryCount * 1000}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryCount * 1000));
            continue;
          }
        }
        
        // If we've exhausted retries or it's not a connection error, throw
        if (retryCount >= maxRetries) {
          console.error(`[CURRENT PLAYER] Failed to update currentPlayer after ${maxRetries} attempts, game may get stuck`);
          // Don't throw error - just log it to prevent game from getting stuck
          // The game will continue with the next player based on Redis cache
          return;
        }
      }
    }
  }
}

export { CardPlayHandler };