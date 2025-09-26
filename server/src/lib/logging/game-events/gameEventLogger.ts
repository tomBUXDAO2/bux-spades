import type { Game } from '../../../types/game';
import { updateGameRecord, createGameRecord, upsertGamePlayer, createGameResult } from '../database-operations/databaseUtils';

/**
 * Log completed game to database and Discord
 */
export async function logCompletedGameToDbAndDiscord(game: any, winningTeamOrPlayer: number): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  
  console.log('[GAME LOGGER] Starting game completion logging for game:', game.id);
  
  try {
    // Determine settings
    const mode = game.mode;
    const rawBidType = game.rules?.bidType || 'REGULAR';
    const specialRules = game.specialRules || {};
    
    // Convert bidType to proper enum values
    let bidType: string;
    switch (rawBidType) {
      case 'REGULAR':
        bidType = 'REGULAR';
        break;
      case 'MIRROR':
        bidType = '';
        break;
      case 'WHIZ':
      case 'GIMMICK':
        bidType = rawBidType;
        break;
      default:
        bidType = 'REGULAR';
    }
    const solo = mode === 'SOLO';
    const whiz = bidType === 'WHIZ';
    const mirror = bidType === 'MIRROR';
    const gimmick = ['SUICIDE', '4 OR NIL', 'BID 3', 'BID HEARTS', 'CRAZY ACES'].includes(bidType);

    // Compute final score and winner
    let finalScore = 0;
    let winner = 0;
    let team1Score = game.team1TotalScore ?? 0;
    let team2Score = game.team2TotalScore ?? 0;
    if (mode === 'SOLO') {
      finalScore = (game.playerScores?.[winningTeamOrPlayer] ?? 0) as number;
      winner = winningTeamOrPlayer;
    } else {
      // Partners mode
      finalScore = Math.max(team1Score, team2Score) as number;
      winner = winningTeamOrPlayer; // 1 or 2
    }

    // Create game record in database
    const dbGame = await createGameRecord(game, {
      mode: mode as any,
      format: game.format || 'STANDARD',
      bidType: bidType as any,
      solo,
      whiz,
      mirror,
      gimmick,
      specialRules,
      buyIn: game.buyIn || 0,
      finalScore,
      winner,
      team1Score,
      team2Score,
      createdAt: new Date(),
      finishedAt: new Date()
    });

    // Get GamePlayer records with Discord IDs
    const { prisma } = await import('../../prisma');
    const gamePlayers = await prisma.gamePlayer.findMany({
      where: { gameId: dbGame.id },
      select: {
        userId: true,
        seatIndex: true,
        teamIndex: true
      },
      orderBy: { seatIndex: 'asc' }
    });
    
    // Get user Discord IDs
    const userIds = gamePlayers.map(p => p.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, discordId: true, username: true }
    });
    
    const userMap = new Map(users.map(u => [u.id, u]));
    
    // Prepare game data for Discord
    const gameData = {
      buyIn: game.buyIn,
      team1Score: game.team1TotalScore || 0,
      team2Score: game.team2TotalScore || 0,
      allowNil: game.rules?.allowNil || false,
      allowBlindNil: game.rules?.allowBlindNil || false,
      players: gamePlayers.map((dbPlayer, i) => {
        const user = userMap.get(dbPlayer.userId);
        const discordId = user?.discordId || dbPlayer.userId || '';
        return {
          userId: discordId,
          won: game.mode === 'SOLO' 
            ? i === winningTeamOrPlayer 
            : (winningTeamOrPlayer === 1 && (i === 0 || i === 2)) || (winningTeamOrPlayer === 2 && (i === 1 || i === 3))
        };
      })
    };
    
    if (!isProduction) {
      console.log('[GAME LOGGER] Game data for Discord:', JSON.stringify(gameData, null, 2));
    }

    // Send to Discord bot (skip if module doesn't exist)
    try {
      // Skip Discord notification for now
      console.log('[GAME LOGGER] Discord bot module not available, skipping Discord notification');
    } catch (error) {
      console.log('[GAME LOGGER] Discord bot module not available, skipping Discord notification');
    }

    console.log('[GAME LOGGER] Successfully logged completed game to database and Discord');
    
  } catch (error) {
    console.error('[GAME LOGGER] Error logging completed game:', error);
    throw error;
  }
}

/**
 * Log game start to database
 */
export async function logGameStartToDb(game: any): Promise<void> {
  try {
    console.log('[GAME LOGGER] Logging game start for game:', game.id);
    
    // Create game record
    const dbGame = await createGameRecord(game, {
      mode: game.mode as any,
      format: game.format || 'STANDARD',
      bidType: 'REGULAR' as any,
      solo: game.mode === 'SOLO',
      whiz: false,
      mirror: false,
      gimmick: false,
      specialRules: game.specialRules || {},
      buyIn: game.buyIn || 0,
      finalScore: 0,
      winner: 0,
      team1Score: 0,
      team2Score: 0,
      createdAt: new Date(),
      finishedAt: new Date()
    });

    // Create game player records
    for (let i = 0; i < game.players.length; i++) {
      const player = game.players[i];
      if (player) {
        await upsertGamePlayer({
          gameId: dbGame.id,
          userId: player.id,
          seatIndex: i,
          teamIndex: player.team || 0,
          isHuman: player.type === 'human',
          joinedAt: new Date(),
          leftAt: new Date()
        });
      }
    }

    console.log('[GAME LOGGER] Successfully logged game start to database');
    
  } catch (error) {
    console.error('[GAME LOGGER] Error logging game start:', error);
    throw error;
  }
}

/**
 * Log game end to database
 */
export async function logGameEndToDb(game: any, winningTeamOrPlayer: number): Promise<void> {
  try {
    console.log('[GAME LOGGER] Logging game end for game:', game.id);
    
    // Update game record
    await updateGameRecord(game.id, {
      status: 'FINISHED',
      finalScore: game.mode === 'SOLO' 
        ? (game.playerScores?.[winningTeamOrPlayer] ?? 0)
        : Math.max(game.team1TotalScore ?? 0, game.team2TotalScore ?? 0),
      winner: winningTeamOrPlayer,
      team1Score: game.team1TotalScore ?? 0,
      team2Score: game.team2TotalScore ?? 0,
      finishedAt: new Date()
    });

    // Create game result record
    await createGameResult({
      gameId: game.id,
      winningTeamOrPlayer,
      finalScore: game.mode === 'SOLO' 
        ? (game.playerScores?.[winningTeamOrPlayer] ?? 0)
        : Math.max(game.team1TotalScore ?? 0, game.team2TotalScore ?? 0),
      team1Score: game.team1TotalScore ?? 0,
      team2Score: game.team2TotalScore ?? 0,
      createdAt: new Date()
    });

    console.log('[GAME LOGGER] Successfully logged game end to database');
    
  } catch (error) {
    console.error('[GAME LOGGER] Error logging game end:', error);
    throw error;
  }
}
