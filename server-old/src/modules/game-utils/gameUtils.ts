import { prisma } from '../../lib/prisma';

export async function getGameById(gameId: string) {
	return await prisma.game.findUnique({ where: { id: gameId } });
}

export async function getAllGames() {
	return await prisma.game.findMany();
}

export async function addGame(game: any) {
	// No-op: games are created via dedicated creation logic using Prisma
	return game;
}

export async function removeGame(gameId: string) {
	try {
		await prisma.game.delete({ where: { id: gameId } });
	} catch (err) {
		// swallow if already deleted
	}
}

export async function updateGame(gameId: string, updates: Partial<any>) {
	try {
		return await prisma.game.update({ where: { id: gameId }, data: updates as any });
	} catch (err) {
		return null;
	}
}
