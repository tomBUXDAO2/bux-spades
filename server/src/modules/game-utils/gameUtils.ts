import { games } from '../../gamesStore';

export function getGameById(gameId: string) {
  return games.find(g => g.id === gameId);
}

export function getAllGames() {
  return games;
}

export function addGame(game: any) {
  games.push(game);
}

export function removeGame(gameId: string) {
  const index = games.findIndex(g => g.id === gameId); if (index !== -1) games.splice(index, 1);
}

export function updateGame(gameId: string, updates: Partial<any>) {
  const game = games.find(g => g.id === gameId);
  if (game) {
    Object.assign(game, updates);
    games.push(game);
  }
}
