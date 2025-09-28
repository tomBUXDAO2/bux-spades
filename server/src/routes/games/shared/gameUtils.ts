import type { Game } from '../../../types/game';

/**
 * Enrich game data for client consumption
 */
export function enrichGameForClient(game: Game | any): any {
  // Derive a top-level currentPlayer to keep frontend logic consistent
  let currentPlayer: string | undefined = undefined;
  if (game.status === 'BIDDING' && game.bidding) {
    currentPlayer = game.bidding.currentPlayer as unknown as string;
  } else if (game.status === 'PLAYING' && game.play) {
    currentPlayer = game.play.currentPlayer as unknown as string;
  }

  // Construct rules object from database fields if not already present
  let rules = game.rules;
  if (!rules || !rules.gameType || !rules.bidType) {
    // Reconstruct rules from database fields
    const format = game.format || 'REGULAR';
    const gimmickVariant = game.gimmickVariant;
    
    rules = {
      gameType: game.mode,
      bidType: format,
      allowNil: game.allowNil ?? true,
      allowBlindNil: game.allowBlindNil ?? false,
      coinAmount: game.buyIn || 0,
      maxPoints: game.maxPoints || 500,
      minPoints: game.minPoints || -500,
      specialRules: game.specialRules || {},
      gimmickType: format === 'GIMMICK' ? gimmickVariant : undefined
    };
    
    console.log('[ENRICH GAME] Reconstructed rules from database fields:', {
      format,
      gimmickVariant,
      mode: game.mode,
      rules
    });
  }

  // Log scores appropriately based on game mode
  if (game.mode !== "SOLO") {
    console.log(`[ENRICH GAME] Enriching game for client - Team scores:`, {
      team1TotalScore: game.team1TotalScore,
      team2TotalScore: game.team2TotalScore,
      team1Bags: game.team1Bags,
      team2Bags: game.team2Bags
    });
  } else {
    console.log(`[ENRICH GAME] Enriching game for client - SOLO scores:`, {
      playerScores: game.playerScores,
      playerBags: game.playerBags
    });
  }

  const base = {
    id: game.id,
    status: game.status,
    mode: game.mode,
    maxPoints: game.maxPoints,
    minPoints: game.minPoints,
    buyIn: game.buyIn,
    rated: game.rated,
    league: game.league,
    solo: game.mode === "SOLO",
    currentRound: game.currentRound,
    currentTrick: game.currentTrick,
    dealerIndex: game.dealerIndex,
    lastActivity: game.lastActivity,
    createdAt: game.createdAt,
    currentPlayer,
    players: (() => {
      // Handle database games with gamePlayers
      if (game.gamePlayers) {

        const players = new Array(4).fill(null);
        game.gamePlayers.forEach((gp: any) => {

          players[gp.seatIndex] = {
            id: gp.userId,
            username: gp.user?.username || `Player ${gp.seatIndex + 1}`,
            avatarUrl: gp.user?.avatarUrl || null, // Don't fallback to default, let client handle it
            type: gp.isHuman ? 'human' : 'bot',
            seatIndex: gp.seatIndex,
            teamIndex: gp.teamIndex,
            bid: gp.bid || null,
            tricks: gp.tricks || null,
            points: gp.points || null,
            bags: gp.bags || null,
            isDealer: typeof game.dealerIndex === "number" ? game.dealerIndex === gp.seatIndex : false
          };
        });

        return players;
      }
      // Handle in-memory games
      return game.players ? game.players.map((p: any, i: number) => p ? {
        id: p.id,
        username: p.username,
        avatarUrl: p.avatarUrl,
        type: p.type,
        seatIndex: i,
        teamIndex: p.team,
        bid: p.bid,
        tricks: p.tricks,
        points: p.points,
        bags: p.bags,
        isDealer: typeof game.dealerIndex === "number" ? game.dealerIndex === i : Boolean((p as any).isDealer)
      } : null) : [null, null, null, null];
    })(),
    bidding: (() => {
      // If we have individual player bids, construct the bidding.bids array
      if (game.players && game.players.length > 0) {
        const bids = new Array(4).fill(null);
        game.players.forEach((player: any, index: number) => {
          if (player && player.bid !== null && player.bid !== undefined) {
            bids[index] = player.bid;
          }
        });
        
        return {
          ...game.bidding,
          bids: bids,
          currentPlayer: game.bidding?.currentPlayer || game.currentPlayer,
          currentBidderIndex: game.bidding?.currentBidderIndex || 0
        };
      }
      return game.bidding;
    })(),
    play: game.play,
    isBotGame: game.isBotGame,
    rules: rules,
    playerScores: game.playerScores,
    playerBags: game.playerBags,
    forcedBid: game.forcedBid,
    spectators: (game as any).spectators || []
  } as any;

  // Only include team fields for non-solo games
  if (game.mode !== "SOLO") {
    base.team1TotalScore = game.team1TotalScore;
    base.team2TotalScore = game.team2TotalScore;
    base.team1Bags = game.team1Bags;
    base.team2Bags = game.team2Bags;
  }

  return base;
}
