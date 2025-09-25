import { prisma } from '../lib/prisma';

export async function newdbCreateGame(params: {
	gameId: string;
	createdById: string;
	mode: 'PARTNERS' | 'SOLO';
	format: 'REGULAR' | 'WHIZ' | 'MIRROR' | 'GIMMICK';
	gimmickVariant?: 'SUICIDE' | 'BID4NIL' | 'BID3' | 'BIDHEARTS' | 'CRAZY_ACES';
	isLeague: boolean;
	isRated: boolean;
	status: 'WAITING' | 'BIDDING' | 'PLAYING' | 'FINISHED';
	specialRules?: any;
	startedAt?: Date | null;
}): Promise<void> {
	await prisma.game.create({
		data: {
			id: params.gameId,
			createdById: params.createdByIdId,
			mode: params.mode as any,
			format: params.format as any,
			gimmickVariant: (params.gimmickVariant ?? null) as any,
			isLeague: params.isLeague,
			isRated: params.isRated,
			status: params.status as any,
			specialRules: params.specialRules ?? undefined,
			startedAt: params.startedAt ?? undefined,
		}
	});
}

export async function newdbUpsertGamePlayer(params: {
	gameId: string;
	userId: string;
	seatIndex: number;
	teamIndex?: number | null;
	isHuman: boolean;
}): Promise<void> {
	await prisma.gamePlayer.upsert({
		where: { gameId_seatIndex: { gameId: params.gameId, seatIndex: params.seatIndex } as any },
		update: {
			userId: params.userId,
			teamIndex: params.teamIndex ?? null,
			isHuman: params.isHuman,
		},
		create: {
			gameId: params.gameId,
			userId: params.userId,
			seatIndex: params.seatIndex,
			teamIndex: params.teamIndex ?? null,
			isHuman: params.isHuman,
		}
	});
}

export async function newdbEnsureRound(params: {
	gameId: string;
	roundNumber: number;
	dealerSeatIndex: number;
}): Promise<string> {
	const round = await prisma.round.upsert({
		where: { gameId_roundNumber: { gameId: params.gameId, roundNumber: params.roundNumber } as any },
		update: { dealerSeatIndex: params.dealerSeatIndex },
		create: { gameId: params.gameId, roundNumber: params.roundNumber, dealerSeatIndex: params.dealerSeatIndex }
	});
	return round.id;
}

export async function newdbCreateRound(params: {
	gameId: string;
	roundNumber: number;
	dealerSeatIndex: number;
	initialHands?: Array<{ seatIndex: number; cards: Array<{ suit: string; rank: string }> }>;
}): Promise<string> {
	const round = await prisma.round.create({
		data: { gameId: params.gameId, roundNumber: params.roundNumber, dealerSeatIndex: params.dealerSeatIndex }
	});
	if (params.initialHands && params.initialHands.length > 0) {
		for (const hand of params.initialHands) {
			await prisma.roundHandSnapshot.create({
				data: { roundId: round.id, seatIndex: hand.seatIndex, cards: hand.cards as any }
			});
		}
	}
	return round.id;
}

export async function newdbUpsertBid(params: {
	roundId: string;
	userId: string;
	seatIndex: number;
	bid: number; // -1 blind nil
}): Promise<void> {
	await prisma.roundBid.upsert({
		where: { roundId_userId: { roundId: params.roundId, userId: params.userId } as any },
		update: { bid: params.bid, isBlindNil: params.bid === -1 },
		create: { roundId: params.roundId, userId: params.userId, seatIndex: params.seatIndex, bid: params.bid, isBlindNil: params.bid === -1 }
	});
}

export async function newdbCreateTrickAndCards(params: {
	roundId: string;
	trickNumber: number;
	leadSeatIndex: number;
	winningSeatIndex: number;
	plays: Array<{ seatIndex: number; suit: string; rank: string; order: number }>;
}): Promise<void> {
	const trick = await prisma.trick.create({
		data: { roundId: params.roundId, trickNumber: params.trickNumber, leadSeatIndex: params.leadSeatIndex, winningSeatIndex: params.winningSeatIndex }
	});
	for (const p of params.plays) {
		await prisma.trickCard.create({
			data: { trickId: trick.id, seatIndex: p.seatIndex, suit: p.suit, rank: p.rank, playOrder: p.order }
		});
	}
}

export async function newdbRecordRoundEnd(params: {
	roundId: string;
	playerStats: Array<{ userId: string; seatIndex: number; teamIndex: number | null; bid: number; tricksWon: number; bagsThisRound: number; madeNil: boolean; madeBlindNil: boolean }>;
	score: { team0Score?: number | null; team1Score?: number | null; team0Bags?: number | null; team1Bags?: number | null; team0RunningTotal?: number | null; team1RunningTotal?: number | null; player0Score?: number | null; player1Score?: number | null; player2Score?: number | null; player3Score?: number | null; player0Running?: number | null; player1Running?: number | null; player2Running?: number | null; player3Running?: number | null };
}): Promise<void> {
	for (const s of params.playerStats) {
		await prisma.playerRoundStats.upsert({
			where: { roundId_userId: { roundId: params.roundId, userId: s.userId } as any },
			update: { seatIndex: s.seatIndex, teamIndex: s.teamIndex, bid: s.bid, isBlindNil: s.bid === -1, tricksWon: s.tricksWon, bagsThisRound: s.bagsThisRound, madeNil: s.madeNil, madeBlindNil: s.madeBlindNil },
			create: { roundId: params.roundId, userId: s.userId, seatIndex: s.seatIndex, teamIndex: s.teamIndex, bid: s.bid, isBlindNil: s.bid === -1, tricksWon: s.tricksWon, bagsThisRound: s.bagsThisRound, madeNil: s.madeNil, madeBlindNil: s.madeBlindNil }
		});
	}
	await prisma.roundScore.upsert({
		where: { roundId: params.roundId as any },
		update: { ...params.score },
		create: { roundId: params.roundId, ...params.score }
	});
}

export async function newdbRecordGameFinish(params: {
	gameId: string;
	winner: string; // 'TEAM0'|'TEAM1' or 'SEAT_X'
	finals: { team0Final?: number | null; team1Final?: number | null; player0Final?: number | null; player1Final?: number | null; player2Final?: number | null; player3Final?: number | null };
	totalRounds: number;
	totalTricks: number;
	finishedAt?: Date | null;
}): Promise<void> {
	await prisma.gameResult.create({
		data: { gameId: params.gameId, winner: params.winner, team0Final: params.finals.team0Final ?? null, team1Final: params.finals.team1Final ?? null, player0Final: params.finals.player0Final ?? null, player1Final: params.finals.player1Final ?? null, player2Final: params.finals.player2Final ?? null, player3Final: params.finals.player3Final ?? null, totalRounds: params.totalRounds, totalTricks: params.totalTricks }
	});
	await prisma.game.update({ where: { id: params.gameId }, data: { status: 'FINISHED' as any, finishedAt: params.finishedAt ?? new Date() } });
} 