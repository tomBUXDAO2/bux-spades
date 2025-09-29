import { prisma } from '../config/database.js';
import { gameManager } from './GameManager.js';
import { Game } from '../models/Game.js';

export class GameCreationService {
  // Create game from app (rated if all human, unrated if any bots)
  static async createAppGame(gameData, creatorId) {
    try {
      const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Determine if rated based on player types
      const hasBots = gameData.players.some(p => p.type === 'bot');
      const isRated = !hasBots; // Rated only if all human players
      
      const game = new Game({
        id: gameId,
        createdById: creatorId,
        mode: gameData.mode || 'PARTNERS',
        format: gameData.format || 'REGULAR',
        gimmickVariant: gameData.gimmickVariant || null,
        isLeague: false, // App games are not league games
        isRated,
        status: 'WAITING',
        minPoints: gameData.minPoints || -100,
        maxPoints: gameData.maxPoints || 200,
        nilAllowed: gameData.nilAllowed !== false,
        blindNilAllowed: gameData.blindNilAllowed || false,
        specialRules: gameData.specialRules || {},
        buyIn: gameData.buyIn || 0,
        players: gameData.players || [],
        rules: gameData.rules || {
          gameType: 'PARTNERS',
          allowNil: gameData.nilAllowed !== false,
          allowBlindNil: gameData.blindNilAllowed || false,
          coinAmount: gameData.buyIn || 0,
          maxPoints: gameData.maxPoints || 200,
          minPoints: gameData.minPoints || -100,
          bidType: 'REGULAR',
          specialRules: gameData.specialRules || {}
        }
      });

      // Create in database
      await prisma.game.create({
        data: {
          id: game.id,
          createdById: game.createdById,
          mode: game.mode,
          format: game.format,
          gimmickVariant: game.gimmickVariant,
          isLeague: game.isLeague,
          isRated: game.isRated,
          status: game.status,
          minPoints: game.minPoints,
          maxPoints: game.maxPoints,
          nilAllowed: game.nilAllowed,
          blindNilAllowed: game.blindNilAllowed,
          specialRules: game.specialRules,
          buyIn: game.buyIn,
          gameState: game,
          currentRound: 1,
          currentTrick: 0,
          currentPlayer: null,
          dealer: 0,
          createdAt: new Date()
        }
      });

      // Add to memory
      gameManager.addGame(game);

      console.log(`[GAME CREATION] Created app game ${gameId} (rated: ${isRated})`);
      return game;

    } catch (error) {
      console.error('[GAME CREATION] Error creating app game:', error);
      throw error;
    }
  }

  // Create game from Discord command (always rated, always league)
  static async createDiscordGame(commandData) {
    try {
      const gameId = `discord_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Discord games are always rated and league
      const game = new Game({
        id: gameId,
        createdById: commandData.createdBy,
        mode: 'PARTNERS', // Discord games are always partners
        format: 'REGULAR', // Default format
        gimmickVariant: null,
        isLeague: true,
        isRated: true,
        status: 'WAITING',
        minPoints: -100,
        maxPoints: commandData.maxPoints || 200,
        nilAllowed: true,
        blindNilAllowed: false,
        specialRules: {},
        buyIn: 0,
        players: [], // Will be populated when players join
        rules: {
          gameType: 'PARTNERS',
          allowNil: true,
          allowBlindNil: false,
          coinAmount: 0,
          maxPoints: commandData.maxPoints || 200,
          minPoints: -100,
          bidType: 'REGULAR',
          specialRules: {}
        }
      });

      // Create in database
      await prisma.game.create({
        data: {
          id: game.id,
          createdById: game.createdById,
          mode: game.mode,
          format: game.format,
          gimmickVariant: game.gimmickVariant,
          isLeague: game.isLeague,
          isRated: game.isRated,
          status: game.status,
          minPoints: game.minPoints,
          maxPoints: game.maxPoints,
          nilAllowed: game.nilAllowed,
          blindNilAllowed: game.blindNilAllowed,
          specialRules: game.specialRules,
          buyIn: game.buyIn,
          gameState: game,
          currentRound: 1,
          currentTrick: 0,
          currentPlayer: null,
          dealer: 0,
          createdAt: new Date()
        }
      });

      // Create DiscordGame record
      await prisma.discordGame.create({
        data: {
          id: `discord_game_${Date.now()}`,
          gameId: game.id,
          commandMessageId: commandData.commandMessageId,
          channelId: commandData.channelId,
          createdBy: commandData.createdBy,
          player1Id: commandData.players[0],
          player2Id: commandData.players[1],
          player3Id: commandData.players[2],
          player4Id: commandData.players[3],
          createdAt: new Date()
        }
      });

      // Pre-populate players (Discord games start with all 4 players)
      for (let i = 0; i < 4; i++) {
        const userId = commandData.players[i];
        
        // Get user info from database
        const user = await prisma.user.findUnique({
          where: { discordId: userId }
        });

        if (user) {
          game.players[i] = {
            id: user.id,
            discordId: userId,
            username: user.username,
            type: 'human',
            seatIndex: i,
            team: i % 2,
            hand: [],
            bid: null,
            tricks: 0,
            points: 0,
            bags: 0,
            nil: false,
            blindNil: false,
            connected: false // Will be true when they join the table
          };

          // Create GamePlayer record
          await prisma.gamePlayer.create({
            data: {
              gameId: game.id,
              userId: user.id,
              seatIndex: i,
              teamIndex: i % 2,
              isHuman: true,
              joinedAt: new Date()
            }
          });
        }
      }

      // Set first player as current player
      game.currentPlayer = game.players[0]?.id || null;

      // Add to memory
      gameManager.addGame(game);

      // Update database with populated players
      await gameManager.saveGame(gameId);

      console.log(`[GAME CREATION] Created Discord game ${gameId} with 4 players`);
      return game;

    } catch (error) {
      console.error('[GAME CREATION] Error creating Discord game:', error);
      throw error;
    }
  }

  // Get Discord games waiting for players to join table
  static async getDiscordGamesWaitingForTable() {
    try {
      const discordGames = await prisma.discordGame.findMany({
        where: {
          startedAt: null,
          game: {
            status: 'WAITING'
          }
        },
        include: {
          game: true
        },
        orderBy: {
          createdAt: 'asc'
        }
      });

      return discordGames;
    } catch (error) {
      console.error('[GAME CREATION] Error getting Discord games:', error);
      throw error;
    }
  }

  // Mark Discord game as started (when all players join table)
  static async markDiscordGameStarted(gameId) {
    try {
      await prisma.discordGame.update({
        where: { gameId },
        data: { startedAt: new Date() }
      });

      console.log(`[GAME CREATION] Marked Discord game ${gameId} as started`);
    } catch (error) {
      console.error('[GAME CREATION] Error marking Discord game as started:', error);
      throw error;
    }
  }
}
