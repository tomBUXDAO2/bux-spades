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
        specialRules: game.specialRules?.screamer || game.specialRules?.assassin ? 
          (game.specialRules?.screamer ? ['SCREAMER'] : []) : [],
        minPoints: game.minPoints,
        maxPoints: game.maxPoints,
        buyIn: game.buyIn,
        rated: game.rated,
        allowNil: game.rules?.allowNil ?? game.allowNil,
        allowBlindNil: game.rules?.allowBlindNil ?? game.allowBlindNil,
        league: game.league,
        whiz: game.rules?.bidType === 'WHIZ',
        mirror: game.rules?.bidType === 'MIRROR',
        gimmick: game.rules?.bidType === 'GIMMICK',
        screamer: game.specialRules?.screamer || false,
        assassin: game.specialRules?.assassin || false,
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
    
    // Create bot users in User table first if they don't exist
    console.log('[DATABASE] Creating bot users...');
    for (let i = 0; i < 4; i++) {
      const player = game.players[i];
      if (!player) continue;
      if (player && player.type === 'bot') {
        let retries = 3;
        let success = false;
        // Start with the provided username, but allow fallback if it collides
        let createUsername = player.username;
        while (retries > 0 && !success) {
          try {
            await prisma.user.upsert({
              where: { id: player.id },
              update: { updatedAt: new Date() },
              create: {
                id: player.id,
                username: createUsername,
                avatar: player.avatar || '/bot-avatar.jpg',
                discordId: null,
                coins: 0,
                createdAt: new Date(),
                updatedAt: new Date()
              }
            });
            console.log(`[DATABASE] Created/updated bot user: ${createUsername} (${player.id})`);
            success = true;
          } catch (error: any) {
            retries--;
            // If username unique constraint fails, try a suffixed variant to ensure uniqueness
            if (error?.code === 'P2002') {
              const suffix = player.id.slice(-6);
              createUsername = `${player.username}-${suffix}`;
              console.warn(`[DATABASE] Username collision for ${player.username}. Retrying with '${createUsername}' (${retries} retries left).`);
            } else {
              console.error(`[DATABASE] Failed to create bot user ${player.username} (${retries} retries left):`, error);
            }
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 100));
            } else {
              throw new Error(`Failed to create bot user ${player.username} after 3 attempts`);
            }
          }
        }
      }
    }
    
    // Create GamePlayer records for all players
    for (let i = 0; i < 4; i++) {
      const player = game.players[i];
      if (!player) continue;
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
    console.error('[DATABASE] Failed to log game start:', error);
    throw error;
  }
}
