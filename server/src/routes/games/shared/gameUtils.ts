import type { Game } from '../../../types/game';

/**
 * Enrich game data for client consumption
 */
export function enrichGameForClient(game: Game): any {
  // Derive a top-level currentPlayer to keep frontend logic consistent
  let currentPlayer: string | undefined = undefined;
  if (game.status === 'BIDDING' && game.bidding) {
    currentPlayer = game.bidding.currentPlayer as unknown as string;
  } else if (game.status === 'PLAYING' && game.play) {
    currentPlayer = game.play.currentPlayer as unknown as string;
  }

  return {
    id: game.id,
    status: game.status,
    gameMode: game.gameMode,
    maxPoints: game.maxPoints,
    minPoints: game.minPoints,
    buyIn: game.buyIn,
    rated: game.rated,
    league: game.league,
    solo: game.solo,
    currentRound: game.currentRound,
    currentTrick: game.currentTrick,
    dealerIndex: game.dealerIndex,
    lastActivity: game.lastActivity,
    createdAt: game.createdAt,
    currentPlayer,
    players: game.players.map((p, i) => p ? {
      id: p.id,
      username: p.username,
      avatar: p.avatar,
      type: p.type,
      position: p.position,
      team: p.team,
      bid: p.bid,
      tricks: p.tricks,
      points: p.points,
      bags: p.bags,
      isDealer: typeof game.dealerIndex === 'number' ? game.dealerIndex === i : Boolean((p as any).isDealer)
    } : null),
    hands: game.hands,
    bidding: game.bidding,
    play: game.play,
    team1TotalScore: game.team1TotalScore,
    team2TotalScore: game.team2TotalScore,
    team1Bags: game.team1Bags,
    team2Bags: game.team2Bags,
    isBotGame: game.isBotGame,
    rules: game.rules,
    playerScores: game.playerScores,
    playerBags: game.playerBags,    forcedBid: game.forcedBid
  };
}
