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

const MATCH_W = 178;
const MATCH_H = 100;
const COL_GAP = 56;
const V_GAP = 18;
const HEADER_H = 28;

type LbMeta = {
  round: number;
  matchCount: number;
  kind: 'w1' | 'drop' | 'purge';
  wbSource?: number;
};

type LaidOut = {
  match: BracketMatch;
  roundIndex: number;
  x: number;
  y: number;
  centerY: number;
  code: string;
  slot1: string;
  slot2: string;
};

function statusLabel(m: BracketMatch) {
  if (m.status === 'COMPLETED' && !m.gameId) return 'AUTO';
  if (m.status === 'IN_PROGRESS' && m.gameId) return 'LIVE';
  if (m.status === 'PENDING' && m.team1Id && m.team2Id) return 'READY';
  if (m.status === 'PENDING') return 'WAIT';
  return m.status;
}

/** Same LB round meta as TournamentBracketService.buildDoubleElimLbMeta */
function buildLbMeta(bracketSize: number): LbMeta[] {
  if (bracketSize < 4) return [];
  const wbRounds = Math.log2(bracketSize);
  const meta: LbMeta[] = [];
  let lbRound = 101;
  meta.push({ round: lbRound++, matchCount: bracketSize / 4, kind: 'w1' });
  for (let wr = 2; wr <= wbRounds; wr++) {
    const dropCount = bracketSize / Math.pow(2, wr);
    meta.push({ round: lbRound++, matchCount: dropCount, kind: 'drop', wbSource: wr });
    if (wr < wbRounds) {
      meta.push({ round: lbRound++, matchCount: dropCount / 2, kind: 'purge' });
    }
  }
  return meta;
}

function wbPrefix(wr: number, maxWr: number) {
  if (wr === maxWr) return 'WBF';
  if (wr === maxWr - 1) return 'WBSF';
  if (wr === maxWr - 2) return 'WBQF';
  return `WBR${wr}`;
}

function wbCode(wr: number, m: number, maxWr: number) {
  return `${wbPrefix(wr, maxWr)}-${m}`;
}

function lbPrefix(index: number, total: number) {
  if (index === total - 1) return 'LBF';
  return `LBR${index + 1}`;
}

function lbCode(index: number, total: number, m: number) {
  return `${lbPrefix(index, total)}-${m}`;
}

function wbRoundHeader(wr: number, maxWr: number) {
  if (wr === maxWr) return 'WB Final';
  if (wr === maxWr - 1) return 'WB Semis';
  if (wr === maxWr - 2) return 'WB Quarters';
  return `Winners R${wr}`;
}

function lbRoundHeader(index: number, total: number) {
  if (index === total - 1) return 'LB Final';
  return `Losers R${index + 1}`;
}

function slotDisplay(
  teamId: string | null | undefined,
  feeder: string,
  getTeamName: (id: string | null) => string,
  isBye: boolean
) {
  if (teamId) return getTeamName(teamId);
  if (isBye) return 'BYE';
  return feeder || 'TBD';
}

function MatchCardAbs({
  m,
  code,
  slot1,
  slot2,
  x,
  y,
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
  code: string;
  slot1: string;
  slot2: string;
  x: number;
  y: number;
  getTeamName: (teamId: string | null) => string;
  currentUserId: string;
  live: boolean;
  isAdmin: boolean;
  isTimedOut: boolean;
  saving: boolean;
  onReady: (matchId: string) => void;
  onOpenTable: (gameId: string, opts?: { spectate?: boolean }) => void;
  onForceOpen: (matchId: string) => void;
  accent: string;
}) {
  const team1Name = m.team1Id ? getTeamName(m.team1Id) : null;
  const team2Name = m.team2Id ? getTeamName(m.team2Id) : null;
  const winnerName = m.winnerId ? getTeamName(m.winnerId) : null;
  const inMatch = (m.players || []).some((p) => p.id === currentUserId);
  const amReady = (m.ready?.ready || []).includes(currentUserId);
  const isBye = m.status === 'COMPLETED' && !m.team2Id;
  const line1 = slotDisplay(m.team1Id, slot1, getTeamName, false);
  const line2 = slotDisplay(m.team2Id, slot2, getTeamName, isBye);
  const line1IsFeeder = !m.team1Id;
  const line2IsFeeder = !m.team2Id;

  const teamHasUser = (teamId?: string | null) => {
    if (!teamId || !currentUserId) return false;
    return teamId.replace(/^team_/, '').split('_').includes(currentUserId);
  };
  const iAmPlaying =
    inMatch || teamHasUser(m.team1Id) || teamHasUser(m.team2Id);

  return (
    <div
      className={`absolute z-10 rounded-md border bg-black/55 p-1.5 text-[11px] shadow-lg backdrop-blur-sm ${
        m.status === 'COMPLETED'
          ? 'border-amber-400/55'
          : m.status === 'IN_PROGRESS'
            ? 'border-cyan-400/70'
            : accent
      }`}
      style={{ left: x, top: y + HEADER_H, width: MATCH_W, height: MATCH_H }}
    >
      <div className="mb-0.5 flex items-center justify-between text-[9px]">
        <span className="font-semibold tracking-wide text-white/70">{code}</span>
        <span className="text-white/45">{statusLabel(m)}</span>
      </div>
      <div
        className={`mb-0.5 truncate rounded px-1.5 py-0.5 ${
          winnerName && team1Name && winnerName === team1Name
            ? 'bg-amber-600/85 font-semibold text-white'
            : line1IsFeeder
              ? 'italic text-white/40'
              : 'bg-white/10 text-white'
        }`}
        title={line1}
      >
        {line1}
      </div>
      <div
        className={`truncate rounded px-1.5 py-0.5 ${
          winnerName && team2Name && winnerName === team2Name
            ? 'bg-amber-600/85 font-semibold text-white'
            : line2IsFeeder || isBye
              ? 'italic text-white/40'
              : 'bg-white/10 text-white'
        }`}
        title={line2}
      >
        {line2}
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
              onOpenTable(m.gameId!, { spectate: !iAmPlaying });
            }}
            className="relative z-20 rounded bg-cyan-700/90 px-1.5 py-0.5 text-[9px] font-semibold text-white"
          >
            {iAmPlaying ? 'Join' : 'Watch'}
          </button>
        )}
        {isAdmin && live && !m.gameId && m.team1Id && m.team2Id && m.status === 'PENDING' && (
          <button
            type="button"
            disabled={saving || isTimedOut}
            onClick={() => onForceOpen(m.id)}
            className="rounded bg-violet-700/90 px-1.5 py-0.5 text-[9px] font-semibold text-white disabled:opacity-40"
          >
            Open
          </button>
        )}
      </div>
    </div>
  );
}

function PyramidSvg({
  width,
  height,
  lines,
  stroke
}: {
  width: number;
  height: number;
  lines: { x1: number; y1: number; x2: number; y2: number }[];
  stroke: string;
}) {
  return (
    <svg className="pointer-events-none absolute left-0 top-0" width={width} height={height} aria-hidden>
      {lines.map((l, i) => (
        <line
          key={i}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="round"
        />
      ))}
    </svg>
  );
}

const TournamentDoubleBracket: React.FC<Props> = (props) => {
  const { matches, getTeamName } = props;

  const model = useMemo(() => {
    const winners = matches
      .filter((m) => m.round < 1000 && m.round % 100 === 0)
      .sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber);
    const losers = matches
      .filter((m) => m.round < 1000 && m.round % 100 !== 0)
      .sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber);
    const gfSource = matches
      .filter((m) => m.round >= 1000)
      .sort((a, b) => a.round - b.round || a.matchNumber - b.matchNumber);
    const grandFinals = [...gfSource];

    const wbByRound = new Map<number, BracketMatch[]>();
    for (const m of winners) {
      const wr = m.round / 100;
      if (!wbByRound.has(wr)) wbByRound.set(wr, []);
      wbByRound.get(wr)!.push(m);
    }
    for (const [, list] of wbByRound) list.sort((a, b) => a.matchNumber - b.matchNumber);

    const wbRounds = Array.from(wbByRound.keys()).sort((a, b) => a - b);
    const maxWr = wbRounds.length ? Math.max(...wbRounds) : 0;
    const bracketSize = (wbByRound.get(1)?.length || 0) * 2;
    const lbMeta = buildLbMeta(bracketSize || 8);

    const codeOf = new Map<string, string>(); // `${round}:${mn}` → code
    for (const wr of wbRounds) {
      for (const m of wbByRound.get(wr) || []) {
        codeOf.set(`${m.round}:${m.matchNumber}`, wbCode(wr, m.matchNumber, maxWr));
      }
    }
    lbMeta.forEach((meta, idx) => {
      for (let mn = 1; mn <= meta.matchCount; mn++) {
        codeOf.set(`${meta.round}:${mn}`, lbCode(idx, lbMeta.length, mn));
      }
    });
    for (const m of grandFinals) {
      codeOf.set(`${m.round}:${m.matchNumber}`, m.round === 1001 ? 'GF-2' : 'GF-1');
    }

    const wbSlots = new Map<string, { s1: string; s2: string }>();
    for (const wr of wbRounds) {
      for (const m of wbByRound.get(wr) || []) {
        if (wr === 1) {
          wbSlots.set(m.id, { s1: '', s2: '' });
        } else {
          const a = wbCode(wr - 1, m.matchNumber * 2 - 1, maxWr);
          const b = wbCode(wr - 1, m.matchNumber * 2, maxWr);
          wbSlots.set(m.id, { s1: `Winner of ${a}`, s2: `Winner of ${b}` });
        }
      }
    }

    const lbByRound = new Map<number, BracketMatch[]>();
    for (const m of losers) {
      if (!lbByRound.has(m.round)) lbByRound.set(m.round, []);
      lbByRound.get(m.round)!.push(m);
    }
    for (const [, list] of lbByRound) list.sort((a, b) => a.matchNumber - b.matchNumber);

    // Ensure empty shells appear in layout even if not yet in DB (stub tourney)
    const lbRounds = lbMeta.map((m) => m.round);
    for (const meta of lbMeta) {
      if (!lbByRound.has(meta.round)) lbByRound.set(meta.round, []);
      const list = lbByRound.get(meta.round)!;
      for (let mn = 1; mn <= meta.matchCount; mn++) {
        if (!list.some((x) => x.matchNumber === mn)) {
          list.push({
            id: `placeholder-${meta.round}-${mn}`,
            round: meta.round,
            matchNumber: mn,
            status: 'PENDING'
          });
        }
      }
      list.sort((a, b) => a.matchNumber - b.matchNumber);
    }

    const lbSlots = new Map<string, { s1: string; s2: string }>();
    lbMeta.forEach((meta, idx) => {
      const prev = idx > 0 ? lbMeta[idx - 1] : null;
      for (const m of lbByRound.get(meta.round) || []) {
        const mn = m.matchNumber;
        if (meta.kind === 'w1') {
          const a = wbCode(1, mn * 2 - 1, maxWr);
          const b = wbCode(1, mn * 2, maxWr);
          lbSlots.set(m.id, { s1: `Loser of ${a}`, s2: `Loser of ${b}` });
        } else if (meta.kind === 'drop' && meta.wbSource != null) {
          const prevCode = prev ? lbCode(idx - 1, lbMeta.length, mn) : 'LBR?';
          const wbDrop = wbCode(meta.wbSource, mn, maxWr);
          lbSlots.set(m.id, {
            s1: `Winner of ${prevCode}`,
            s2: `Loser of ${wbDrop}`
          });
        } else if (meta.kind === 'purge') {
          const a = prev ? lbCode(idx - 1, lbMeta.length, mn * 2 - 1) : 'LBR?';
          const b = prev ? lbCode(idx - 1, lbMeta.length, mn * 2) : 'LBR?';
          lbSlots.set(m.id, { s1: `Winner of ${a}`, s2: `Winner of ${b}` });
        }
      }
    });

    const gfSlots = new Map<string, { s1: string; s2: string }>();
    const wbf = maxWr ? wbCode(maxWr, 1, maxWr) : 'WBF-1';
    const lbf =
      lbMeta.length > 0 ? lbCode(lbMeta.length - 1, lbMeta.length, 1) : 'LBF-1';
    for (const m of grandFinals) {
      if (m.round === 1001) {
        gfSlots.set(m.id, { s1: 'GF-1 rematch', s2: 'GF-1 rematch' });
      } else {
        gfSlots.set(m.id, { s1: `Winner of ${wbf}`, s2: `Winner of ${lbf}` });
      }
    }
    if (!grandFinals.length) {
      // show GF shell in UI even if missing from DB
      grandFinals.push({
        id: 'placeholder-gf-1',
        round: 1000,
        matchNumber: 1,
        status: 'PENDING'
      });
      gfSlots.set('placeholder-gf-1', {
        s1: `Winner of ${wbf}`,
        s2: `Winner of ${lbf}`
      });
      codeOf.set('1000:1', 'GF-1');
    }

    // ——— WB pyramid layout (same feeder math as single elim) ———
    const wbLookup = new Map<string, BracketMatch>();
    for (const m of winners) wbLookup.set(`${m.round}:${m.matchNumber}`, m);

    const wbPlaced = new Map<string, LaidOut>();
    let wbLeafY = 0;
    const placeWb = (match: BracketMatch, roundIndex: number): LaidOut => {
      if (wbPlaced.has(match.id)) return wbPlaced.get(match.id)!;
      const wr = match.round / 100;
      const prevWr = wbRounds[roundIndex - 1];
      const prevRound = prevWr != null ? prevWr * 100 : null;
      const f1 =
        prevRound != null
          ? wbLookup.get(`${prevRound}:${match.matchNumber * 2 - 1}`)
          : undefined;
      const f2 =
        prevRound != null ? wbLookup.get(`${prevRound}:${match.matchNumber * 2}`) : undefined;

      let centerY: number;
      if (f1 && f2) {
        centerY = (placeWb(f1, roundIndex - 1).centerY + placeWb(f2, roundIndex - 1).centerY) / 2;
      } else if (f1 || f2) {
        centerY = placeWb((f1 || f2)!, roundIndex - 1).centerY;
      } else {
        centerY = wbLeafY * (MATCH_H + V_GAP) + MATCH_H / 2;
        wbLeafY += 1;
      }
      const slots = wbSlots.get(match.id) || { s1: '', s2: '' };
      const node: LaidOut = {
        match,
        roundIndex,
        x: roundIndex * (MATCH_W + COL_GAP),
        y: centerY - MATCH_H / 2,
        centerY,
        code: codeOf.get(`${match.round}:${match.matchNumber}`) || `WB-${match.matchNumber}`,
        slot1: slots.s1,
        slot2: slots.s2
      };
      wbPlaced.set(match.id, node);
      return node;
    };

    if (wbRounds.length) {
      const finals = wbByRound.get(maxWr) || [];
      for (const m of finals) placeWb(m, wbRounds.length - 1);
      for (const m of winners) {
        if (!wbPlaced.has(m.id)) placeWb(m, wbRounds.indexOf(m.round / 100));
      }
    }

    const wbNodes = Array.from(wbPlaced.values());
    const wbLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const node of wbNodes) {
      if (node.roundIndex === 0) continue;
      const prevWr = wbRounds[node.roundIndex - 1];
      const prevRound = prevWr * 100;
      const f1 = wbLookup.get(`${prevRound}:${node.match.matchNumber * 2 - 1}`);
      const f2 = wbLookup.get(`${prevRound}:${node.match.matchNumber * 2}`);
      for (const f of [f1, f2]) {
        if (!f) continue;
        const child = wbPlaced.get(f.id);
        if (!child) continue;
        const x1 = child.x + MATCH_W;
        const y1 = child.centerY + HEADER_H;
        const xMid = child.x + MATCH_W + COL_GAP / 2;
        const x2 = node.x;
        const y2 = node.centerY + HEADER_H;
        wbLines.push({ x1, y1, x2: xMid, y2: y1 });
        wbLines.push({ x1: xMid, y1, x2: xMid, y2 });
        wbLines.push({ x1: xMid, y1: y2, x2, y2 });
      }
    }

    const wbMaxY = Math.max(...wbNodes.map((n) => n.y + MATCH_H), MATCH_H);
    const wbWidth = Math.max(1, wbRounds.length) * (MATCH_W + COL_GAP) - COL_GAP + 8;
    const wbHeight = wbMaxY + HEADER_H + 8;

    // ——— LB pyramid: connect purge / winner-from-prev; drop rounds space under WB ———
    const lbLookup = new Map<string, BracketMatch>();
    for (const meta of lbMeta) {
      for (const m of lbByRound.get(meta.round) || []) {
        lbLookup.set(`${m.round}:${m.matchNumber}`, m);
      }
    }

    const lbPlaced = new Map<string, LaidOut>();
    let lbLeafY = 0;
    const placeLb = (match: BracketMatch, roundIndex: number): LaidOut => {
      if (lbPlaced.has(match.id)) return lbPlaced.get(match.id)!;
      const meta = lbMeta[roundIndex];
      const prev = roundIndex > 0 ? lbMeta[roundIndex - 1] : null;

      let centerY: number;
      if (meta?.kind === 'purge' && prev) {
        const f1 = lbLookup.get(`${prev.round}:${match.matchNumber * 2 - 1}`);
        const f2 = lbLookup.get(`${prev.round}:${match.matchNumber * 2}`);
        if (f1 && f2) {
          centerY =
            (placeLb(f1, roundIndex - 1).centerY + placeLb(f2, roundIndex - 1).centerY) / 2;
        } else if (f1 || f2) {
          centerY = placeLb((f1 || f2)!, roundIndex - 1).centerY;
        } else {
          centerY = lbLeafY * (MATCH_H + V_GAP) + MATCH_H / 2;
          lbLeafY += 1;
        }
      } else if (meta?.kind === 'drop' && prev) {
        const f1 = lbLookup.get(`${prev.round}:${match.matchNumber}`);
        if (f1) {
          centerY = placeLb(f1, roundIndex - 1).centerY;
        } else {
          centerY = lbLeafY * (MATCH_H + V_GAP) + MATCH_H / 2;
          lbLeafY += 1;
        }
      } else {
        centerY = lbLeafY * (MATCH_H + V_GAP) + MATCH_H / 2;
        lbLeafY += 1;
      }

      const slots = lbSlots.get(match.id) || { s1: 'TBD', s2: 'TBD' };
      const node: LaidOut = {
        match,
        roundIndex,
        x: roundIndex * (MATCH_W + COL_GAP),
        y: centerY - MATCH_H / 2,
        centerY,
        code: codeOf.get(`${match.round}:${match.matchNumber}`) || `LB-${match.matchNumber}`,
        slot1: slots.s1,
        slot2: slots.s2
      };
      lbPlaced.set(match.id, node);
      return node;
    };

    if (lbMeta.length) {
      const last = lbMeta[lbMeta.length - 1];
      for (const m of lbByRound.get(last.round) || []) placeLb(m, lbMeta.length - 1);
      lbMeta.forEach((meta, idx) => {
        for (const m of lbByRound.get(meta.round) || []) {
          if (!lbPlaced.has(m.id)) placeLb(m, idx);
        }
      });
    }

    const lbNodes = Array.from(lbPlaced.values());
    const lbLines: { x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const node of lbNodes) {
      if (node.roundIndex === 0) continue;
      const meta = lbMeta[node.roundIndex];
      const prev = lbMeta[node.roundIndex - 1];
      if (!meta || !prev) continue;
      const feeders: BracketMatch[] = [];
      if (meta.kind === 'purge') {
        const f1 = lbLookup.get(`${prev.round}:${node.match.matchNumber * 2 - 1}`);
        const f2 = lbLookup.get(`${prev.round}:${node.match.matchNumber * 2}`);
        if (f1) feeders.push(f1);
        if (f2) feeders.push(f2);
      } else if (meta.kind === 'drop') {
        const f1 = lbLookup.get(`${prev.round}:${node.match.matchNumber}`);
        if (f1) feeders.push(f1);
      }
      for (const f of feeders) {
        const child = lbPlaced.get(f.id);
        if (!child) continue;
        const x1 = child.x + MATCH_W;
        const y1 = child.centerY + HEADER_H;
        const xMid = child.x + MATCH_W + COL_GAP / 2;
        const x2 = node.x;
        const y2 = node.centerY + HEADER_H;
        lbLines.push({ x1, y1, x2: xMid, y2: y1 });
        lbLines.push({ x1: xMid, y1, x2: xMid, y2 });
        lbLines.push({ x1: xMid, y1: y2, x2, y2 });
      }
    }

    const lbMaxY = Math.max(...lbNodes.map((n) => n.y + MATCH_H), MATCH_H);
    const lbWidth = Math.max(1, lbMeta.length) * (MATCH_W + COL_GAP) - COL_GAP + 8;
    const lbHeight = lbMaxY + HEADER_H + 8;

    return {
      wbRounds,
      maxWr,
      wbByRound,
      wbNodes,
      wbLines,
      wbWidth,
      wbHeight,
      lbMeta,
      lbRounds,
      lbByRound,
      lbNodes,
      lbLines,
      lbWidth,
      lbHeight,
      grandFinals,
      gfSlots,
      codeOf
    };
  }, [matches]);

  if (!matches.length) {
    return <p className="text-xs text-white/60">No matches yet.</p>;
  }

  const {
    wbRounds,
    maxWr,
    wbNodes,
    wbLines,
    wbWidth,
    wbHeight,
    lbMeta,
    lbNodes,
    lbLines,
    lbWidth,
    lbHeight,
    grandFinals,
    gfSlots,
    codeOf
  } = model;

  return (
    <div className="space-y-8">
      <div>
        <h5 className="mb-1 text-sm font-semibold text-emerald-300">Winners Bracket</h5>
        <p className="mb-3 text-[10px] text-white/45">
          Lose once here and you drop to the losers bracket.
        </p>
        <div className="overflow-x-auto overflow-y-auto max-h-[55vh]">
          <div className="relative" style={{ width: wbWidth, height: wbHeight + 4 }}>
            {wbRounds.map((wr, idx) => (
              <div
                key={`wbh-${wr}`}
                className="absolute text-center text-[11px] font-semibold tracking-wide text-emerald-200/85"
                style={{ left: idx * (MATCH_W + COL_GAP), top: 0, width: MATCH_W }}
              >
                {wbRoundHeader(wr, maxWr)}
              </div>
            ))}
            <PyramidSvg width={wbWidth} height={wbHeight + 4} lines={wbLines} stroke="rgba(52,211,153,0.35)" />
            {wbNodes.map((n) => (
              <MatchCardAbs
                key={n.match.id}
                m={n.match}
                code={n.code}
                slot1={n.slot1}
                slot2={n.slot2}
                x={n.x}
                y={n.y}
                accent="border-emerald-500/40"
                {...props}
              />
            ))}
          </div>
        </div>
      </div>

      {lbMeta.length > 0 && (
        <div>
          <h5 className="mb-1 text-sm font-semibold text-rose-300">Losers Bracket</h5>
          <p className="mb-3 text-[10px] text-white/45">
            Second loss eliminates you. Winner reaches the grand final.
          </p>
          <div className="overflow-x-auto overflow-y-auto max-h-[55vh]">
            <div className="relative" style={{ width: lbWidth, height: lbHeight + 4 }}>
              {lbMeta.map((meta, idx) => (
                <div
                  key={`lbh-${meta.round}`}
                  className="absolute text-center text-[11px] font-semibold tracking-wide text-rose-200/85"
                  style={{ left: idx * (MATCH_W + COL_GAP), top: 0, width: MATCH_W }}
                >
                  {lbRoundHeader(idx, lbMeta.length)}
                </div>
              ))}
              <PyramidSvg width={lbWidth} height={lbHeight + 4} lines={lbLines} stroke="rgba(251,113,133,0.35)" />
              {lbNodes.map((n) => (
                <MatchCardAbs
                  key={n.match.id}
                  m={n.match}
                  code={n.code}
                  slot1={n.slot1}
                  slot2={n.slot2}
                  x={n.x}
                  y={n.y}
                  accent="border-rose-500/40"
                  {...props}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div>
        <h5 className="mb-1 text-sm font-semibold text-amber-300">Grand Final</h5>
        <p className="mb-3 text-[10px] text-white/45">
          Winners-bracket champ needs one win. If the losers-bracket champ wins game 1, a reset
          game is played.
        </p>
        <div className="flex flex-wrap gap-4">
          {grandFinals.map((m) => {
            const slots = gfSlots.get(m.id) || { s1: 'TBD', s2: 'TBD' };
            const code = codeOf.get(`${m.round}:${m.matchNumber}`) || 'GF-1';
            return (
              <div key={m.id} className="relative" style={{ width: MATCH_W, height: MATCH_H + HEADER_H }}>
                <div className="absolute left-0 top-0 w-full text-center text-[11px] font-semibold text-amber-200/85">
                  {m.round === 1001 ? 'Reset' : 'Game 1'}
                </div>
                <MatchCardAbs
                  m={m}
                  code={code}
                  slot1={slots.s1}
                  slot2={slots.s2}
                  x={0}
                  y={0}
                  accent="border-amber-500/50"
                  {...props}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TournamentDoubleBracket;
