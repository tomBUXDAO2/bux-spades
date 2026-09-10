import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, apiFetch } from '@/services/lib/api';
import TournamentBracketTree from './TournamentBracketTree';
import TournamentDoubleBracket from './TournamentDoubleBracket';
import { setTableReturnPath } from '@/pages/TablePage';
import { useSocket } from '@/features/auth/SocketContext';

type TournamentStatus =
  | 'REGISTRATION_OPEN'
  | 'REGISTRATION_CLOSED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

type Registration = {
  id: string;
  userId: string;
  partnerId?: string | null;
  isComplete: boolean;
  isSub?: boolean;
  user: { id: string; username: string; avatarUrl?: string | null };
  partner?: { id: string; username: string; avatarUrl?: string | null } | null;
};

type MatchRow = {
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

type Tournament = {
  id: string;
  name: string;
  mode: 'PARTNERS' | 'SOLO';
  format: string;
  status: TournamentStatus;
  startTime: string;
  eliminationType: string;
  prizes?: { firstPlaceCoins?: number; secondPlaceCoins?: number } | null;
  bannerUrl?: string | null;
  registrations?: Registration[];
  matches?: MatchRow[];
  teamLabels?: Record<string, string>;
  partnerDeclines?: { fromUserId: string; toUserId: string }[];
  registrationStats?: {
    totalRegistrations: number;
    completeTeams: number;
    unpartneredPlayers: number;
  };
};

type Member = {
  userId: string;
  user: { id: string; username: string };
};

type Props = {
  leagueId: string;
  theme: string;
  isAdmin: boolean;
  isTimedOut: boolean;
  currentUserId: string;
  members: Member[];
  initialTournamentId?: string | null;
  onOpenTable: (gameId: string, opts?: { spectate?: boolean }) => void;
};

const FORMAT_OPTIONS = ['REGULAR', 'WHIZ', 'MIRROR', 'GIMMICK'] as const;
const GIMMICK_OPTIONS = [
  { value: 'SUICIDE', label: 'Suicide' },
  { value: 'BID4NIL', label: '4 or Nil' },
  { value: 'BID3', label: 'Bid 3' },
  { value: 'BIDHEARTS', label: 'Bid Hearts' },
  { value: 'CRAZY_ACES', label: 'Crazy Aces' },
  { value: 'JOKER', label: 'Joker' }
] as const;
const SPECIAL_RULE1_OPTIONS = ['SCREAMER', 'ASSASSIN', 'SECRET_ASSASSIN'] as const;
const SPECIAL_RULE2_OPTIONS = ['LOWBALL', 'HIGHBALL'] as const;

const generateCoinOptions = () => {
  const values: number[] = [];
  for (let value = 50_000; value <= 1_000_000; value += 50_000) values.push(value);
  for (let value = 1_500_000; value <= 10_000_000; value += 500_000) values.push(value);
  return values;
};

const generatePrizeOptions = () => {
  const values: number[] = [];
  for (let value = 1_000_000; value <= 100_000_000; value += 1_000_000) values.push(value);
  return values;
};

const COIN_OPTION_VALUES = generateCoinOptions();
const PRIZE_OPTION_VALUES = generatePrizeOptions();

const formatCoins = (value?: number | null) => {
  if (value == null) return '';
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    const formatted = Number.isInteger(millions) ? millions.toString() : millions.toFixed(1).replace(/\.0$/, '');
    return `${formatted}mil`;
  }
  const thousands = value / 1_000;
  const formatted = Number.isInteger(thousands) ? thousands.toString() : thousands.toFixed(1).replace(/\.0$/, '');
  return `${formatted}k`;
};

const fieldClass =
  'mt-1 box-border w-full min-w-0 max-w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-sm text-white';
const labelClass = 'block min-w-0 text-xs text-white/70';
const datetimeFieldClass = `${fieldClass} appearance-none`;
const chipBase = 'rounded border px-2.5 py-1 text-[11px] font-semibold transition';

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return iso;
  }
}

function roundLabel(round: number) {
  if (round === 1001) return 'GF Reset';
  if (round >= 1000) return 'Grand Final';
  if (round >= 100 && round % 100 === 0) return `W${round / 100}`;
  if (round > 100) return `L${round}`;
  return `R${round}`;
}

function toggleSelection(array: string[], value: string) {
  return array.includes(value) ? array.filter((item) => item !== value) : [...array, value];
}

const LeagueTournamentsPanel: React.FC<Props> = ({
  leagueId,
  theme,
  isAdmin,
  isTimedOut,
  currentUserId,
  members,
  initialTournamentId = null,
  onOpenTable
}) => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialTournamentId);
  const [detail, setDetail] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [botCount, setBotCount] = useState(7);
  const { socket } = useSocket();
  const autoOpenedTables = useRef<Set<string>>(new Set());

  const [name, setName] = useState('');
  const [mode, setMode] = useState<'PARTNERS' | 'SOLO'>('PARTNERS');
  const [format, setFormat] = useState<(typeof FORMAT_OPTIONS)[number]>('REGULAR');
  const [eliminationType, setEliminationType] = useState<'SINGLE' | 'DOUBLE'>('SINGLE');
  const [startTime, setStartTime] = useState('');
  const [firstPlaceCoins, setFirstPlaceCoins] = useState(5_000_000);
  const [secondPlaceCoins, setSecondPlaceCoins] = useState(2_000_000);
  const [tournamentBuyIn, setTournamentBuyIn] = useState<number | ''>('');
  const [tableBuyIn, setTableBuyIn] = useState<number | ''>('');
  const [minPoints, setMinPoints] = useState(-100);
  const [maxPoints, setMaxPoints] = useState(500);
  const [nilAllowed, setNilAllowed] = useState(true);
  const [blindNilAllowed, setBlindNilAllowed] = useState(false);
  const [gimmickVariant, setGimmickVariant] = useState('');
  const [specialRule1, setSpecialRule1] = useState<string[]>([]);
  const [specialRule2, setSpecialRule2] = useState<string[]>([]);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const res = await api.get(`/api/leagues/${leagueId}/tournaments`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load tournaments');
    setTournaments(Array.isArray(data.tournaments) ? data.tournaments : []);
  }, [leagueId]);

  const loadDetail = useCallback(
    async (tournamentId: string) => {
      const res = await api.get(`/api/leagues/${leagueId}/tournaments/${tournamentId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load tournament');
      setDetail(data);
    },
    [leagueId]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        await loadList();
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadList]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        await loadDetail(selectedId);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load');
      }
    })();
    const t = setInterval(() => {
      if (selectedId) loadDetail(selectedId).catch(() => undefined);
    }, 8000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (initialTournamentId) setSelectedId(initialTournamentId);
  }, [initialTournamentId]);

  useEffect(() => {
    return () => {
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    };
  }, [bannerPreview]);

  const openTableFromBracket = useCallback(
    (gameId: string, opts?: { spectate?: boolean }) => {
      const tid = selectedId || detail?.id;
      const q = new URLSearchParams({ section: 'tournaments' });
      if (tid) q.set('tournament', tid);
      setTableReturnPath(`/league/${leagueId}?${q.toString()}`);
      onOpenTable(gameId, opts);
    },
    [leagueId, selectedId, detail?.id, onOpenTable]
  );

  // Auto-open assigned tournament tables for the current user
  useEffect(() => {
    if (!socket) return;
    const onTableReady = (payload: {
      leagueId?: string;
      tournamentId?: string;
      gameId?: string;
      playerIds?: string[];
    }) => {
      if (!payload?.gameId) return;
      if (payload.leagueId && payload.leagueId !== leagueId) return;
      if (!payload.playerIds?.includes(currentUserId)) return;
      if (autoOpenedTables.current.has(payload.gameId)) return;
      autoOpenedTables.current.add(payload.gameId);
      if (payload.tournamentId) setSelectedId(payload.tournamentId);
      openTableFromBracket(payload.gameId, { spectate: false });
    };
    const onPartnerRequest = (payload: {
      leagueId?: string;
      tournamentId?: string;
    }) => {
      if (payload.leagueId && payload.leagueId !== leagueId) return;
      const tid = payload.tournamentId || selectedId;
      if (tid) loadDetail(tid).catch(() => undefined);
    };
    socket.on('tournament_table_ready', onTableReady);
    socket.on('tournament_partner_request', onPartnerRequest);
    return () => {
      socket.off('tournament_table_ready', onTableReady);
      socket.off('tournament_partner_request', onPartnerRequest);
    };
  }, [socket, leagueId, currentUserId, openTableFromBracket, selectedId, loadDetail]);

  useEffect(() => {
    if (!detail || detail.status !== 'IN_PROGRESS') return;
    const teamHasUser = (teamId?: string | null) =>
      !!teamId && teamId.replace(/^team_/, '').split('_').includes(currentUserId);
    for (const m of detail.matches || []) {
      if (!m.gameId || m.status === 'COMPLETED') continue;
      const mine =
        (m.players || []).some((p) => p.id === currentUserId) ||
        teamHasUser(m.team1Id) ||
        teamHasUser(m.team2Id);
      if (!mine) continue;
      if (autoOpenedTables.current.has(m.gameId)) continue;
      autoOpenedTables.current.add(m.gameId);
      openTableFromBracket(m.gameId, { spectate: false });
      break;
    }
  }, [detail, currentUserId, openTableFromBracket]);

  const myReg = useMemo(
    () => detail?.registrations?.find((r) => r.userId === currentUserId),
    [detail, currentUserId]
  );

  const confirmedTeams = useMemo(() => {
    if (!detail?.registrations) return [];
    if (detail.mode === 'SOLO') {
      return detail.registrations
        .filter((r) => !r.isSub)
        .map((r) => ({ key: r.userId, label: r.user.username }));
    }
    const seen = new Set<string>();
    const teams: { key: string; label: string }[] = [];
    for (const r of detail.registrations) {
      if (!(r.partnerId && r.isComplete) || r.isSub) continue;
      const key = [r.userId, r.partnerId].sort().join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      teams.push({
        key,
        label: `${r.user.username} + ${r.partner?.username || 'Partner'}`
      });
    }
    return teams;
  }, [detail]);

  const substitutePlayers = useMemo(() => {
    if (!detail?.registrations || detail.mode !== 'PARTNERS') return [];
    return detail.registrations
      .filter((r) => r.isSub)
      .map((r) => ({ userId: r.userId, username: r.user.username }));
  }, [detail]);

  type FreePlayerAction = 'accept' | 'pending' | 'request' | 'none';

  const freePlayers = useMemo(() => {
    if (!detail?.registrations || detail.mode !== 'PARTNERS') return [];
    const declines = detail.partnerDeclines || [];
    const declinedWith = (otherId: string) =>
      declines.some(
        (d) =>
          (d.fromUserId === currentUserId && d.toUserId === otherId) ||
          (d.fromUserId === otherId && d.toUserId === currentUserId)
      );

    const canAct =
      !!myReg && !myReg.isSub && !(myReg.isComplete && myReg.partnerId) && !isTimedOut;

    return detail.registrations
      .filter((r) => !r.isSub && !(r.isComplete && r.partnerId))
      .map((r) => {
        let action: FreePlayerAction = 'none';
        if (r.userId === currentUserId) {
          action = 'none';
        } else if (!canAct) {
          action = 'none';
        } else if (!r.isComplete && r.partnerId === currentUserId) {
          action = 'accept';
        } else if (declinedWith(r.userId)) {
          action = 'none';
        } else if (myReg && !myReg.isComplete && myReg.partnerId === r.userId) {
          action = 'pending';
        } else {
          action = 'request';
        }
        return {
          userId: r.userId,
          username: r.user.username,
          isSelf: r.userId === currentUserId,
          action
        };
      });
  }, [detail, currentUserId, myReg, isTimedOut]);

  const teamNameById = useMemo(() => {
    const map = new Map<string, string>();
    if (detail?.teamLabels) {
      for (const [id, label] of Object.entries(detail.teamLabels)) {
        map.set(id, label);
      }
    }
    if (!detail?.registrations) return map;
    for (const r of detail.registrations) {
      if (detail.mode === 'SOLO') {
        map.set(`team_${r.userId}`, r.user.username);
        continue;
      }
      if (r.partnerId && r.isComplete) {
        const a = r.userId;
        const b = r.partnerId;
        const nameA = r.user.username;
        const nameB = r.partner?.username || 'Partner';
        const label = `${nameA} + ${nameB}`;
        map.set(`team_${a}_${b}`, label);
        map.set(`team_${b}_${a}`, label);
      }
    }
    return map;
  }, [detail]);

  const getTeamDisplay = (teamId: string | null) => {
    if (!teamId) return { name: 'TBD' };
    return { name: teamNameById.get(teamId) || 'Unknown team' };
  };

  const post = async (path: string, body?: object) => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.post(path, body || {});
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      if (data.deleted) {
        setDetail(null);
      } else if (data.tournament) {
        setDetail(data.tournament);
      } else if (data.id && data.name) {
        setDetail(data);
      }
      await loadList();
      return data;
    } catch (e: any) {
      setError(e.message || 'Request failed');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const resetCreateForm = () => {
    setName('');
    setMode('PARTNERS');
    setFormat('REGULAR');
    setEliminationType('SINGLE');
    setStartTime('');
    setFirstPlaceCoins(5_000_000);
    setSecondPlaceCoins(2_000_000);
    setTournamentBuyIn('');
    setTableBuyIn('');
    setMinPoints(-100);
    setMaxPoints(500);
    setNilAllowed(true);
    setBlindNilAllowed(false);
    setGimmickVariant('');
    setSpecialRule1([]);
    setSpecialRule2([]);
    setBannerFile(null);
    if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    setBannerPreview(null);
  };

  const createTournament = async () => {
    if (!name.trim() || !startTime) {
      setError('Name and start time are required');
      return;
    }
    if (!firstPlaceCoins && !secondPlaceCoins) {
      setError('Declare at least one prize amount');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('mode', mode);
      formData.append('format', format);
      formData.append('eliminationType', eliminationType);
      formData.append('startTime', new Date(startTime).toISOString());
      formData.append('firstPlaceCoins', String(firstPlaceCoins || 0));
      formData.append('secondPlaceCoins', String(secondPlaceCoins || 0));
      formData.append('tournamentBuyIn', String(tournamentBuyIn === '' ? 0 : tournamentBuyIn));
      formData.append('tableBuyIn', String(tableBuyIn === '' ? 0 : tableBuyIn));
      formData.append('minPoints', String(minPoints));
      formData.append('maxPoints', String(maxPoints));
      formData.append('nilAllowed', String(format === 'REGULAR' ? nilAllowed : true));
      formData.append('blindNilAllowed', String(format === 'REGULAR' ? blindNilAllowed : false));
      if (format === 'GIMMICK') {
        const variant = gimmickVariant || GIMMICK_OPTIONS[0].value;
        formData.append('gimmickVariant', variant);
      }
      formData.append('specialRule1', JSON.stringify(specialRule1));
      formData.append('specialRule2', JSON.stringify(specialRule2));
      if (bannerFile) formData.append('banner', bannerFile);

      const res = await apiFetch(`/api/leagues/${leagueId}/tournaments`, {
        method: 'POST',
        headers: {},
        body: formData
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      setShowCreate(false);
      resetCreateForm();
      await loadList();
      setSelectedId(data.id);
    } catch (e: any) {
      setError(e.message || 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const startEarly = async () => {
    if (!detail) return;
    if (
      !window.confirm(
        detail.status === 'REGISTRATION_OPEN'
          ? `While registration is open this only registers you and adds ${botCount} bots — it will not pair or build the bracket. Close registration for that.`
          : `Start early? Opens round-1 tables and marks the tournament live.`
      )
    ) {
      return;
    }
    try {
      await post(`/api/leagues/${leagueId}/tournaments/${detail.id}/start-early`, {
        botCount,
        registerAdmin: true
      });
    } catch {
      /* error already set */
    }
  };

  const addBots = async () => {
    if (!detail) return;
    try {
      await post(`/api/leagues/${leagueId}/tournaments/${detail.id}/add-bots`, { count: botCount });
    } catch {
      /* error already set */
    }
  };

  if (loading) {
    return <p className="text-sm text-white/70">Loading tournaments…</p>;
  }

  if (selectedId && detail) {
    const open = detail.status === 'REGISTRATION_OPEN';
    const closed = detail.status === 'REGISTRATION_CLOSED';
    const live = detail.status === 'IN_PROGRESS';

    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="text-xs text-cyan-200 hover:underline"
        >
          ← All tournaments
        </button>

        {error && (
          <p className="rounded-lg border border-rose-400/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-100">
            {error}
          </p>
        )}

        <div
          className="rounded-xl border border-white/15 p-4 backdrop-blur"
          style={{ backgroundColor: `${theme}99` }}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold text-white">{detail.name}</h3>
              <p className="text-xs text-white/60">
                {detail.status.replace(/_/g, ' ')} · {detail.mode} · {detail.format} ·{' '}
                {detail.eliminationType} elim · starts {formatWhen(detail.startTime)}
              </p>
              {detail.prizes && (
                <p className="mt-1 text-xs text-amber-200/90">
                  Prizes: {Number(detail.prizes.firstPlaceCoins || 0).toLocaleString()}
                  {detail.mode === 'PARTNERS' ? ' each' : ''} /{' '}
                  {Number(detail.prizes.secondPlaceCoins || 0).toLocaleString()}
                  {detail.mode === 'PARTNERS' ? ' each' : ''} coins
                </p>
              )}
            </div>
            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                {open && (
                  <>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={64}
                        value={botCount}
                        onChange={(e) => setBotCount(Math.max(0, Number(e.target.value) || 0))}
                        className="w-14 rounded border border-white/20 bg-black/40 px-1 py-1.5 text-center text-xs text-white"
                        title="Bot count"
                      />
                      <button
                        type="button"
                        disabled={saving}
                        onClick={addBots}
                        className="rounded-lg bg-violet-600/90 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500"
                      >
                        Add bots
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={startEarly}
                      className="rounded-lg bg-emerald-600/90 px-3 py-2 text-xs font-semibold text-white"
                    >
                      Start early
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        post(`/api/leagues/${leagueId}/tournaments/${detail.id}/close`)
                      }
                      className="rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold text-white hover:bg-white/25"
                    >
                      Close + build bracket
                    </button>
                    {detail.mode === 'PARTNERS' && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          if (
                            !window.confirm(
                              'Reset all players to looking for partner? Clears teams, pending requests, and subs.'
                            )
                          ) {
                            return;
                          }
                          post(
                            `/api/leagues/${leagueId}/tournaments/${detail.id}/reset-pairings`
                          );
                        }}
                        className="rounded-lg bg-amber-700/80 px-3 py-2 text-xs font-semibold text-white"
                      >
                        Reset pairings
                      </button>
                    )}
                  </>
                )}
                {closed && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={startEarly}
                    className="rounded-lg bg-emerald-600/90 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Start early (open tables)
                  </button>
                )}
                {(open || closed) && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() =>
                      post(`/api/leagues/${leagueId}/tournaments/${detail.id}/start`)
                    }
                    className="rounded-lg px-3 py-2 text-xs font-semibold text-white"
                    style={{ background: `linear-gradient(90deg, ${theme}, #0e7490)` }}
                  >
                    Start + roll call
                  </button>
                )}
                {detail.status !== 'CANCELLED' && detail.status !== 'COMPLETED' && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      if (
                        !window.confirm(
                          'Cancel and permanently remove this tournament? This cannot be undone.'
                        )
                      ) {
                        return;
                      }
                      try {
                        await post(`/api/leagues/${leagueId}/tournaments/${detail.id}/cancel`);
                        setSelectedId(null);
                        setDetail(null);
                      } catch {
                        /* error set */
                      }
                    }}
                    className="rounded-lg bg-rose-700/80 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Cancel & remove
                  </button>
                )}
              </div>
            )}
          </div>

          {detail.registrationStats && (
            <p className="mt-2 text-xs text-white/65">
              {detail.registrationStats.totalRegistrations} players ·{' '}
              {detail.registrationStats.completeTeams} teams ·{' '}
              {detail.registrationStats.unpartneredPlayers} unpartnered
            </p>
          )}
        </div>

        {open && !isTimedOut && (
          <div
            className="rounded-xl border border-white/15 p-4 backdrop-blur"
            style={{ backgroundColor: `${theme}99` }}
          >
            <h4 className="text-sm font-semibold text-white">Registration</h4>
            {myReg ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-xs text-white/80">
                  You are registered
                  {myReg.isSub
                    ? ' · SUB'
                    : detail.mode === 'PARTNERS' && myReg.isComplete && myReg.partner
                      ? ` with ${myReg.partner.username}`
                      : detail.mode === 'PARTNERS'
                        ? ' · request a partner in Entrants, or wait for auto-pair when registration closes'
                        : ''}
                </p>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    post(`/api/leagues/${leagueId}/tournaments/${detail.id}/unregister`)
                  }
                  className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Unregister
                </button>
              </div>
            ) : (
              <div className="mt-2 space-y-2">
                {detail.mode === 'PARTNERS' && (
                  <p className="text-[11px] text-white/65">
                    Register, then request a partner under Entrants — or wait until registration
                    closes to be auto-paired.
                  </p>
                )}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    post(`/api/leagues/${leagueId}/tournaments/${detail.id}/register`)
                  }
                  className="rounded-lg px-3 py-2 text-xs font-semibold text-white"
                  style={{ background: `linear-gradient(90deg, ${theme}, #0e7490)` }}
                >
                  Register
                </button>
              </div>
            )}
          </div>
        )}

        <div
          className="rounded-xl border border-white/15 p-4 backdrop-blur"
          style={{ backgroundColor: `${theme}99` }}
        >
          <h4 className="mb-2 text-sm font-semibold text-white">Entrants</h4>

          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-white/50">
            Teams
          </p>
          <ul className="mb-3 max-h-40 space-y-1 overflow-y-auto text-xs text-white/85">
            {confirmedTeams.length === 0 && (
              <li className="text-white/50">No confirmed teams yet.</li>
            )}
            {confirmedTeams.map((t) => (
              <li key={t.key}>{t.label}</li>
            ))}
          </ul>

          {detail.mode === 'PARTNERS' && (
            <>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-white/50">
                Looking for partner
              </p>
              <ul className="mb-3 max-h-56 space-y-1.5 overflow-y-auto text-xs text-white/85">
                {freePlayers.length === 0 && (
                  <li className="text-white/50">No unpartnered players.</li>
                )}
                {freePlayers.map((p) => (
                  <li
                    key={p.userId}
                    className="flex flex-wrap items-center justify-between gap-2"
                  >
                    <span>
                      {p.username}
                      {p.isSelf ? ' (you)' : ''}
                    </span>
                    <span className="flex items-center gap-1.5">
                      {p.action === 'accept' && (
                        <>
                          <button
                            type="button"
                            disabled={saving || isTimedOut}
                            className="rounded bg-emerald-600/80 px-2 py-1 text-[11px] font-semibold text-white"
                            onClick={() =>
                              post(
                                `/api/leagues/${leagueId}/tournaments/${detail.id}/partner-request/respond`,
                                { fromUserId: p.userId, accept: true }
                              )
                            }
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            disabled={saving || isTimedOut}
                            className="rounded bg-white/15 px-2 py-1 text-[11px] font-semibold text-white"
                            onClick={() =>
                              post(
                                `/api/leagues/${leagueId}/tournaments/${detail.id}/partner-request/respond`,
                                { fromUserId: p.userId, accept: false }
                              )
                            }
                          >
                            Decline
                          </button>
                        </>
                      )}
                      {p.action === 'pending' && (
                        <>
                          <span className="text-[11px] text-amber-200/80">Pending</span>
                          <button
                            type="button"
                            disabled={saving || isTimedOut}
                            className="rounded bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/80"
                            onClick={() =>
                              post(
                                `/api/leagues/${leagueId}/tournaments/${detail.id}/partner-request/cancel`
                              )
                            }
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {p.action === 'request' && (
                        <button
                          type="button"
                          disabled={saving || isTimedOut}
                          className="rounded px-2 py-1 text-[11px] font-semibold text-white"
                          style={{ background: `linear-gradient(90deg, ${theme}, #0e7490)` }}
                          onClick={() =>
                            post(
                              `/api/leagues/${leagueId}/tournaments/${detail.id}/partner-request`,
                              { toUserId: p.userId }
                            )
                          }
                        >
                          Request
                        </button>
                      )}
                      {isAdmin && open && !p.isSelf && (
                        <button
                          type="button"
                          disabled={saving}
                          className="text-[11px] text-white/45 hover:text-amber-200/90 hover:underline"
                          onClick={() =>
                            post(`/api/leagues/${leagueId}/tournaments/${detail.id}/admin-pair`, {
                              userId: p.userId,
                              asSub: true
                            })
                          }
                        >
                          Make sub
                        </button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              {(substitutePlayers.length > 0 || isAdmin) && (
                <>
                  <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-white/50">
                    Substitutes
                  </p>
                  <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-white/70">
                    {substitutePlayers.length === 0 && (
                      <li className="text-white/40">None</li>
                    )}
                    {substitutePlayers.map((p) => (
                      <li
                        key={`sub-${p.userId}`}
                        className="flex flex-wrap items-center justify-between gap-2"
                      >
                        <span>{p.username}</span>
                        {isAdmin && open && (
                          <button
                            type="button"
                            disabled={saving}
                            className="text-[11px] text-cyan-200/90 hover:underline"
                            onClick={() =>
                              post(
                                `/api/leagues/${leagueId}/tournaments/${detail.id}/admin-pair`,
                                { userId: p.userId, clearSub: true }
                              )
                            }
                          >
                            Return to pool
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>

        {(closed || live || detail.status === 'COMPLETED' || (detail.matches || []).length > 0) && (
          <div
            className="rounded-xl border border-white/15 p-4 backdrop-blur"
            style={{ backgroundColor: `${theme}99` }}
          >
            <h4 className="mb-3 text-sm font-semibold text-white">Bracket</h4>
            {(detail.matches || []).length === 0 ? (
              <p className="text-xs text-white/60">No matches yet.</p>
            ) : (detail.matches || []).every((m) => m.round >= 100) ? (
              <TournamentDoubleBracket
                matches={detail.matches || []}
                getTeamName={(id) => getTeamDisplay(id).name}
                currentUserId={currentUserId}
                live={live}
                isAdmin={isAdmin}
                isTimedOut={isTimedOut}
                saving={saving}
                onReady={(matchId) =>
                  post(
                    `/api/leagues/${leagueId}/tournaments/${detail.id}/matches/${matchId}/ready`
                  )
                }
                onOpenTable={openTableFromBracket}
                onForceOpen={(matchId) =>
                  post(
                    `/api/leagues/${leagueId}/tournaments/${detail.id}/matches/${matchId}/open-table`
                  )
                }
              />
            ) : (
              <TournamentBracketTree
                matches={detail.matches || []}
                getTeamName={(id) => getTeamDisplay(id).name}
                currentUserId={currentUserId}
                live={live}
                isAdmin={isAdmin}
                isTimedOut={isTimedOut}
                saving={saving}
                onReady={(matchId) =>
                  post(
                    `/api/leagues/${leagueId}/tournaments/${detail.id}/matches/${matchId}/ready`
                  )
                }
                onOpenTable={openTableFromBracket}
                onForceOpen={(matchId) =>
                  post(
                    `/api/leagues/${leagueId}/tournaments/${detail.id}/matches/${matchId}/open-table`
                  )
                }
              />
            )}
          </div>
        )}

      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-white drop-shadow">Tournaments</h3>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-white"
            style={{ background: `linear-gradient(90deg, ${theme}, #0e7490)` }}
          >
            {showCreate ? 'Close form' : 'Create tournament'}
          </button>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-rose-400/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-100">
          {error}
        </p>
      )}

      {showCreate && isAdmin && (
        <div
          className="min-w-0 space-y-4 overflow-x-hidden rounded-xl border border-white/15 p-4 backdrop-blur"
          style={{ backgroundColor: `${theme}99` }}
        >
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 [&>*]:min-w-0">
            <label className={`${labelClass} sm:col-span-2`}>
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fieldClass}
                placeholder="e.g. EVO Friday Night"
              />
            </label>
            <label className={labelClass}>
              Mode
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as 'PARTNERS' | 'SOLO')}
                className={fieldClass}
              >
                <option value="PARTNERS">Partners</option>
                <option value="SOLO">Solo</option>
              </select>
            </label>
            <label className={labelClass}>
              Format
              <select
                value={format}
                onChange={(e) => {
                  const next = e.target.value as (typeof FORMAT_OPTIONS)[number];
                  setFormat(next);
                  if (next !== 'REGULAR') {
                    setNilAllowed(true);
                    setBlindNilAllowed(false);
                  }
                  if (next === 'GIMMICK') {
                    setGimmickVariant((prev) => prev || GIMMICK_OPTIONS[0].value);
                  } else {
                    setGimmickVariant('');
                  }
                }}
                className={fieldClass}
              >
                {FORMAT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f.charAt(0) + f.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            {format === 'GIMMICK' && (
              <label className={labelClass}>
                Gimmick type
                <select
                  value={gimmickVariant || GIMMICK_OPTIONS[0].value}
                  onChange={(e) => setGimmickVariant(e.target.value)}
                  className={fieldClass}
                  required
                >
                  {GIMMICK_OPTIONS.map((variant) => (
                    <option key={variant.value} value={variant.value}>
                      {variant.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className={labelClass}>
              Elimination
              <select
                value={eliminationType}
                onChange={(e) => setEliminationType(e.target.value as 'SINGLE' | 'DOUBLE')}
                className={fieldClass}
              >
                <option value="SINGLE">Single</option>
                <option value="DOUBLE">Double</option>
              </select>
              {eliminationType === 'DOUBLE' && (
                <span className="mt-1 block text-[10px] font-normal text-white/50">
                  Needs 2 / 4 / 8 / 16 teams (power of 2). Lose in winners → losers bracket. Grand
                  final: winners champ needs 1 win; if losers champ wins game 1, a reset is played.
                </span>
              )}
            </label>
            <label className={labelClass}>
              Start (local)
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={datetimeFieldClass}
              />
            </label>
            <label className={labelClass}>
              Tournament entry fee
              <select
                value={tournamentBuyIn}
                onChange={(e) =>
                  setTournamentBuyIn(e.target.value === '' ? '' : Number(e.target.value))
                }
                className={fieldClass}
              >
                <option value="">Free entry</option>
                {COIN_OPTION_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {formatCoins(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Table buy-in
              <select
                value={tableBuyIn}
                onChange={(e) => setTableBuyIn(e.target.value === '' ? '' : Number(e.target.value))}
                className={fieldClass}
              >
                <option value="">Free games</option>
                {COIN_OPTION_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {formatCoins(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              {mode === 'PARTNERS' ? 'Winners prize (each)' : '1st prize'}
              <select
                value={firstPlaceCoins}
                onChange={(e) => setFirstPlaceCoins(Number(e.target.value))}
                className={fieldClass}
              >
                <option value={0}>No prize</option>
                {PRIZE_OPTION_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {formatCoins(value)}
                    {mode === 'PARTNERS' ? ' each' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              {mode === 'PARTNERS' ? 'Runners-up prize (each)' : '2nd prize'}
              <select
                value={secondPlaceCoins}
                onChange={(e) => setSecondPlaceCoins(Number(e.target.value))}
                className={fieldClass}
              >
                <option value={0}>No prize</option>
                {PRIZE_OPTION_VALUES.map((value) => (
                  <option key={value} value={value}>
                    {formatCoins(value)}
                    {mode === 'PARTNERS' ? ' each' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className={labelClass}>
            Banner image
            <input
              type="file"
              accept="image/png,image/jpeg"
              className="mt-1 block w-full text-xs text-white/80 file:mr-3 file:rounded file:border-0 file:bg-cyan-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setBannerFile(file);
                if (bannerPreview) URL.revokeObjectURL(bannerPreview);
                setBannerPreview(file ? URL.createObjectURL(file) : null);
              }}
            />
          </label>
          {bannerPreview && (
            <img
              src={bannerPreview}
              alt="Banner preview"
              className="h-24 w-40 rounded object-cover"
            />
          )}

          <div className="border-t border-white/10 pt-3">
            <h4 className="mb-2 text-sm font-semibold text-white">Game settings</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className={labelClass}>
                Min points
                <input
                  type="number"
                  value={minPoints}
                  onChange={(e) => setMinPoints(Number(e.target.value))}
                  className={fieldClass}
                />
              </label>
              <label className={labelClass}>
                Max points
                <input
                  type="number"
                  value={maxPoints}
                  onChange={(e) => setMaxPoints(Number(e.target.value))}
                  className={fieldClass}
                />
              </label>
              <label className={labelClass}>
                Nil allowed
                <select
                  disabled={format !== 'REGULAR'}
                  value={format === 'REGULAR' ? (nilAllowed ? 'true' : 'false') : 'true'}
                  onChange={(e) => setNilAllowed(e.target.value === 'true')}
                  className={`${fieldClass} disabled:opacity-50`}
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
              <label className={labelClass}>
                Blind nil allowed
                <select
                  disabled={format !== 'REGULAR'}
                  value={format === 'REGULAR' ? (blindNilAllowed ? 'true' : 'false') : 'false'}
                  onChange={(e) => setBlindNilAllowed(e.target.value === 'true')}
                  className={`${fieldClass} disabled:opacity-50`}
                >
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </label>
              <div className="space-y-1.5">
                <span className={labelClass}>Special rule #1</span>
                <div className="flex flex-wrap gap-1.5">
                  {SPECIAL_RULE1_OPTIONS.map((rule) => (
                    <button
                      type="button"
                      key={rule}
                      onClick={() => setSpecialRule1((prev) => toggleSelection(prev, rule))}
                      className={`${chipBase} ${
                        specialRule1.includes(rule)
                          ? 'border-cyan-400 bg-cyan-600 text-white'
                          : 'border-white/20 bg-black/30 text-white/70'
                      }`}
                    >
                      {rule}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <span className={labelClass}>Special rule #2</span>
                <div className="flex flex-wrap gap-1.5">
                  {SPECIAL_RULE2_OPTIONS.map((rule) => (
                    <button
                      type="button"
                      key={rule}
                      onClick={() => setSpecialRule2((prev) => toggleSelection(prev, rule))}
                      className={`${chipBase} ${
                        specialRule2.includes(rule)
                          ? 'border-cyan-400 bg-cyan-600 text-white'
                          : 'border-white/20 bg-black/30 text-white/70'
                      }`}
                    >
                      {rule}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-white/55">
            League admins only. Registration auto-closes at T-10. Use Start early + bots to test
            before human play. Credit prizes from the league wallet.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={createTournament}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
              style={{ background: `linear-gradient(90deg, ${theme}, #0e7490)` }}
            >
              {saving ? 'Creating…' : 'Create'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={resetCreateForm}
              className="rounded-lg bg-white/15 px-3 py-2 text-xs font-semibold text-white"
            >
              Reset
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {tournaments.length === 0 ? (
          <p className="text-sm text-white/60">No tournaments yet.</p>
        ) : (
          tournaments.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              className="flex w-full items-center justify-between rounded-xl border border-white/15 px-4 py-3 text-left backdrop-blur hover:bg-white/10"
              style={{ backgroundColor: `${theme}99` }}
            >
              <div>
                <div className="font-semibold text-white">{t.name}</div>
                <div className="text-xs text-white/60">
                  {t.status.replace(/_/g, ' ')} · {formatWhen(t.startTime)}
                </div>
              </div>
              <span className="text-xs text-cyan-200">Open →</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default LeagueTournamentsPanel;
