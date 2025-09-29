import { prisma } from '../config/database.js';
import { Game } from '../models/Game.js';

export class GameService {
  // Create a new game
  static async createGame(gameData) {
    try {
      const dbGame = await prisma.game.create({
        data: {
          id: gameData.id,
          mode: gameData.mode,
          maxPoints: gameData.maxPoints,
          minPoints: gameData.minPoints,
          buyIn: gameData.buyIn,
          status: 'WAITING',
          dealer: 0,
          currentRound: 1,
          currentTrick: 0,
          currentPlayer: null,
          gameState: gameData,
          createdAt: new Date()
        }
      });

      return new Game({
        ...gameData,
        status: 'WAITING'
      });
    } catch (error) {
      console.error('[GAME SERVICE] Error creating game:', error);
      throw error;
    }
  }

  // Get game by ID
  static async getGame(gameId) {
    try {
      const dbGame = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          GamePlayer: {
            orderBy: { seatIndex: 'asc' }
          }
        }
      });

      if (!dbGame) {
        return null;
      }

      // Convert DB game to our Game model
      const players = new Array(4).fill(null);
      dbGame.GamePlayer.forEach(player => {
        if (player.seatIndex >= 0 && player.seatIndex < 4) {
          players[player.seatIndex] = {
            id: player.userId,
            username: player.username,
            type: player.isBot ? 'bot' : 'human',
            seatIndex: player.seatIndex,
            team: player.team,
            hand: player.hand || [],
            bid: player.bid,
            tricks: player.tricks || 0,
            points: player.points || 0,
            bags: player.bags || 0,
            nil: player.nil || false,
            blindNil: player.blindNil || false,
            connected: true
          };
        }
      });

      const gameState = dbGame.gameState || {};
      
      return new Game({
        id: dbGame.id,
        status: dbGame.status,
        mode: dbGame.mode,
        maxPoints: dbGame.maxPoints,
        minPoints: dbGame.minPoints,
        buyIn: dbGame.buyIn,
        players,
        currentPlayer: dbGame.currentPlayer,
        currentRound: dbGame.currentRound,
        currentTrick: dbGame.currentTrick,
        dealer: dbGame.dealer,
        createdAt: dbGame.createdAt,
        startedAt: dbGame.startedAt,
        finishedAt: dbGame.finishedAt,
        ...gameState
      });
    } catch (error) {
      console.error('[GAME SERVICE] Error getting game:', error);
      throw error;
    }
  }

  // Update game in database
  static async updateGame(game) {
    try {
      await prisma.game.update({
        where: { id: game.id },
        data: {
          status: game.status,
          currentPlayer: game.currentPlayer,
          currentRound: game.currentRound,
          currentTrick: game.currentTrick,
          dealer: game.dealer,
          gameState: game,
          startedAt: game.startedAt,
          finishedAt: game.finishedAt,
          updatedAt: new Date()
        }
      });

      // Update player hands
      for (let i = 0; i < 4; i++) {
        const player = game.players[i];
        if (player) {
          await prisma.gamePlayer.upsert({
            where: {
              gameId_seatIndex: {
                gameId: game.id,
                seatIndex: i
              }
            },
            update: {
              hand: player.hand,
              bid: player.bid,
              tricks: player.tricks,
              points: player.points,
              bags: player.bags,
              nil: player.nil,
              blindNil: player.blindNil
            },
            create: {
              gameId: game.id,
              userId: player.id,
              username: player.username,
              seatIndex: i,
              team: player.team,
              isBot: player.type === 'bot',
              hand: player.hand,
              bid: player.bid,
              tricks: player.tricks,
              points: player.points,
              bags: player.bags,
              nil: player.nil,
              blindNil: player.blindNil
            }
          });
        }
      }

      return game;
    } catch (error) {
      console.error('[GAME SERVICE] Error updating game:', error);
      throw error;
    }
  }

  // Get all active games
  static async getActiveGames() {
    try {
      const dbGames = await prisma.game.findMany({
        where: {
          status: {
            in: ['WAITING', 'BIDDING', 'PLAYING']
          }
        },
        include: {
          GamePlayer: {
            orderBy: { seatIndex: 'asc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return dbGames.map(dbGame => {
        const players = new Array(4).fill(null);
        dbGame.GamePlayer.forEach(player => {
          if (player.seatIndex >= 0 && player.seatIndex < 4) {
            players[player.seatIndex] = {
              id: player.userId,
              username: player.username,
              type: player.isBot ? 'bot' : 'human',
              seatIndex: player.seatIndex,
              team: player.team,
              hand: player.hand || [],
              bid: player.bid,
              tricks: player.tricks || 0,
              points: player.points || 0,
              bags: player.bags || 0,
              nil: player.nil || false,
              blindNil: player.blindNil || false,
              connected: true
            };
          }
        });

        return new Game({
          id: dbGame.id,
          status: dbGame.status,
          mode: dbGame.mode,
          maxPoints: dbGame.maxPoints,
          minPoints: dbGame.minPoints,
          buyIn: dbGame.buyIn,
          players,
          currentPlayer: dbGame.currentPlayer,
          currentRound: dbGame.currentRound,
          currentTrick: dbGame.currentTrick,
          dealer: dbGame.dealer,
          createdAt: dbGame.createdAt,
          startedAt: dbGame.startedAt,
          finishedAt: dbGame.finishedAt,
          ...(dbGame.gameState || {})
        });
      });
    } catch (error) {
      console.error('[GAME SERVICE] Error getting active games:', error);
      throw error;
    }
  }

  // Delete game
  static async deleteGame(gameId) {
    try {
      await prisma.gamePlayer.deleteMany({
        where: { gameId }
      });
      
      await prisma.game.delete({
        where: { id: gameId }
      });

      return true;
    } catch (error) {
      console.error('[GAME SERVICE] Error deleting game:', error);
      throw error;
    }
  }
}
