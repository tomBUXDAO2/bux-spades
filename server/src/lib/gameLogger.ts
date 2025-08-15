import { prisma } from './prisma';
import type { Game } from '../types/game';

export async function logCompletedGameToDbAndDiscord(game: any, winningTeamOrPlayer: number) {
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

		// Create or update Game row for completion snapshot
		const dbGame = await prisma.game.create({
			data: {
				creatorId: game.players.find((p: any) => p && p.type === 'human')?.id || 'unknown',
				gameMode: game.gameMode,
				bidType: (bidType === 'MIRROR' ? 'MIRRORS' : bidType) as any,
				specialRules: Object.keys(specialRules)
					.filter((key) => specialRules[key])
					.map((key) => (key === 'screamer' ? 'SCREAMER' : 'ASSASSIN')) as any[],
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
				gameType: whiz ? 'WHIZ' : mirror ? 'MIRROR' : gimmick ? 'GIMMICK' : 'REGULAR',
				league: (game as any).league || false,
				specialRulesApplied: Object.keys(specialRules)
					.filter((key) => specialRules[key])
					.map((key) => (key === 'screamer' ? 'SCREAMER' : 'ASSASSIN')) as any[],
				status: 'FINISHED'
			}
		});

		// Players
		for (let i = 0; i < 4; i++) {
			const player = game.players[i];
			if (!player || player.type !== 'human') continue;
			const userId = player.id;
			let team: number | null = null;
			if (gameMode === 'PARTNERS') team = i === 0 || i === 2 ? 1 : 2;
			const finalBid = player.bid || 0;
			const finalTricks = player.tricks || 0;
			const finalBags = Math.max(0, finalTricks - finalBid);
			const finalPoints = gameMode === 'SOLO' ? game.playerScores?.[i] || 0 : 0;
			let won = false;
			if (gameMode === 'SOLO') won = i === winner;
			else won = team === winner;
			await prisma.gamePlayer.create({
				data: {
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
					won
				}
			});
		}

		const playerResults = {
			players: game.players.map((p: any, i: number) => ({
				position: i,
				userId: p?.id,
				username: p?.username,
				team: gameMode === 'PARTNERS' ? (i === 0 || i === 2 ? 1 : 2) : null,
				finalBid: p?.bid || 0,
				finalTricks: p?.tricks || 0,
				finalBags: p ? Math.max(0, (p.tricks || 0) - (p.bid || 0)) : 0,
				finalScore: gameMode === 'SOLO' ? game.playerScores?.[i] || 0 : 0,
				won: gameMode === 'SOLO' ? i === winner : (i === 0 || i === 2 ? winner === 1 : winner === 2)
			}))
		};

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

		// Discord
		if ((game as any).league) {
			try {
				const { sendLeagueGameResults } = await import('../discord-bot/bot');
				const formatCoins = (amount: number) => (amount >= 1000000 ? `${amount / 1000000}M` : `${amount / 1000}k`);
				const typeUpper = (game.rules?.bidType || game.rules?.gameType || 'REGULAR').toUpperCase();
				const gameLine = `${formatCoins(game.buyIn)} ${game.gameMode.toUpperCase()} ${game.maxPoints}/${game.minPoints} ${typeUpper}`;
				const data = {
					buyIn: game.buyIn,
					players: game.players.map((p: any, i: number) => ({
						userId: p?.id || '',
						won: game.gameMode === 'SOLO' ? i === winningTeamOrPlayer : (winningTeamOrPlayer === 1 && (i === 0 || i === 2)) || (winningTeamOrPlayer === 2 && (i === 1 || i === 3))
					}))
				};
				await sendLeagueGameResults(data, gameLine);
			} catch (err) {
				console.error('Failed to send Discord results:', err);
			}
		}
	} catch (err) {
		console.error('Failed to log completed game (server):', err);
	}
} 