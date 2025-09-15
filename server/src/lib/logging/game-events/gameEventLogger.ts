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
    const gameMode = game.gameMode;
    const rawBidType = game.rules?.bidType || 'REGULAR';
    const specialRules = game.specialRules || {};
    
    // Convert bidType to proper enum values
    let bidType: string;
    switch (rawBidType) {
      case 'REGULAR':
        bidType = 'REGULAR';
        break;
      case 'MIRROR':
        bidType = 'MIRRORS';
        break;
      case 'WHIZ':
      case 'GIMMICK':
        bidType = rawBidType;
        break;
      default:
        bidType = 'REGULAR';
    }
    const solo = gameMode === 'SOLO';
    const whiz = bidType === 'WHIZ';
    const mirror = bidType === 'MIRROR';
    const gimmick = ['SUICIDE', '4 OR NIL', 'BID 3', 'BID HEARTS', 'CRAZY ACES'].includes(bidType);

    // Compute final score and winner
    let finalScore = 0;
    let winner = 0;
    let team1Score = game.team1TotalScore ?? 0;
    let team2Score = game.team2TotalScore ?? 0;
    if (gameMode === 'SOLO') {
      finalScore = (game.playerScores?.[winningTeamOrPlayer] ?? 0) as number;
      winner = winningTeamOrPlayer;
    } else {
      // Partners mode
      finalScore = Math.max(team1Score, team2Score) as number;
      winner = winningTeamOrPlayer; // 1 or 2
    }

    // Update or create game record
    let dbGame: any;
    if (game.dbGameId) {
      try {
        const gameData = {
          bidType: bidType as any,
          specialRules: (() => {
            const rules: any[] = [];
            if (specialRules.screamer) rules.push('SCREAMER');
            if (specialRules.assassin) rules.push('ASSASSIN');
            return rules;
          })()
        };
        
        dbGame = await updateGameRecord(game.dbGameId, gameData);
        if (!isProduction) {
          console.log('[GAME COMPLETED] Updated existing game in database:', game.dbGameId);
        }
      } catch (updateError) {
        console.error('[GAME UPDATE FAILED] Could not update existing game, creating new one:', updateError);
        // Fall back to creating new game if update fails
        game.dbGameId = null;
      }
    }
    
    if (!game.dbGameId) {
      // Fallback: create new game record if dbGameId is missing
      const gameData = {
        bidType: bidType as any,
        specialRules: (() => {
          const rules: any[] = [];
          if (specialRules.screamer) rules.push('SCREAMER');
          if (specialRules.assassin) rules.push('ASSASSIN');
          return rules;
        })()
      };
      
      dbGame = await createGameRecord(game, gameData);
      if (!isProduction) {
        console.log('[GAME COMPLETED] Created new game record in database:', dbGame.id);
      }
    }

    // Create player records
    if (!isProduction) {
      console.log('[GAME LOGGER] Creating GamePlayer records for game:', dbGame.id);
      console.log('[GAME LOGGER] Players array:', game.players?.map((p: any) => ({ id: p?.id, type: p?.type, username: p?.username })));
    }
    
    for (let i = 0; i < 4; i++) {
      const player = game.players[i];
      if (!player) {
        if (!isProduction) {
          console.log(`[GAME LOGGER] Skipping player ${i}: null`);
        }
        continue;
      }
      
      try {
        await upsertGamePlayer(dbGame.id, player, i, gameMode, winner);
        if (!isProduction) {
          console.log(`[GAME LOGGER] Upserted GamePlayer for ${player.username} at position ${i}`);
        }
      } catch (playerError) {
        console.error(`[GAME LOGGER] Failed to upsert GamePlayer for position ${i}:`, playerError);
        console.error(`[GAME LOGGER] Player data:`, player);
      }
    }

    // Create game result record
    const { prisma } = await import('../../prisma');
    const dbGamePlayers = await prisma.gamePlayer.findMany({
      where: { gameId: dbGame.id },
      orderBy: { position: 'asc' }
    });

    const playerResults = {
      players: game.players.map((p: any, i: number) => {
        const dbPlayer = dbGamePlayers.find(gp => gp.position === i);
        return {
          position: i,
          userId: p?.id, // DB user id
          discordId: p?.discordId || null,
          username: p?.username,
          team: gameMode === 'PARTNERS' ? (i === 0 || i === 2 ? 1 : 2) : null,
          finalBid: dbPlayer?.bid || 0,
          finalTricks: dbPlayer?.tricksMade || 0,
          finalBags: dbPlayer?.finalBags || 0,
          finalScore: dbPlayer?.finalScore || 0,
          won: gameMode === 'SOLO' ? i === winner : (i === 0 || i === 2 ? winner === 1 : winner === 2)
        };
      })
    };

    await createGameResult(dbGame.id, game, winner, finalScore, team1Score, team2Score, playerResults);
    
    if (!isProduction) {
      console.log(`Created comprehensive game result record for game ${dbGame.id}`);
    }

    // Send Discord results for league games
    if ((game as any).league && !(game as any).discordResultsSent) {
      await sendDiscordResults(game, dbGame, winningTeamOrPlayer);
    }
    
  } catch (err) {
    console.error('[GAME LOGGER] Failed to log completed game (server):', err);
    console.error('[GAME LOGGER] Error details:', {
      message: (err as any).message,
      stack: (err as any).stack,
      gameId: game?.id,
      gameStatus: game?.status
    });
    throw err; // Re-throw to let caller know it failed
  }
}

/**
 * Send Discord results for league games
 */
async function sendDiscordResults(game: any, dbGame: any, winningTeamOrPlayer: number): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  
  try {
    const { sendLeagueGameResults } = await import('../../../discord-bot/results');
    const { discordClient } = await import('../../../discord-bot');
    
    // Create game line string
    const formatCoins = (amount: number) => amount >= 1000000 ? `${amount / 1000000}M` : `${amount / 1000}k`;
    const typeUpper = (game.rules?.bidType || game.rules?.gameType || 'REGULAR').toUpperCase();
    let gameLine = `${formatCoins(game.buyIn)} ${game.gameMode.toUpperCase()} ${game.maxPoints}/${game.minPoints} ${typeUpper}`;
    
    // Add nil and blind nil rules to the game line
    if (game.rules?.allowNil !== undefined || game.rules?.allowBlindNil !== undefined) {
      gameLine += ` nil ${game.rules.allowNil ? '☑️' : '❌'} bn ${game.rules.allowBlindNil ? '☑️' : '❌'}`;
    }
    
    // Get GamePlayer records with Discord IDs
    const { prisma } = await import('../../prisma');
    const gamePlayers = await prisma.gamePlayer.findMany({
      where: { gameId: dbGame.id },
      include: {
        User: {
          select: { discordId: true, username: true }
        }
      },
      orderBy: { position: 'asc' }
    });
    
    // Prepare game data for Discord
    const gameData = {
      buyIn: game.buyIn,
      team1Score: game.team1TotalScore || 0,
      team2Score: game.team2TotalScore || 0,
      allowNil: game.rules?.allowNil || false,
      allowBlindNil: game.rules?.allowBlindNil || false,
      players: gamePlayers.map((dbPlayer, i) => {
        const discordId = dbPlayer.User?.discordId || dbPlayer.discordId || dbPlayer.userId || '';
        return {
          userId: discordId,
          won: game.gameMode === 'SOLO' 
            ? i === winningTeamOrPlayer 
            : (winningTeamOrPlayer === 1 && (i === 0 || i === 2)) || (winningTeamOrPlayer === 2 && (i === 1 || i === 3))
        };
      })
    };
    
    if (!isProduction) {
      console.log('[DISCORD RESULTS] Posting results for game', game.id, 'line:', gameLine, 'data:', gameData);
    }
    
    // Add individual player scores for solo games
    if (game.gameMode === 'SOLO' && game.playerScores) {
      (gameData as any).playerScores = game.playerScores;
      (gameData as any).gameMode = game.gameMode;
    }
    
    await sendLeagueGameResults(discordClient, gameData, gameLine);
    (game as any).discordResultsSent = true;
    
    // Set global flag to prevent duplicates
    if (!(global as any).discordResultsSentForGame) {
      (global as any).discordResultsSentForGame = {};
    }
    (global as any).discordResultsSentForGame[game.id] = true;
    
    if (!isProduction) {
      console.log('[DISCORD RESULTS] Successfully sent Discord embed for game:', game.id);
    }
  } catch (error) {
    console.error('Failed to send Discord results:', error);
  }
}
