import { prisma } from '../config/database.js';
// CONSOLIDATED: GameManager removed - using GameService directly
// CONSOLIDATED: Game model removed - using GameService directly

export class GameCreationService {
  // Create game from app (rated if all human, unrated if any bots)
  static async createAppGame(gameData, creatorId) {
    try {
      const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // Map client format codes to database format names
      const formatMapping = {
        'REG': 'REGULAR',
        'WHIZ': 'WHIZ', 
        'MIRROR': 'MIRROR',
        'GIMMICK': 'GIMMICK'
      };
      
      // Handle gimmick variants - if format is a gimmick variant, map to GIMMICK format
      const gimmickVariants = ['SUICIDE', '4 OR NIL', 'BID 3', 'BID HEARTS', 'CRAZY ACES', 'JOKER WHIZ'];
      const clientFormat = gameData.format || gameData.biddingOption || 'REGULAR';
      
      // Map client gimmick variants to database enum values
      const gimmickVariantMapping = {
        'SUICIDE': 'SUICIDE',
        '4 OR NIL': 'BID4NIL',
        'BID 3': 'BID3',
        'BID HEARTS': 'BIDHEARTS',
        'CRAZY ACES': 'CRAZY_ACES',
        'JOKER WHIZ': 'JOKER'
      };
      
      let dbFormat;
      let gimmickVariant = gameData.gimmickVariant || null;
      
      if (gimmickVariants.includes(clientFormat)) {
        // This is a gimmick variant - set format to GIMMICK and variant to the specific type
        dbFormat = 'GIMMICK';
        gimmickVariant = gimmickVariantMapping[clientFormat] || clientFormat;
      } else {
        // Regular format mapping
        dbFormat = formatMapping[clientFormat] || clientFormat;
      }
      
      // Determine if rated based on player types
      const hasBots = gameData.players.some(p => p.type === 'bot');
      const isRated = !hasBots; // Rated only if all human players
      
      // CONSOLIDATED: Game model removed - using GameService.createGame directly
      const gameDataForService = {
        id: gameId,
        createdById: creatorId,
        mode: gameData.mode || 'PARTNERS',
        format: dbFormat, // Use mapped format
        gimmickVariant: gimmickVariant, // Use processed gimmick variant
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
          bidType: clientFormat, // Use original client format for display
          specialRules: gameData.specialRules || {}
        }
      });

      // CONSOLIDATED: Using GameService.createGame instead of direct database operations
      const { GameService } = await import('./GameService.js');
      const game = await GameService.createGame(gameDataForService);

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
      // CONSOLIDATED: Game model removed - using GameService.createGame directly
      const gameDataForService = {
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

      // CONSOLIDATED: Using GameService.createGame instead of direct database operations
      const { GameService } = await import('./GameService.js');
      const game = await GameService.createGame(gameDataForService);

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
      // CONSOLIDATED: GameManager removed - using GameService directly

      // Update database with populated players
      // CONSOLIDATED: GameManager removed - using GameService directly

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
