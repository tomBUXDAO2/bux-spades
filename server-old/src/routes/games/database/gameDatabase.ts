import { prisma } from '../../../lib/prisma';
import { Game, GamePlayer } from '@prisma/client';

export async function logGameStart(game: any): Promise<string> {
  try {
    console.log('[DATABASE] Starting to log game to database...');
    
    // Generate a unique database ID for the game
    const dbGameId = game.id;
    game.dbGameId = dbGameId;
    
    // Create the game record
    const dbGame = await prisma.game.create({
      data: {
        id: dbGameId,
        createdById: game.creatorId,
        mode: game.mode,
        format: game.rules?.bidType || 'REGULAR',
        gimmickVariant: game.forcedBid || null,
        isLeague: game.league || false,
        isRated: game.rated || false,
        status: game.status,
        specialRules: game.specialRules || {},
        startedAt: game.status === 'BIDDING' ? new Date() : null,
        finishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    
    console.log('[DATABASE] Created game record with ID:', dbGame.id);
    
    // Create GamePlayer records for each player
    for (let i = 0; i < game.players.length; i++) {
      const player = game.players[i];
      if (!player || !player.id) continue;
      
      const userId = player.id;
      const team = game.mode === 'PARTNERS' ? (i === 0 || i === 2 ? 1 : 2) : null;
      
      await prisma.gamePlayer.create({
        data: {
          id: `player_${dbGame.id}_${i}_${Date.now()}`,
          gameId: dbGame.id,
          userId: userId,
          seatIndex: i,
          teamIndex: team,
          isHuman: player.type === 'human'
        }
      });
    }
    
    console.log('[DATABASE] Successfully logged game to database');
    return dbGame.id;
    
  } catch (error) {
    console.error('[DATABASE] Error logging game to database:', error);
    throw error;
  }
}
