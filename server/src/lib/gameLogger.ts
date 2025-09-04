import { prisma } from './prisma';
import type { Game } from '../types/game';

// Retry mechanism for database operations
async function retryOperation<T>(operation: () => Promise<T>, maxRetries: number = 3, delay: number = 1000): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.log(`[RETRY] Database operation failed (attempt ${attempt}/${maxRetries}):`, error);
      if (attempt === maxRetries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
  throw new Error('Max retries exceeded');
}

export async function logCompletedGameToDbAndDiscord(game: any, winningTeamOrPlayer: number) {
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
			case 'REG':
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
		const screamer = specialRules.screamer === true;
		const assassin = specialRules.assassin === true;

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

		// Update existing Game row for completion snapshot
		let dbGame: any;
		if (game.dbGameId) {
			try {
				// Update existing game record with retry
				dbGame = await retryOperation(async () => {
					return await prisma.game.update({
						where: { id: game.dbGameId },
						data: {
							bidType: bidType as any,
							specialRules: (() => {
								const rules: any[] = [];
								if (specialRules.screamer) rules.push('SCREAMER');
								if (specialRules.assassin) rules.push('ASSASSIN');
								return rules;
							})(),
							status: 'FINISHED'
						}
					});
				});
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
			const gameId = game.id || `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
			const now = new Date();
			dbGame = await retryOperation(async () => {
				return await prisma.game.create({
					data: {
						id: gameId,
						creatorId: game.creatorId || game.players.find((p: any) => p && p.type === 'human' && p.id)?.id || 'unknown',
						gameMode: game.gameMode,
						bidType: bidType as any,
						specialRules: [],
						minPoints: game.minPoints,
						maxPoints: game.maxPoints,
						buyIn: game.buyIn,
						status: 'FINISHED',
						createdAt: now,
						updatedAt: now
					} as any
				});
			});
			if (!isProduction) {
				console.log('[GAME COMPLETED] Created new game record in database:', dbGame.id);
			}
		}

		// Players
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
			const userId = player.id;
			if (!userId) {
				if (!isProduction) {
					console.log(`[GAME LOGGER] Player ${i} has no userId:`, player);
				}
				continue;
			}
			
			let team: number | null = null;
			if (gameMode === 'PARTNERS') team = i === 0 || i === 2 ? 1 : 2;
			const finalBid = player.bid || 0;
			const finalTricks = player.tricks || 0;
			const finalBags = Math.max(0, finalTricks - finalBid);
			const finalPoints = gameMode === 'SOLO' ? game.playerScores?.[i] || 0 : 0;
			let won = false;
			if (gameMode === 'SOLO') won = i === winner;
			else won = team === winner;
			
			try {
				const playerId = `player_${dbGame.id}_${i}_${Date.now()}`;
				const now = new Date();
				// Use upsert to handle existing records
				await prisma.gamePlayer.upsert({
					where: {
						gameId_position: {
							gameId: dbGame.id,
							position: i
						}
					},
					update: {
						team,
						bid: finalBid,
						bags: finalBags,
						points: finalPoints,
						finalScore: finalPoints,
						finalBags,
						finalPoints,
						won,
						username: player.username,
						discordId: player.discordId || null
					},
					create: {
						id: playerId,
						gameId: dbGame.id,
						userId,
						position: i,
						team,
						bid: finalBid,
						bags: finalBags,
						points: finalPoints,
						finalScore: finalPoints,
						finalBags,
						finalPoints,
						won,
						username: player.username,
						discordId: player.discordId || null,
						createdAt: now,
						updatedAt: now
					} as any
				});
				if (!isProduction) {
					console.log(`[GAME LOGGER] Upserted GamePlayer for ${player.username} at position ${i}`);
				}
			} catch (playerError) {
				console.error(`[GAME LOGGER] Failed to upsert GamePlayer for position ${i}:`, playerError);
				console.error(`[GAME LOGGER] Player data:`, player);
			}
		}

		// Get the actual final scores from the database (already calculated by completeGame)
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

		// Check if GameResult already exists
		const existingGameResult = await prisma.gameResult.findUnique({
			where: { gameId: dbGame.id }
		});

		if (!existingGameResult) {
			const resultId = `result_${dbGame.id}_${Date.now()}`;
			const now = new Date();
			await retryOperation(async () => {
				return await prisma.gameResult.create({
					data: {
						id: resultId,
						gameId: dbGame.id,
						winner,
						finalScore,
						gameDuration: Math.floor((Date.now() - (game.createdAt || Date.now())) / 1000),
						team1Score,
						team2Score,
						playerResults,
						totalRounds: game.rounds?.length || 0,
						totalTricks: game.play?.tricks?.length || 0,
						specialEvents: { nils: game.bidding?.nilBids || {}, totalHands: game.hands?.length || 0 },
						createdAt: now,
						updatedAt: now
					} as any
				});
			});
			if (!isProduction) {
				console.log(`Created comprehensive game result record for game ${dbGame.id}`);
			}
		} else {
			if (!isProduction) {
				console.log(`GameResult already exists for game ${dbGame.id}, skipping creation`);
			}
		}
		
		// GamePlayer records are already updated by completeGame, no need to overwrite them
		if (!isProduction) {
			console.log(`[GAME LOGGER] GamePlayer records already updated by completeGame, skipping duplicate update`);
		}
		
		// Send Discord results for league games
		if ((game as any).league && !(game as any).discordResultsSent) {
			try {
				const { sendLeagueGameResults } = await import('../discord-bot/bot');
				
				// Create game line string
				const formatCoins = (amount: number) => amount >= 1000000 ? `${amount / 1000000}M` : `${amount / 1000}k`;
				const typeUpper = (game.rules?.bidType || game.rules?.gameType || 'REGULAR').toUpperCase();
				let gameLine = `${formatCoins(game.buyIn)} ${game.gameMode.toUpperCase()} ${game.maxPoints}/${game.minPoints} ${typeUpper}`;
				
				// Add nil and blind nil rules to the game line
				if (game.rules?.allowNil !== undefined || game.rules?.allowBlindNil !== undefined) {
					gameLine += ` nil ${game.rules.allowNil ? '☑️' : '❌'} bn ${game.rules.allowBlindNil ? '☑️' : '❌'}`;
				}
				
				// Get GamePlayer records with Discord IDs
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
						if (!isProduction) {
					
						}
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
				await sendLeagueGameResults(gameData, gameLine);
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