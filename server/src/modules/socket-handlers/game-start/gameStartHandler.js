import { GameService } from '../../../services/GameService.js';
import { prisma } from '../../../config/database.js';
import { gameManager } from '../../../services/GameManager.js';
import { BotService } from '../../../services/BotService.js';
import { SystemMessageHandler } from '../chat/systemMessageHandler.js';

// Global mutex to prevent concurrent game starts across all socket connections
const startingGames = new Set();

class GameStartHandler {
  constructor(io, socket) {
    this.io = io;
    this.socket = socket;
    this.gameManager = gameManager;
    this.botService = new BotService();
    this.systemMessageHandler = new SystemMessageHandler(io, socket);
  }

  async handleStartGame(data) {
    const { gameId, rated } = data || {};
    const userId = this.socket.userId || data?.userId;

    if (!gameId) {
      console.error('[GAME START] No gameId provided in handleStartGame data');
      this.socket.emit('error', { message: 'Game ID is missing' });
      return;
    }

    // Prevent concurrent game starts
    if (startingGames.has(gameId)) {
      console.log(`[GAME START] Game ${gameId} is already being started, ignoring duplicate request`);
      return;
    }
    
    startingGames.add(gameId);

    try {
      console.log(`[GAME START] Starting game ${gameId} (rated: ${rated})`);
      if (!userId) {
        this.socket.emit('error', { message: 'User not authenticated' });
        startingGames.delete(gameId);
        return;
      }
      console.log(`[GAME START] User ${userId} starting game ${gameId} (rated=${rated === true})`);

      // Verify game exists with retry logic for database mutex conflicts
      let dbGame = null;
      let retries = 0;
      const maxRetries = 5;
      
      while (!dbGame && retries < maxRetries) {
        dbGame = await GameService.getGame(gameId);
        if (!dbGame) {
          retries++;
          if (retries < maxRetries) {
            console.log(`[GAME START] Game not found, retrying (${retries}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, 200 * retries)); // Exponential backoff
          }
        }
      }
      
      if (!dbGame) {
        console.error(`[GAME START] Game ${gameId} not found after ${maxRetries} retries`);
        this.socket.emit('error', { message: 'Game not found' });
        startingGames.delete(gameId);
        return;
      }
      
      // Persist rated flag if provided
      if (typeof rated === 'boolean') {
        await GameService.updateGame(gameId, { isRated: rated });
      }

      // Ensure there is at least one player
      const players = await prisma.gamePlayer.findMany({ where: { gameId }, orderBy: { seatIndex: 'asc' } });
      if (!players || players.length === 0) {
        this.socket.emit('error', { message: 'Cannot start game - no players' });
        startingGames.delete(gameId);
        return;
      }

      // Start the game in DB-first mode
      await GameService.startGame(gameId);

      // Deal initial hands and set current bidder/currentPlayer
      console.log(`[GAME START] About to deal initial hands for game ${gameId}`);
      await GameService.dealInitialHands(gameId);
      console.log(`[GAME START] Successfully dealt initial hands for game ${gameId}`);

      // System message
      this.systemMessageHandler.sendSystemMessage(gameId, '🟢 Game started');

      // Emit started and updated state to clients (DB-first)
      const gameState = await GameService.getFullGameStateFromDatabase(gameId);
      this.io.to(gameId).emit('game_started', { gameId, gameState });
      this.io.to(gameId).emit('game_update', { gameId, gameState });

      // CRITICAL: Remove from starting games set IMMEDIATELY after successful completion
      startingGames.delete(gameId);

      // Wait for cards to be rendered before starting bidding
      console.log(`[GAME START] Waiting 2 seconds for cards to render before starting bidding`);
      setTimeout(async () => {
        // Trigger bot bidding if current player is a bot
        console.log(`[GAME START] Checking for bot bidding - currentPlayer: ${gameState.currentPlayer}`);
        if (gameState.currentPlayer) {
          // Get the game from database to check if current player is a bot
          const game = await GameService.getGame(gameId);
          if (game) {
            const currentPlayer = game.players.find(p => p.userId === gameState.currentPlayer);
            console.log(`[GAME START] Found current player:`, currentPlayer ? {
              id: currentPlayer.userId,
              username: currentPlayer.user?.username,
              isHuman: currentPlayer.isHuman,
              seatIndex: currentPlayer.seatIndex
            } : 'null');
            
            if (currentPlayer && !currentPlayer.isHuman) {
              console.log(`[GAME START] Triggering bot bid for ${currentPlayer.user?.username}`);
              // Import and use BiddingHandler
              const { BiddingHandler } = await import('../bidding/biddingHandler.js');
              const biddingHandler = new BiddingHandler(this.io, this.socket);
              // Trigger bot bid
              await biddingHandler.triggerBotBidIfNeeded(gameId);
            }
          }
        } else {
          console.log(`[GAME START] No current player set - cannot trigger bot bidding`);
        }
      }, 2000); // 2 second delay for cards to render
    } catch (error) {
      console.error('[GAME START] Error in handleStartGame:', error);
      console.error('[GAME START] Error stack:', error.stack);
      this.socket.emit('error', { message: 'Failed to start game' });
      
      // Remove from starting games set on error too
      startingGames.delete(gameId);
    }
  }

  /**
   * Continue bot bidding chain until human player or bidding complete
   */
  async continueBotBiddingChain(gameId, game) {
    const currentBidder = game.getCurrentBidder();
    
    console.log(`[BOT BIDDING CHAIN] Current bidder: ${currentBidder?.id}, type: ${game.players[currentBidder?.seatIndex]?.type}, bidding complete: ${game.isBiddingComplete()}`);
    
    // Check if current bidder is a bot and bidding isn't complete
    if (currentBidder && 
        game.players[currentBidder.seatIndex]?.type === 'bot' && 
        !game.isBiddingComplete()) {
      
      setTimeout(async () => {
        try {
          await this.botService.makeBotBid(game, currentBidder.seatIndex);
          await GameService.updateGame(gameId, { 
            gameState: game.toJSON(),
            currentPlayer: game.getCurrentBidder()?.id || null
          });
          
          this.io.to(gameId).emit('bidding_update', {
            gameId,
            gameState: game.toClientFormat(),
            bidMade: {
              userId: currentBidder.id,
              bid: game.players[currentBidder.seatIndex].bid,
              isBot: true,
            },
            currentBidder: game.getCurrentBidder(),
          });

          // Check if bidding is complete after bot bid
          if (game.isBiddingComplete()) {
            game.startPlay();
            await GameService.updateGame(gameId, {
              status: 'PLAYING',
              gameState: game.toJSON()
            });
            this.io.to(gameId).emit('game_update', {
              gameId,
              gameState: game.toClientFormat(),
              phase: 'PLAYING'
            });
            console.log(`[GAME START] Bidding complete for game ${gameId}, starting play phase`);
          } else {
            // Continue the chain if there are more bots to bid
            // Get fresh game object from GameManager to ensure we have the latest state
            const freshGame = this.gameManager.getGame(gameId);
            if (freshGame) {
              this.continueBotBiddingChain(gameId, freshGame);
            }
          }
        } catch (botErr) {
          console.error('[GAME START] Bot bidding chain error:', botErr);
        }
      }, 400);
    }
  }
}

export { GameStartHandler };
