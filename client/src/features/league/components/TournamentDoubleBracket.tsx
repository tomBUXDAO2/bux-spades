import React, { useMemo } from 'react';
import type { BracketMatch } from './TournamentBracketTree';

type Props = {
  matches: BracketMatch[];
  getTeamName: (teamId: string | null) => string;
  currentUserId: string;
  live: boolean;
  isAdmin: boolean;
  isTimedOut: boolean;
  saving: boolean;
  onReady: (matchId: string) => void;
  onOpenTable: (gameId: string, opts?: { spectate?: boolean }) => void;
  onForceOpen: (matchId: string) => void;
};

function statusLabel(m: BracketMatch) {
  if (m.status === 'COMPLETED' && !m.gameId) return 'AUTO';
  if (m.status === 'IN_PROGRESS' && m.gameId) return 'LIVE';
  if (m.status === 'PENDING' && m.team1Id && m.team2Id) return 'READY';
  if (m.status === 'PENDING') return 'WAIT';
  return m.status;
}

function wbRoundTitle(wr: number, maxWr: number) {
  if (wr === maxWr) return 'WB Final';
  if (wr === maxWr - 1) return 'WB Semis';
  return `Winners R${wr}`;
}

function lbRoundTitle(round: number, index: number, total: number) {
  if (index === total - 1) return 'LB Final';
  return `Losers R${index + 1}`;
}

function MatchCard({
  m,
  getTeamName,
  currentUserId,
  live,
  isAdmin,
  isTimedOut,
  saving,
  onReady,
  onOpenTable,
  onForceOpen,
  accent
}: {
  m: BracketMatch;
  getTeamName: (teamId: string | null) => string;
  currentUserId: string;
  live: boolean;
  isAdmin: boolean;
  isTimedOut: boolean;
  saving: boolean;
  onReady: (matchId: string) => void;
  onOpenTable: (gameId: string, opts?: { spectate?: boolean }) => void;
  onForceOpen: (matchId: string) => void;
  accent?: string;
}) {
  const team1 = getTeamName(m.team1Id || null);
  const team2 = m.team2Id ? getTeamName(m.team2Id) : null;
  const winnerName = m.winnerId ? getTeamName(m.winnerId) : null;
  const inMatch = (m.players || []).some((p) => p.id === currentUserId);
  const amReady = (m.ready?.ready || []).includes(currentUserId);
  const isBye = m.status === 'COMPLETED' && !m.team2Id;

  return (
    <div
      className={`min-w-[168px] max-w-[200px] rounded-md border bg-black/55 p-1.5 text-[11px] shadow-lg backdrop-blur-sm ${
        m.status === 'COMPLETED'
          ? 'border-amber-400/55'
          : m.status === 'IN_PROGRESS'
            ? 'border-cyan-400/70'
            : accent || 'border-white/20'
      }`}
    >
      <div className="mb-0.5 flex items-center justify-between text-[9px] text-white/45">
        <span>M{m.matchNumber}</span>
        <span>{statusLabel(m)}</span>
      </div>
      <div
        className={`mb-0.5 truncate rounded px-1.5 py-0.5 ${
          winnerName && winnerName === team1
            ? 'bg-amber-600/85 font-semibold text-white'
            : 'bg-white/10 text-white'
        }`}
        title={team1}
      >
        {team1}
      </div>
      <div
        className={`truncate rounded px-1.5 py-0.5 ${
          isBye || !team2
            ? 'italic text-white/35'
            : winnerName && winnerName === team2
              ? 'bg-amber-600/85 font-semibold text-white'
              : 'bg-white/10 text-white'
        }`}
        title={team2 || (isBye ? 'BYE' : 'TBD')}
      >
        {isBye ? 'BYE' : team2 || 'TBD'}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {live && inMatch && !m.gameId && m.status === 'PENDING' && (
          <button
            type="button"
            disabled={saving || amReady || isTimedOut}
            onClick={() => onReady(m.id)}
            className="rounded bg-emerald-600/90 px-1.5 py-0.5 text-[9px] font-semibold text-white disabled:opacity-40"
          >
            {amReady ? 'Ready ✓' : 'Ready'}
          </button>
        )}
        {m.gameId && (
          <button
            type="button"
            onClick={() => onOpenTable(m.gameId!, { spectate: !inMatch })}
            className="rounded bg-cyan-700/90 px-1.5 py-0.5 text-[9px] font-semibold text-white"
          >
            {inMatch ? 'Join' : 'Watch'}
          </button>
        )}
        {isAdmin && live && !m.gameId && m.team1Id && m.team2Id && m.status === 'PENDING' && (
          <button
            type="button"
            disabled={saving || isTimedOut}
            onClick={() => onForceOpen(m.id)}
            className="rounded bg-violet-700/90 px-1.5 py-0.5 text-[9px] font-semibold text-white disabled:opacity-40"
          >
            Open table
          </button>
        )}
      </div>
    </div>
  );
}

const TournamentDoubleBracket: React.FC<Props> = (props) => {
  const { matches } = props;

  const { winnersByRound, losersByRound, grandFinals, maxWr } = useMemo(() => {
    const winners = matches.filter((m) => m.round < 1000 && m.round % 100 === 0);
    const losers = matches.filter((m) => m.round < 1000 && m.round % 100 !== 0);
    const gf = matches
      .filter((m) => m.round >= 1000)
      .sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber);

    const winnersByRound = new Map<number, BracketMatch[]>();
    for (const m of winners) {
      const wr = m.round / 100;
      if (!winnersByRound.has(wr)) winnersByRound.set(wr, []);
      winnersByRound.get(wr)!.push(m);
    }
    for (const [, list] of winnersByRound) {
      list.sort((a, b) => a.matchNumber - b.matchNumber);
    }

    const losersByRound = new Map<number, BracketMatch[]>();
    for (const m of losers) {
      if (!losersByRound.has(m.round)) losersByRound.set(m.round, []);
      losersByRound.get(m.round)!.push(m);
    }
    for (const [, list] of losersByRound) {
      list.sort((a, b) => a.matchNumber - b.matchNumber);
    }

    const maxWr = Math.max(0, ...Array.from(winnersByRound.keys()));
    return { winnersByRound, losersByRound, grandFinals: gf, maxWr };
  }, [matches]);

  const wbRounds = Array.from(winnersByRound.keys()).sort((a, b) => a - b);
  const lbRounds = Array.from(losersByRound.keys()).sort((a, b) => a - b);

  if (!matches.length) {
    return <p className="text-xs text-white/60">No matches yet.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h5 className="mb-2 text-sm font-semibold text-emerald-300">Winners Bracket</h5>
        <p className="mb-3 text-[10px] text-white/45">
          Lose once here and you drop to the losers bracket.
        </p>
        <div className="overflow-x-auto">
          <div className="flex min-w-max gap-4">
            {wbRounds.map((wr) => (
              <div key={wr} className="flex min-w-[180px] flex-col gap-2">
                <div className="text-center text-[10px] font-semibold uppercase tracking-wide text-emerald-200/80">
                  {wbRoundTitle(wr, maxWr)}
                </div>
                {(winnersByRound.get(wr) || []).map((m) => (
                  <MatchCard key={m.id} m={m} {...props} accent="border-emerald-500/35" />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {lbRounds.length > 0 && (
        <div>
          <h5 className="mb-2 text-sm font-semibold text-rose-300">Losers Bracket</h5>
          <p className="mb-3 text-[10px] text-white/45">
            Second loss eliminates you. Winner reaches the grand final.
          </p>
          <div className="overflow-x-auto">
            <div className="flex min-w-max gap-4">
              {lbRounds.map((round, idx) => (
                <div key={round} className="flex min-w-[180px] flex-col gap-2">
                  <div className="text-center text-[10px] font-semibold uppercase tracking-wide text-rose-200/80">
                    {lbRoundTitle(round, idx, lbRounds.length)}
                  </div>
                  {(losersByRound.get(round) || []).map((m) => (
                    <MatchCard key={m.id} m={m} {...props} accent="border-rose-500/35" />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div>
        <h5 className="mb-2 text-sm font-semibold text-amber-300">Grand Final</h5>
        <p className="mb-3 text-[10px] text-white/45">
          Winners-bracket champ needs one win. If the losers-bracket champ wins game 1, a reset
          game is played — that winner takes the tournament.
        </p>
        <div className="flex flex-wrap gap-4">
          {grandFinals.length === 0 ? (
            <p className="text-xs text-white/50">Grand final not set yet.</p>
          ) : (
            grandFinals.map((m) => (
              <div key={m.id} className="space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/80">
                  {m.round === 1000 ? 'Game 1' : m.round === 1001 ? 'Reset (Game 2)' : `GF ${m.round}`}
                </div>
                <MatchCard m={m} {...props} accent="border-amber-500/45" />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default TournamentDoubleBracket;
