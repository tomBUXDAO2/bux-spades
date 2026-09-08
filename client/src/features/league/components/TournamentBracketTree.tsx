import React, { useMemo } from 'react';

export type BracketMatch = {
  id: string;
  round: number;
  matchNumber: number;
  team1Id?: string | null;
  team2Id?: string | null;
  winnerId?: string | null;
  gameId?: string | null;
  status: string;
  players?: { id: string }[];
  ready?: { ready: string[]; timeRemaining: number | null };
};

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

const MATCH_W = 168;
const MATCH_H = 92;
const COL_GAP = 56; // space for connector lines between rounds
const V_GAP = 16;
const HEADER_H = 28;
const WINNER_W = 130;

type LaidOut = {
  match: BracketMatch;
  roundIndex: number; // 0 = leftmost
  x: number;
  y: number; // top of match card
  centerY: number;
};

function statusLabel(m: BracketMatch) {
  if (m.status === 'COMPLETED' && !m.gameId) return 'AUTO';
  if (m.status === 'IN_PROGRESS' && m.gameId) return 'LIVE';
  if (m.status === 'PENDING' && m.team1Id && m.team2Id) return 'READY';
  if (m.status === 'PENDING') return 'WAIT';
  return m.status;
}

function roundTitle(rounds: number[], roundNum: number, matchesByRound: Map<number, BracketMatch[]>) {
  const total = rounds.length;
  const idx = rounds.indexOf(roundNum);
  const first = matchesByRound.get(rounds[0]) || [];
  const second = matchesByRound.get(rounds[1]) || [];
  const isPlayIn = idx === 0 && second.length > 0 && first.length < second.length;
  if (idx === total - 1) return 'Final';
  if (idx === total - 2) return 'Semi-Finals';
  if (idx === total - 3) return 'Quarter-Finals';
  if (idx === total - 4) return 'Round of 16';
  if (isPlayIn) return 'Play-in';
  return `Round ${roundNum}`;
}

/**
 * Sideways single-elim tree. Feeders for match (round R, #M):
 *   team1 ← (R-1, 2M-1), team2 ← (R-1, 2M)  — same as advanceBracket.
 */
export const TournamentBracketTree: React.FC<Props> = ({
  matches,
  getTeamName,
  currentUserId,
  live,
  isAdmin,
  isTimedOut,
  saving,
  onReady,
  onOpenTable,
  onForceOpen
}) => {
  const singleElim = useMemo(
    () => matches.filter((m) => m.round < 100).sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber),
    [matches]
  );

  const layout = useMemo(() => {
    const byRound = new Map<number, BracketMatch[]>();
    for (const m of singleElim) {
      if (!byRound.has(m.round)) byRound.set(m.round, []);
      byRound.get(m.round)!.push(m);
    }
    const rounds = Array.from(byRound.keys()).sort((a, b) => a - b);
    if (!rounds.length) return null;

    const key = (r: number, n: number) => `${r}:${n}`;
    const lookup = new Map<string, BracketMatch>();
    for (const m of singleElim) lookup.set(key(m.round, m.matchNumber), m);

    const placed = new Map<string, LaidOut>();
    let nextLeafY = 0;

    const place = (match: BracketMatch, roundIndex: number): LaidOut => {
      const id = match.id;
      if (placed.has(id)) return placed.get(id)!;

      const prevRound = rounds[roundIndex - 1];
      const feeder1 = prevRound != null ? lookup.get(key(prevRound, match.matchNumber * 2 - 1)) : undefined;
      const feeder2 = prevRound != null ? lookup.get(key(prevRound, match.matchNumber * 2)) : undefined;

      let centerY: number;
      if (feeder1 && feeder2) {
        const a = place(feeder1, roundIndex - 1);
        const b = place(feeder2, roundIndex - 1);
        centerY = (a.centerY + b.centerY) / 2;
      } else if (feeder1 || feeder2) {
        const f = place((feeder1 || feeder2)!, roundIndex - 1);
        centerY = f.centerY;
      } else {
        centerY = nextLeafY * (MATCH_H + V_GAP) + MATCH_H / 2;
        nextLeafY += 1;
      }

      const x = roundIndex * (MATCH_W + COL_GAP);
      const y = centerY - MATCH_H / 2;
      const node: LaidOut = { match, roundIndex, x, y, centerY };
      placed.set(id, node);
      return node;
    };

    // Place from final leftward so orphan early matches still get leaf slots when discovered
    const finalRound = rounds[rounds.length - 1];
    const finals = (byRound.get(finalRound) || []).sort((a, b) => a.matchNumber - b.matchNumber);
    for (const m of finals) place(m, rounds.length - 1);

    // Any matches not reached from final (shouldn't happen) — place as leaves
    for (const m of singleElim) {
      if (!placed.has(m.id)) {
        const ri = rounds.indexOf(m.round);
        place(m, ri);
      }
    }

    const nodes = Array.from(placed.values());
    const maxY = Math.max(...nodes.map((n) => n.y + MATCH_H), MATCH_H);
    const width = rounds.length * (MATCH_W + COL_GAP) - COL_GAP + WINNER_W + 24;
    const height = maxY + HEADER_H + 8;

    // Connector segments: from feeder mid-right → horizontal → vertical → into parent mid-left
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const node of nodes) {
      if (node.roundIndex === 0) continue;
      const prevRound = rounds[node.roundIndex - 1];
      const f1 = lookup.get(key(prevRound, node.match.matchNumber * 2 - 1));
      const f2 = lookup.get(key(prevRound, node.match.matchNumber * 2));
      for (const f of [f1, f2]) {
        if (!f) continue;
        const child = placed.get(f.id);
        if (!child) continue;
        const x1 = child.x + MATCH_W;
        const y1 = child.centerY + HEADER_H;
        const xMid = child.x + MATCH_W + COL_GAP / 2;
        const x2 = node.x;
        const y2 = node.centerY + HEADER_H;
        lines.push({ x1, y1, x2: xMid, y2: y1 });
        lines.push({ x1: xMid, y1, x2: xMid, y2 });
        lines.push({ x1: xMid, y1: y2, x2, y2 });
      }
    }

    // Line into winner box from final
    const finalNode = finals[0] ? placed.get(finals[0].id) : null;
    const winnerX = rounds.length * (MATCH_W + COL_GAP) - COL_GAP + 16;
    if (finalNode) {
      const x1 = finalNode.x + MATCH_W;
      const y1 = finalNode.centerY + HEADER_H;
      const xMid = x1 + 12;
      lines.push({ x1, y1, x2: xMid, y2: y1 });
      lines.push({ x1: xMid, y1, x2: winnerX, y2: y1 });
    }

    return {
      rounds,
      byRound,
      nodes,
      lines,
      width,
      height,
      winnerX,
      finalMatch: finals[0] || null,
      finalCenterY: finalNode?.centerY ?? MATCH_H / 2
    };
  }, [singleElim]);

  if (!singleElim.length) {
    return <p className="text-xs text-white/60">No matches yet.</p>;
  }

  // Double-elim / weird rounds fallback
  if (matches.some((m) => m.round >= 100) && !singleElim.length) {
    return (
      <ul className="space-y-2">
        {matches.map((m) => (
          <li key={m.id} className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/85">
            R{m.round} · M{m.matchNumber} · {m.status}
          </li>
        ))}
      </ul>
    );
  }

  if (!layout) return null;

  const {
    rounds,
    byRound,
    nodes,
    lines,
    width,
    height,
    winnerX,
    finalMatch,
    finalCenterY
  } = layout;

  return (
    <div className="overflow-x-auto overflow-y-auto max-h-[70vh]">
      <div className="relative" style={{ width, height: height + 4 }}>
        {/* Round headers */}
        {rounds.map((roundNum, idx) => (
          <div
            key={`h-${roundNum}`}
            className={`absolute text-center text-[11px] font-semibold tracking-wide ${
              idx === rounds.length - 1 ? 'text-amber-300' : 'text-white/70'
            }`}
            style={{
              left: idx * (MATCH_W + COL_GAP),
              top: 0,
              width: MATCH_W
            }}
          >
            {roundTitle(rounds, roundNum, byRound)}
          </div>
        ))}
        <div
          className="absolute text-center text-[11px] font-bold text-amber-300"
          style={{ left: winnerX, top: 0, width: WINNER_W }}
        >
          Winner
        </div>

        {/* Connectors */}
        <svg
          className="pointer-events-none absolute left-0 top-0"
          width={width}
          height={height + 4}
          aria-hidden
        >
          {lines.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke="rgba(255,255,255,0.28)"
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}
        </svg>

        {/* Match cards */}
        {nodes.map(({ match: m, x, y }) => {
          const team1 = getTeamName(m.team1Id || null);
          const team2 = m.team2Id ? getTeamName(m.team2Id) : null;
          const winnerName = m.winnerId ? getTeamName(m.winnerId) : null;
          const inMatch =
            (m.players || []).some((p) => p.id === currentUserId) ||
            (!!m.team1Id && m.team1Id.replace(/^team_/, '').split('_').includes(currentUserId)) ||
            (!!m.team2Id && m.team2Id.replace(/^team_/, '').split('_').includes(currentUserId));
          const amReady = (m.ready?.ready || []).includes(currentUserId);
          const readyCount = m.ready?.ready?.length || 0;
          const need = (m.players || []).length || 4;

          return (
            <div
              key={m.id}
              className={`absolute z-10 rounded-md border bg-black/55 p-1.5 text-[11px] shadow-lg backdrop-blur-sm ${
                m.status === 'COMPLETED'
                  ? 'border-amber-400/55'
                  : m.status === 'IN_PROGRESS'
                    ? 'border-cyan-400/70'
                    : 'border-white/20'
              }`}
              style={{
                left: x,
                top: y + HEADER_H,
                width: MATCH_W,
                height: MATCH_H
              }}
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
                  !team2
                    ? 'italic text-white/35'
                    : winnerName && winnerName === team2
                      ? 'bg-amber-600/85 font-semibold text-white'
                      : 'bg-white/10 text-white'
                }`}
                title={team2 || 'TBD'}
              >
                {team2 || 'BYE / TBD'}
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
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenTable(m.gameId!, { spectate: !inMatch });
                    }}
                    className="relative z-20 rounded bg-cyan-700/90 px-1.5 py-0.5 text-[9px] font-semibold text-white"
                  >
                    {inMatch ? 'Join' : 'Watch'}
                  </button>
                )}
                {isAdmin &&
                  live &&
                  !m.gameId &&
                  m.team1Id &&
                  m.team2Id &&
                  m.status !== 'COMPLETED' && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onForceOpen(m.id)}
                      className="rounded bg-white/15 px-1.5 py-0.5 text-[9px] font-semibold text-white"
                    >
                      Open
                    </button>
                  )}
              </div>
              {live && !m.gameId && m.status === 'PENDING' && m.team1Id && m.team2Id && (
                <p className="mt-0.5 text-[9px] text-white/45">
                  {readyCount}/{need}
                  {typeof m.ready?.timeRemaining === 'number'
                    ? ` · ${Math.max(0, m.ready.timeRemaining)}s`
                    : ''}
                </p>
              )}
            </div>
          );
        })}

        {/* Winner plaque */}
        <div
          className="absolute flex items-center justify-center rounded-lg border-2 border-amber-400/80 bg-gradient-to-b from-amber-600/90 to-amber-900/90 px-2 text-center text-xs font-bold text-white shadow-lg"
          style={{
            left: winnerX,
            top: finalCenterY + HEADER_H - 28,
            width: WINNER_W,
            minHeight: 56
          }}
        >
          {finalMatch?.winnerId ? getTeamName(finalMatch.winnerId) : 'TBD'}
        </div>
      </div>
    </div>
  );
};

export default TournamentBracketTree;
