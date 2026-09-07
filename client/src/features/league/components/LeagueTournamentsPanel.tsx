import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, apiFetch } from '@/services/lib/api';
import TournamentBracketTree from './TournamentBracketTree';

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
  onOpenTable: (gameId: string, opts?: { spectate?: boolean }) => void;
};

const FORMAT_OPTIONS = ['REGULAR', 'WHIZ', 'MIRROR', 'GIMMICK'] as const;
const GIMMICK_OPTIONS = ['SUICIDE', 'BID4NIL', 'BID3', 'BIDHEARTS', 'CRAZY_ACES', 'JOKER'] as const;
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
  'mt-1 w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-sm text-white';
const labelClass = 'block text-xs text-white/70';
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
  if (round >= 1000) return 'Grand Final';
  if (round >= 100) return `W${round / 100}`;
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
  onOpenTable
}) => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [partnerId, setPartnerId] = useState('');
  const [botCount, setBotCount] = useState(7);

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
    return () => {
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
    };
  }, [bannerPreview]);

  const myReg = useMemo(
    () => detail?.registrations?.find((r) => r.userId === currentUserId),
    [detail, currentUserId]
  );

  const partnerOptions = useMemo(
    () => members.filter((m) => m.userId !== currentUserId),
    [members, currentUserId]
  );

  /** Unique teams for entrants list (partners shown once). */
  const entrantTeams = useMemo(() => {
    if (!detail?.registrations) return [];
    if (detail.mode === 'SOLO') {
      return detail.registrations
        .filter((r) => !r.isSub)
        .map((r) => ({
          key: r.userId,
          label: r.user.username,
          isSub: false
        }));
    }
    const seen = new Set<string>();
    const teams: { key: string; label: string; isSub: boolean }[] = [];
    for (const r of detail.registrations) {
      if (r.isSub) {
        teams.push({ key: `sub-${r.userId}`, label: `${r.user.username} (sub)`, isSub: true });
        continue;
      }
      if (r.partnerId && r.isComplete) {
        const key = [r.userId, r.partnerId].sort().join(':');
        if (seen.has(key)) continue;
        seen.add(key);
        const partnerName = r.partner?.username || 'Partner';
        teams.push({
          key,
          label: `${r.user.username} + ${partnerName}`,
          isSub: false
        });
      } else if (!r.partnerId) {
        teams.push({
          key: r.userId,
          label: `${r.user.username} (looking for partner)`,
          isSub: false
        });
      }
    }
    return teams;
  }, [detail]);

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
      formData.append('nilAllowed', String(format === 'REGULAR' ? nilAllowed : false));
      formData.append('blindNilAllowed', String(format === 'REGULAR' ? blindNilAllowed : false));
      if (format === 'GIMMICK' && gimmickVariant) {
        formData.append('gimmickVariant', gimmickVariant);
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
        `Start early? Registers you if needed, adds ${botCount} bots if registration is open, builds the bracket, and opens round-1 tables.`
      )
    ) {
      return;
    }
    try {
      const data = await post(`/api/leagues/${leagueId}/tournaments/${detail.id}/start-early`, {
        botCount,
        registerAdmin: true
      });
      if (data.message) setError(null);
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
                  {myReg.partner
                    ? ` with ${myReg.partner.username}`
                    : detail.mode === 'PARTNERS'
                      ? ' (looking for partner)'
                      : ''}
                  {myReg.isSub ? ' · SUB' : ''}
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
              <div className="mt-2 flex flex-wrap items-end gap-2">
                {detail.mode === 'PARTNERS' && (
                  <label className={labelClass}>
                    Partner (optional)
                    <select
                      value={partnerId}
                      onChange={(e) => setPartnerId(e.target.value)}
                      className={`${fieldClass} w-48`}
                    >
                      <option value="">Solo pool — claim later</option>
                      {partnerOptions.map((m) => (
                        <option key={m.userId} value={m.userId}>
                          {m.user.username}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() =>
                    post(`/api/leagues/${leagueId}/tournaments/${detail.id}/register`, {
                      partnerId: partnerId || null
                    })
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
          <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-white/85">
            {entrantTeams.length === 0 && (
              <li className="text-white/50">No registrations yet.</li>
            )}
            {entrantTeams.map((t) => (
              <li key={t.key} className="flex flex-wrap items-center justify-between gap-2">
                <span>{t.label}</span>
              </li>
            ))}
          </ul>
          {isAdmin && open && detail.mode === 'PARTNERS' && (
            <ul className="mt-2 space-y-1 text-xs">
              {(detail.registrations || [])
                .filter((r) => !r.partnerId && !r.isSub)
                .map((r) => (
                  <li key={`admin-${r.id}`} className="flex justify-between gap-2 text-white/70">
                    <span>{r.user.username} needs partner</span>
                    <button
                      type="button"
                      disabled={saving}
                      className="text-amber-200/90 hover:underline"
                      onClick={() =>
                        post(`/api/leagues/${leagueId}/tournaments/${detail.id}/admin-pair`, {
                          userId: r.userId,
                          asSub: true
                        })
                      }
                    >
                      Mark sub
                    </button>
                  </li>
                ))}
            </ul>
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
              <ul className="space-y-2">
                {(detail.matches || []).map((m) => (
                  <li
                    key={m.id}
                    className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/85"
                  >
                    {roundLabel(m.round)} · Match {m.matchNumber} · {m.status}
                  </li>
                ))}
              </ul>
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
                onOpenTable={onOpenTable}
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
          className="space-y-4 rounded-xl border border-white/15 p-4 backdrop-blur"
          style={{ backgroundColor: `${theme}99` }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
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
                onChange={(e) => setFormat(e.target.value as (typeof FORMAT_OPTIONS)[number])}
                className={fieldClass}
              >
                {FORMAT_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f.charAt(0) + f.slice(1).toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
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
            </label>
            <label className={labelClass}>
              Start (local)
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={fieldClass}
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
              {format === 'GIMMICK' && (
                <label className={labelClass}>
                  Gimmick variant
                  <select
                    value={gimmickVariant}
                    onChange={(e) => setGimmickVariant(e.target.value)}
                    className={fieldClass}
                  >
                    <option value="">None</option>
                    {GIMMICK_OPTIONS.map((variant) => (
                      <option key={variant} value={variant}>
                        {variant}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className={labelClass}>
                Nil allowed
                <select
                  disabled={format !== 'REGULAR'}
                  value={nilAllowed ? 'true' : 'false'}
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
                  value={blindNilAllowed ? 'true' : 'false'}
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
