import { prisma } from './prisma';
import type { Game } from '../types/game';

export async function logCompletedGameToDbAndDiscord(game: any, winningTeamOrPlayer: number) {
	console.log('[GAME LOGGER] Starting game completion logging for game:', game.id);
	console.log('[GAME LOGGER] Game league property:', (game as any).league);
	console.log('[GAME LOGGER] Game mode:', game.gameMode);
	console.log('[GAME LOGGER] Winning team/player:', winningTeamOrPlayer);
	
	try {
		// Determine settings
		const gameMode = game.gameMode;
		const bidType = game.rules?.bidType || 'REGULAR';
		const specialRules = game.specialRules || {};
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
		let dbGame;
		if (game.dbGameId) {
			try {
				// Update existing game record
				dbGame = await prisma.game.update({
					where: { id: game.dbGameId },
					data: {
						bidType: (bidType === 'MIRROR' ? 'MIRRORS' : bidType) as any,
						specialRules: (Object.keys(specialRules).filter((key) => !!specialRules[key]) as any[]).map((key) => key.toUpperCase()) as any[],
						solo,
						whiz,
						mirror,
						gimmick,
						screamer,
						assassin,
						completed: true,
						cancelled: false,
						finalScore,
						winner,
						gameType: whiz ? 'WHIZ' : mirror ? 'MIRRORS' : gimmick ? 'GIMMICK' : 'REGULAR',
						league: (game as any).league || false,
						specialRulesApplied: (Object.keys(specialRules).filter((key) => !!specialRules[key]) as any[]).map((key) => key.toUpperCase()) as any[],
						status: 'FINISHED'
					}
				});
				console.log('[GAME COMPLETED] Updated existing game in database:', game.dbGameId);
			} catch (updateError) {
				console.error('[GAME UPDATE FAILED] Could not update existing game, creating new one:', updateError);
				// Fall back to creating new game if update fails
				game.dbGameId = null;
			}
		}
		
		if (!game.dbGameId) {
			// Fallback: create new game record if dbGameId is missing
			dbGame = await prisma.game.create({
				data: {
					creatorId: game.players.find((p: any) => p && p.type === 'human')?.id || 'unknown',
					gameMode: game.gameMode,
					bidType: (bidType === 'MIRROR' ? 'MIRRORS' : bidType) as any,
					specialRules: (Object.keys(specialRules).filter((key) => !!specialRules[key]) as any[]).map((key) => key.toUpperCase()) as any[],
					minPoints: game.minPoints,
					maxPoints: game.maxPoints,
					buyIn: game.buyIn,
					solo,
					whiz,
					mirror,
					gimmick,
					screamer,
					assassin,
					rated: true,
					completed: true,
					cancelled: false,
					finalScore,
					winner,
					gameType: whiz ? 'WHIZ' : mirror ? 'MIRRORS' : gimmick ? 'GIMMICK' : 'REGULAR',
					league: (game as any).league || false,
					specialRulesApplied: (Object.keys(specialRules).filter((key) => !!specialRules[key]) as any[]).map((key) => key.toUpperCase()) as any[],
					status: 'FINISHED'
				}
			});
			console.log('[GAME COMPLETED] Created new game record in database:', dbGame.id);
		}

		// Players
		console.log('[GAME LOGGER] Creating GamePlayer records for game:', dbGame.id);
		console.log('[GAME LOGGER] Players array:', game.players?.map((p: any) => ({ id: p?.id, type: p?.type, username: p?.username })));
		
		for (let i = 0; i < 4; i++) {
			const player = game.players[i];
			if (!player || player.type !== 'human') {
				console.log(`[GAME LOGGER] Skipping player ${i}:`, player ? `type=${player.type}` : 'null');
				continue;
			}
			const userId = player.id;
			if (!userId) {
				console.log(`[GAME LOGGER] Player ${i} has no userId:`, player);
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
						discordId: player.discordId || null
					}
				});
				console.log(`[GAME LOGGER] Upserted GamePlayer for ${player.username} at position ${i}`);
			} catch (playerError) {
				console.error(`[GAME LOGGER] Failed to upsert GamePlayer for position ${i}:`, playerError);
				console.error(`[GAME LOGGER] Player data:`, player);
			}
		}

		const playerResults = {
			players: game.players.map((p: any, i: number) => ({
				position: i,
				userId: p?.id, // DB user id
				discordId: p?.discordId || null,
				username: p?.username,
				team: gameMode === 'PARTNERS' ? (i === 0 || i === 2 ? 1 : 2) : null,
				finalBid: p?.bid || 0,
				finalTricks: p?.tricks || 0,
				finalBags: p ? Math.max(0, (p.tricks || 0) - (p.bid || 0)) : 0,
				finalScore: gameMode === 'SOLO' ? game.playerScores?.[i] || 0 : 0,
				won: gameMode === 'SOLO' ? i === winner : (i === 0 || i === 2 ? winner === 1 : winner === 2)
			}))
		};

		// Check if GameResult already exists
		const existingGameResult = await prisma.gameResult.findUnique({
			where: { gameId: dbGame.id }
		});

		if (!existingGameResult) {
			await prisma.gameResult.create({
				data: {
					gameId: dbGame.id,
					winner,
					finalScore,
					gameDuration: Math.floor((Date.now() - (game.createdAt || Date.now())) / 1000),
					team1Score,
					team2Score,
					playerResults,
					totalRounds: game.rounds?.length || 0,
					totalTricks: game.play?.tricks?.length || 0,
					specialEvents: { nils: game.bidding?.nilBids || {}, totalHands: game.hands?.length || 0 }
				}
			});
			console.log(`Created comprehensive game result record for game ${dbGame.id}`);
		} else {
			console.log(`GameResult already exists for game ${dbGame.id}, skipping creation`);
		}
		
		// Send Discord results for league games
		if ((game as any).league && !(game as any).discordResultsSent) {
			try {
				const { sendLeagueGameResults } = await import('../discord-bot/bot');
				
				// Create game line string
				const formatCoins = (amount: number) => amount >= 1000000 ? `${amount / 1000000}M` : `${amount / 1000}k`;
				const typeUpper = (game.rules?.bidType || game.rules?.gameType || 'REGULAR').toUpperCase();
				const gameLine = `${formatCoins(game.buyIn)} ${game.gameMode.toUpperCase()} ${game.maxPoints}/${game.minPoints} ${typeUpper}`;
				
				// Get GamePlayer records with Discord IDs
				const gamePlayers = await prisma.gamePlayer.findMany({
					where: { gameId: dbGame.id },
					include: {
						user: {
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
					players: gamePlayers.map((dbPlayer, i) => {
						const discordId = dbPlayer.user?.discordId || dbPlayer.discordId || dbPlayer.userId || '';
						console.log(`[DISCORD RESULTS DEBUG] Player ${i} (${dbPlayer.username}): discordId=${discordId}`);
						return {
							userId: discordId,
							username: dbPlayer.username,
							bid: dbPlayer.bid,
							bags: dbPlayer.bags,
							nil: dbPlayer.nil || false,
							blindNil: dbPlayer.blindNil || false,
							won: game.gameMode === 'SOLO' 
								? i === winningTeamOrPlayer 
								: (winningTeamOrPlayer === 1 && (i === 0 || i === 2)) || (winningTeamOrPlayer === 2 && (i === 1 || i === 3))
						};
					})
				};
				
				console.log('[DISCORD RESULTS] Posting results for game', game.id, 'line:', gameLine, 'data:', gameData);
				await sendLeagueGameResults(gameData, gameLine);
				(game as any).discordResultsSent = true;
				
				// Set global flag to prevent duplicates
				if (!(global as any).discordResultsSentForGame) {
					(global as any).discordResultsSentForGame = {};
				}
				(global as any).discordResultsSentForGame[game.id] = true;
				
				console.log('[DISCORD RESULTS] Successfully sent Discord embed for game:', game.id);
			} catch (error) {
				console.error('Failed to send Discord results:', error);
			}
		}
		
	} catch (err) {
		console.error('Failed to log completed game (server):', err);
	}
} 