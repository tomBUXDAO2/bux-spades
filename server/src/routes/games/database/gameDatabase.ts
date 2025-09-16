import type { Game } from '../../../types/game';
import prisma from '../../../lib/prisma';

/**
 * Log game start to database
 */
export async function logGameStart(game: Game): Promise<void> {
  try {
    const dbGame = await prisma.game.create({
      data: {
        id: game.id,
        creatorId: game.creatorId,
        status: game.status,
        gameMode: game.gameMode,
        bidType: game.rules?.bidType || 'REGULAR',
        specialRules: game.rules?.specialRules?.screamer || game.rules?.specialRules?.assassin ? 
          (game.rules?.specialRules?.screamer ? ['SCREAMER'] : []) : [],
        minPoints: game.minPoints,
        maxPoints: game.maxPoints,
        buyIn: game.buyIn,
        rated: game.rated,
        allowNil: game.allowNil,
        allowBlindNil: game.allowBlindNil,
        league: game.league,
        whiz: game.rules?.bidType === 'WHIZ',
        mirror: game.rules?.bidType === 'MIRROR',
        gimmick: ['SUICIDE', '4 OR NIL', 'BID 3', 'BID HEARTS', 'CRAZY ACES'].includes(game.rules?.bidType || ''),
        screamer: game.rules?.specialRules?.screamer || false,
        assassin: game.rules?.specialRules?.assassin || false,
        solo: game.solo,
        currentRound: game.currentRound,
        currentTrick: game.currentTrick,
        dealer: game.dealerIndex,
        gameState: game as any,
        lastActionAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    game.dbGameId = dbGame.id;
    console.log('[DATABASE] Game logged with ID:', dbGame.id);
    
    // Create GamePlayer records for all players
    console.log('[DATABASE] Creating GamePlayer records...');
    for (let i = 0; i < 4; i++) {
      const player = game.players[i];
      if (player) {
        try {
          const team = game.gameMode === 'PARTNERS' ? (i === 0 || i === 2 ? 1 : 2) : null;
          
          // For bots, use the universal bot user ID instead of the unique bot ID
          let userId = player.id;
          if (player.type === 'bot') {
            userId = player.id;
          }
          
          await prisma.gamePlayer.create({
            data: {
              id: `player_${dbGame.id}_${i}_${Date.now()}`,
              gameId: dbGame.id,
              userId: userId,
              position: i,
              team: team,
              bid: null,
              bags: 0,
              points: 0,
              username: player.username,
              discordId: player.discordId || null,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          });
          console.log(`[DATABASE] Created GamePlayer record for ${player.username} at position ${i} with userId ${userId}`);
        } catch (error) {
          console.error(`[DATABASE] Failed to create GamePlayer record for ${player.username}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('[DATABASE] Failed to log game:', error);
    throw error;
  }
}
