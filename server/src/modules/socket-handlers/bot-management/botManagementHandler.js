import { GameService } from '../../../services/GameService.js';
import { gameManager } from '../../../services/GameManager.js';
import { BotService } from '../../../services/BotService.js';
import { BotUserService } from '../../../services/BotUserService.js';
import { prisma } from '../../../config/database.js';
import { SystemMessageHandler } from '../chat/systemMessageHandler.js';

class BotManagementHandler {
  constructor(io, socket) {
    this.io = io;
    this.socket = socket;
    this.gameManager = gameManager;
    this.botService = new BotService();
    this.systemMessageHandler = new SystemMessageHandler(io, socket);
  }

  async handleAddBot(data) {
    try {
      const { gameId, seatIndex } = data;
      const userId = this.socket.userId || data.userId;
      
      if (!userId) {
        this.socket.emit('error', { message: 'User not authenticated' });
        return;
      }

      console.log(`[BOT MANAGEMENT] User ${userId} adding bot to seat ${seatIndex} in game ${gameId}`);
      
      // Get game
      const game = this.gameManager.getGame(gameId);
      if (!game) {
        this.socket.emit('error', { message: 'Game not found' });
        return;
      }

      // Check if user is in the game and can manage bots
      const player = game.players.find(p => p && p.userId === userId);
      if (!player) {
        this.socket.emit('error', { message: 'You are not in this game' });
        return;
      }

      // Check if seat is already occupied
      if (game.players[seatIndex]) {
        this.socket.emit('error', { message: 'Seat is already occupied' });
        return;
      }

      // Check if game is in waiting state
      if (game.status !== 'WAITING') {
        this.socket.emit('error', { message: 'Cannot add bots after game has started' });
        return;
      }

      // Add bot to game
      await this.botService.addBotToGame(game, seatIndex);

      // Update game in database
      await GameService.updateGame(gameId, {
        gameState: game.toJSON()
      });

      // Send system message
      const bot = game.players[seatIndex];
      this.systemMessageHandler.handleBotAdded(gameId, bot.username, seatIndex);

      // Broadcast game update
      this.io.to(gameId).emit('game_update', {
        gameId,
        gameState: game.toClientFormat()
      });

      console.log(`[BOT MANAGEMENT] Added bot to seat ${seatIndex} in game ${gameId}`);
      
    } catch (error) {
      console.error('[BOT MANAGEMENT] Error adding bot:', error);
      this.socket.emit('error', { message: 'Failed to add bot' });
    }
  }

  async handleRemoveBot(data) {
    try {
      const { gameId, seatIndex } = data;
      const userId = this.socket.userId || data.userId;
      
      if (!userId) {
        this.socket.emit('error', { message: 'User not authenticated' });
        return;
      }

      console.log(`[BOT MANAGEMENT] User ${userId} removing bot from seat ${seatIndex} in game ${gameId}`);
      
      // Get game
      const game = this.gameManager.getGame(gameId);
      if (!game) {
        this.socket.emit('error', { message: 'Game not found' });
        return;
      }

      // Check if user is in the game and can manage bots
      const player = game.players.find(p => p && p.userId === userId);
      if (!player) {
        this.socket.emit('error', { message: 'You are not in this game' });
        return;
      }

      // Check if seat is occupied by a bot
      const bot = game.players[seatIndex];
      if (!bot) {
        this.socket.emit('error', { message: 'No bot in this seat' });
        return;
      }

      if (bot.type !== 'bot') {
        this.socket.emit('error', { message: 'This seat is occupied by a human player' });
        return;
      }

      // Check if game is in waiting state
      if (game.status !== 'WAITING') {
        this.socket.emit('error', { message: 'Cannot remove bots after game has started' });
        return;
      }

      // Remove GamePlayer record first, then update state, then delete bot user
      await prisma.$transaction(async (tx) => {
        await tx.gamePlayer.deleteMany({
          where: {
            gameId: gameId,
            userId: bot.id
          }
        });

        // Remove bot from game (memory)
        game.players[seatIndex] = null;

        // Update game in database
        await GameService.updateGame(gameId, {
          gameState: game.toJSON()
        });

        // Finally delete the bot user
        await tx.user.deleteMany({ where: { id: bot.id } });
      });

      // Send system message
      this.systemMessageHandler.handleBotRemoved(gameId, bot.username);

      // Broadcast game update
      this.io.to(gameId).emit('game_update', {
        gameId,
        gameState: game.toClientFormat()
      });

      console.log(`[BOT MANAGEMENT] Removed bot from seat ${seatIndex} in game ${gameId}`);
      
    } catch (error) {
      console.error('[BOT MANAGEMENT] Error removing bot:', error);
      this.socket.emit('error', { message: 'Failed to remove bot' });
    }
  }

  async handleFillWithBots(data) {
    try {
      const { gameId } = data;
      const userId = this.socket.userId || data.userId;
      
      if (!userId) {
        this.socket.emit('error', { message: 'User not authenticated' });
        return;
      }

      console.log(`[BOT MANAGEMENT] User ${userId} filling empty seats with bots in game ${gameId}`);
      
      // Get game
      const game = this.gameManager.getGame(gameId);
      if (!game) {
        this.socket.emit('error', { message: 'Game not found' });
        return;
      }

      // Check if user is in the game and can manage bots
      const player = game.players.find(p => p && p.userId === userId);
      if (!player) {
        this.socket.emit('error', { message: 'You are not in this game' });
        return;
      }

      // Check if game is in waiting state
      if (game.status !== 'WAITING') {
        this.socket.emit('error', { message: 'Cannot add bots after game has started' });
        return;
      }

      // Fill empty seats with bots
      const addedBots = await this.botService.fillEmptySeatsWithBots(game);

      // Update game in database
      await GameService.updateGame(gameId, {
        gameState: game.toJSON()
      });

      // Send system messages for each bot added
      for (let i = 0; i < 4; i++) {
        const bot = game.players[i];
        if (bot && bot.type === 'bot') {
          this.systemMessageHandler.handleBotAdded(gameId, bot.username, i);
        }
      }

      // Broadcast game update
      this.io.to(gameId).emit('game_update', {
        gameId,
        gameState: game.toClientFormat()
      });

      console.log(`[BOT MANAGEMENT] Filled ${addedBots} empty seats with bots in game ${gameId}`);
      
    } catch (error) {
      console.error('[BOT MANAGEMENT] Error filling with bots:', error);
      this.socket.emit('error', { message: 'Failed to fill with bots' });
    }
  }
}

export { BotManagementHandler };
