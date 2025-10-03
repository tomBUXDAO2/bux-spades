import { GameService } from '../../../services/GameService.js';
import { prisma } from '../../../config/database.js';
import { gameManager } from '../../../services/GameManager.js';
import { BotService } from '../../../services/BotService.js';
import { SystemMessageHandler } from '../chat/systemMessageHandler.js';

class GameStartHandler {
  constructor(io, socket) {
    this.io = io;
    this.socket = socket;
    this.gameManager = gameManager;
    this.botService = new BotService();
    this.systemMessageHandler = new SystemMessageHandler(io, socket);
  }

  async handleStartGame(data) {
    try {
      const { gameId, rated } = data || {};
      const userId = this.socket.userId || data.userId;
      
      if (!userId) {
        this.socket.emit('error', { message: 'User not authenticated' });
        return;
      }
      
      console.log(`[GAME START] User ${userId} starting game ${gameId} (rated=${rated === true})`);

      // Verify game exists
      const dbGame = await GameService.getGame(gameId);
      if (!dbGame) {
        this.socket.emit('error', { message: 'Game not found' });
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
      const gameState = await GameService.getGameStateForClient(gameId);
      this.io.to(gameId).emit('game_started', { gameId, gameState });
      this.io.to(gameId).emit('game_update', { gameId, gameState });

      // Trigger bot bidding if current player is a bot
      if (gameState.currentPlayer) {
        const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayer);
        if (currentPlayer && currentPlayer.type === 'bot') {
          console.log(`[GAME START] Current player is bot ${currentPlayer.username}, triggering bot bid`);
          // Import and use BiddingHandler
          const { BiddingHandler } = await import('../bidding/biddingHandler.js');
          const biddingHandler = new BiddingHandler(this.io, this.socket);
          // Trigger immediately, no delay
          biddingHandler.triggerBotBidIfNeeded(gameId);
        }
      }
    } catch (error) {
      console.error('[GAME START] Error:', error);
      this.socket.emit('error', { message: 'Failed to start game' });
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
