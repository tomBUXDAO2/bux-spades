/** Helpers for in-table tournament games (`tournament_{id}_match_{id}`). */

export function parseTournamentGameId(gameId?: string | null): {
  tournamentId: string;
  matchId: string;
} | null {
  if (!gameId || !gameId.startsWith('tournament_')) return null;
  const parts = gameId.replace(/^tournament_/, '').split('_match_');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { tournamentId: parts[0], matchId: parts[1] };
}

export function isTournamentGameId(gameId?: string | null): boolean {
  return Boolean(parseTournamentGameId(gameId));
}

export function tournamentRoundLabel(round: number): string {
  if (round === 1001) return 'GF Reset';
  if (round >= 1000) return 'Grand Final';
  if (round >= 100 && round % 100 === 0) return `Winners Round ${round / 100}`;
  if (round > 100) return `Losers Round ${round}`;
  return `Round ${round}`;
}

export function shortRoundLabel(round: number): string {
  if (round === 1001) return 'GF Reset';
  if (round >= 1000) return 'Grand Final';
  if (round >= 100 && round % 100 === 0) return `W${round / 100}`;
  if (round > 100) return `L${round}`;
  return `R${round}`;
}

export type TournamentMatchLite = {
  id: string;
  round: number;
  matchNumber: number;
  team1Id?: string | null;
  team2Id?: string | null;
  winnerId?: string | null;
  gameId?: string | null;
  status: string;
};

export type TournamentOutcomeMessage = {
  userWon: boolean;
  headline: string;
  detail: string;
};

function teamHasUser(teamId: string | null | undefined, userId: string): boolean {
  if (!teamId || !userId) return false;
  // team_${cuid} or team_${cuid1}_${cuid2} — cuids have no underscores
  const ids = teamId.startsWith('team_') ? teamId.slice(5).split('_') : [teamId];
  return ids.includes(userId);
}

/**
 * Build winner/loser copy after a tournament match completes (from refreshed bracket).
 */
export function buildTournamentOutcomeMessage(opts: {
  userId: string;
  matchId: string;
  gameId: string;
  eliminationType?: string | null;
  tournamentStatus?: string | null;
  matches: TournamentMatchLite[];
}): TournamentOutcomeMessage | null {
  const { userId, matchId, gameId, eliminationType, tournamentStatus, matches } = opts;
  const match =
    matches.find((m) => m.id === matchId) ||
    matches.find((m) => m.gameId === gameId);
  if (!match || !match.winnerId) return null;

  const onTeam1 = teamHasUser(match.team1Id, userId);
  const onTeam2 = teamHasUser(match.team2Id, userId);
  if (!onTeam1 && !onTeam2) return null;

  const userTeamId = onTeam1 ? match.team1Id : match.team2Id;
  const userWon = match.winnerId === userTeamId;
  const isDouble = String(eliminationType || '').toUpperCase() === 'DOUBLE';
  const round = match.round;

  if (tournamentStatus === 'COMPLETED') {
    if (userWon && (round >= 1000 || (!isDouble && matches.every((m) => m.status === 'COMPLETED')))) {
      return {
        userWon: true,
        headline: 'Tournament champions!',
        detail: 'You won the tournament.'
      };
    }
    if (!userWon && round >= 1000) {
      return {
        userWon: false,
        headline: 'Tournament finished',
        detail: 'You reached the grand final.'
      };
    }
  }

  if (userWon) {
    // Find a later match that already has this team seated (advance placement)
    const next = matches.find(
      (m) =>
        m.id !== match.id &&
        m.status !== 'COMPLETED' &&
        (m.team1Id === match.winnerId || m.team2Id === match.winnerId) &&
        (m.round > round || (round >= 1000 && m.round === 1001))
    );
    if (tournamentStatus === 'COMPLETED' || (!next && !matches.some((m) => m.status !== 'COMPLETED'))) {
      return {
        userWon: true,
        headline: 'Tournament champions!',
        detail: 'You won the tournament.'
      };
    }
    if (next) {
      return {
        userWon: true,
        headline: 'You advance!',
        detail: `You progress to ${tournamentRoundLabel(next.round)}.`
      };
    }
    return {
      userWon: true,
      headline: 'You advance!',
      detail: 'Waiting for your next match to be set.'
    };
  }

  // Loser
  if (!isDouble || (round > 100 && round < 1000 && round % 100 !== 0)) {
    // Single-elim, or already in losers bracket → eliminated
    return {
      userWon: false,
      headline: 'Eliminated',
      detail: isDouble
        ? 'That was your second loss — you are out of the tournament.'
        : 'You have been eliminated from the tournament.'
    };
  }

  // Double-elim winners bracket loss → drop to losers
  const loserTeamId = userTeamId;
  const lbSeat = matches.find(
    (m) =>
      m.id !== match.id &&
      m.round > 100 &&
      m.round < 1000 &&
      m.round % 100 !== 0 &&
      (m.team1Id === loserTeamId || m.team2Id === loserTeamId)
  );
  if (lbSeat) {
    return {
      userWon: false,
      headline: 'Dropped to losers bracket',
      detail: `You move to ${tournamentRoundLabel(lbSeat.round)}.`
    };
  }
  if (round >= 100 && round % 100 === 0) {
    return {
      userWon: false,
      headline: 'Dropped to losers bracket',
      detail: 'You move to the losers bracket.'
    };
  }

  return {
    userWon: false,
    headline: 'Eliminated',
    detail: 'You have been eliminated from the tournament.'
  };
}
