import React, { useCallback, useEffect, useState } from 'react';
import { api } from '@/services/lib/api';
import GameTile from '@/components/game/GameTile';

type CriterionType =
  | 'MOST_WINS'
  | 'MOST_GAMES_PLAYED'
  | 'MOST_LOSSES'
  | 'HIGHEST_WIN_PERCENT'
  | 'GAMES_PLAYED_MILESTONE'
  | 'GAMES_WON_MILESTONE';

type CriterionDraft = {
  type: CriterionType;
  rewardCoins: string;
  milestoneValue: string;
};

type LeagueEvent = {
  id: string;
  name: string;
  description?: string | null;
  status: string;
  startsAt: string;
  endsAt: string;
  bannerUrl?: string | null;
  filters?: Record<string, unknown> | null;
  criteria?: { type: string; rewardCoins: number; milestoneValue?: number | null }[];
  leaderboard?: {
    rows: {
      user: { id: string; username: string; avatarUrl?: string | null };
      played: number;
      won: number;
      lost: number;
      winPercent: number;
    }[];
    byCriterion: {
      type: string;
      label: string;
      rewardCoins: number;
      winners: { user: { username: string }; value: number }[];
    }[];
  };
};

type Props = {
  leagueId: string;
  theme: string;
  isAdmin: boolean;
  isTimedOut: boolean;
  onCreateEventTable: (eventId: string) => void;
  onJoinGame: (gameId: string, seat?: number) => void;
  onWatchGame: (gameId: string) => void;
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
const COIN_OPTION_VALUES = generateCoinOptions();

const formatCoins = (value?: number | null) => {
  if (value == null) return '';
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    const formatted = Number.isInteger(millions)
      ? millions.toString()
      : millions.toFixed(1).replace(/\.0$/, '');
    return `${formatted}mil`;
  }
  const thousands = value / 1_000;
  const formatted = Number.isInteger(thousands)
    ? thousands.toString()
    : thousands.toFixed(1).replace(/\.0$/, '');
  return `${formatted}k`;
};

const fieldClass =
  'mt-1 w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-sm text-white';
const labelClass = 'block text-xs text-white/70';
const chipBase = 'rounded border px-2.5 py-1 text-[11px] font-semibold transition';

function toggleSelection(array: string[], value: string) {
  return array.includes(value) ? array.filter((v) => v !== value) : [...array, value];
}

const CRITERION_OPTIONS: { type: CriterionType; label: string; needsMilestone?: boolean }[] = [
  { type: 'MOST_WINS', label: 'Most wins' },
  { type: 'MOST_GAMES_PLAYED', label: 'Most games played' },
  { type: 'MOST_LOSSES', label: 'Most losses' },
  { type: 'HIGHEST_WIN_PERCENT', label: 'Highest win %' },
  { type: 'GAMES_PLAYED_MILESTONE', label: 'Hit X games played', needsMilestone: true },
  { type: 'GAMES_WON_MILESTONE', label: 'Hit X games won', needsMilestone: true }
];

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

function summarizeFilters(filters?: Record<string, unknown> | null): string | null {
  if (!filters || typeof filters !== 'object') return null;
  const parts: string[] = [];
  const modes = filters.allowedModes as string[] | undefined;
  const formats = filters.allowedFormats as string[] | undefined;
  const gimmicks = filters.allowedGimmickVariants as string[] | undefined;
  if (modes?.length) parts.push(modes.join('/'));
  if (formats?.length) parts.push(formats.join('/'));
  if (gimmicks?.length) parts.push(gimmicks.join('/'));
  if (filters.minPoints != null) parts.push(`min ${filters.minPoints}`);
  if (filters.maxPoints != null) parts.push(`max ${filters.maxPoints}`);
  if (filters.nilAllowed === true) parts.push('nil');
  if (filters.nilAllowed === false) parts.push('no nil');
  if (filters.blindNilAllowed === true) parts.push('blind nil');
  const coins = filters.coins as number[] | undefined;
  if (Array.isArray(coins) && coins.length === 1) {
    parts.push(coins[0] === 0 ? 'free' : formatCoins(coins[0]));
  }
  const s1 = filters.allowedSpecialRule1 as string[] | undefined;
  const s2 = filters.allowedSpecialRule2 as string[] | undefined;
  if (s1?.length) parts.push(s1.join('+'));
  if (s2?.length) parts.push(s2.join('+'));
  return parts.length ? parts.join(' · ') : null;
}

const LeagueEventsPanel: React.FC<Props> = ({
  leagueId,
  theme,
  isAdmin,
  isTimedOut,
  onCreateEventTable,
  onJoinGame,
  onWatchGame
}) => {
  const [events, setEvents] = useState<LeagueEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeagueEvent | null>(null);
  const [games, setGames] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'PARTNERS' | 'SOLO'>('PARTNERS');
  const [format, setFormat] = useState<(typeof FORMAT_OPTIONS)[number]>('REGULAR');
  const [gimmickVariant, setGimmickVariant] = useState('');
  const [tableBuyIn, setTableBuyIn] = useState<number | ''>('');
  const [minPoints, setMinPoints] = useState(-100);
  const [maxPoints, setMaxPoints] = useState(500);
  const [nilAllowed, setNilAllowed] = useState(true);
  const [blindNilAllowed, setBlindNilAllowed] = useState(false);
  const [specialRule1, setSpecialRule1] = useState<string[]>([]);
  const [specialRule2, setSpecialRule2] = useState<string[]>([]);
  const [criteria, setCriteria] = useState<CriterionDraft[]>([
    { type: 'MOST_WINS', rewardCoins: '1000000', milestoneValue: '' }
  ]);
  const [saving, setSaving] = useState(false);

  const resetCreateForm = () => {
    setName('');
    setDescription('');
    setStartsAt('');
    setEndsAt('');
    setBannerFile(null);
    setMode('PARTNERS');
    setFormat('REGULAR');
    setGimmickVariant('');
    setTableBuyIn('');
    setMinPoints(-100);
    setMaxPoints(500);
    setNilAllowed(true);
    setBlindNilAllowed(false);
    setSpecialRule1([]);
    setSpecialRule2([]);
    setCriteria([{ type: 'MOST_WINS', rewardCoins: '1000000', milestoneValue: '' }]);
  };

  const buildFiltersPayload = () => {
    const filters: Record<string, unknown> = {
      allowedModes: [mode],
      allowedFormats: [format],
      minPoints,
      maxPoints,
      nilAllowed: format === 'REGULAR' ? nilAllowed : true,
      blindNilAllowed: format === 'REGULAR' ? blindNilAllowed : false
    };
    if (format === 'GIMMICK') {
      filters.allowedGimmickVariants = [gimmickVariant || GIMMICK_OPTIONS[0].value];
    }
    const buyIn = tableBuyIn === '' ? 0 : Number(tableBuyIn);
    filters.coins = [buyIn];
    filters.minCoins = buyIn;
    filters.maxCoins = buyIn;
    filters.coinRange = { min: buyIn, max: buyIn };
    if (specialRule1.length) filters.allowedSpecialRule1 = specialRule1;
    if (specialRule2.length) filters.allowedSpecialRule2 = specialRule2;
    return filters;
  };

  const loadList = useCallback(async () => {
    const res = await api.get(`/api/leagues/${leagueId}/events`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load events');
    setEvents(Array.isArray(data.events) ? data.events : []);
  }, [leagueId]);

  const loadDetail = useCallback(
    async (eventId: string) => {
      const [evRes, gamesRes] = await Promise.all([
        api.get(`/api/leagues/${leagueId}/events/${eventId}`),
        api.get(`/api/games?leagueId=${encodeURIComponent(leagueId)}&eventId=${encodeURIComponent(eventId)}`)
      ]);
      const evData = await evRes.json().catch(() => ({}));
      if (!evRes.ok) throw new Error(evData.error || 'Failed to load event');
      setDetail(evData);
      if (gamesRes.ok) {
        const g = await gamesRes.json();
        setGames(Array.isArray(g) ? g : []);
      } else {
        setGames([]);
      }
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
      setGames([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        await loadDetail(selectedId);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load event');
      }
    })();
    const t = setInterval(() => {
      if (selectedId) loadDetail(selectedId).catch(() => undefined);
    }, 10000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [selectedId, loadDetail]);

  const createEvent = async () => {
    if (!name.trim() || !startsAt || !endsAt) {
      setError('Name, start, and end are required');
      return;
    }
    if (format === 'GIMMICK' && !(gimmickVariant || GIMMICK_OPTIONS[0].value)) {
      setError('Select a gimmick type');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('name', name.trim());
      form.append('description', description.trim());
      form.append('timezone', 'UTC');
      form.append('startsAt', new Date(startsAt).toISOString());
      form.append('endsAt', new Date(endsAt).toISOString());
      form.append('filters', JSON.stringify(buildFiltersPayload()));
      form.append(
        'criteria',
        JSON.stringify(
          criteria.map((c) => ({
            type: c.type,
            rewardCoins: Math.floor(Number(c.rewardCoins)),
            milestoneValue: c.milestoneValue ? Math.floor(Number(c.milestoneValue)) : null
          }))
        )
      );
      if (bannerFile) form.append('banner', bannerFile);

      const token =
        localStorage.getItem('sessionToken') ||
        sessionStorage.getItem('sessionToken') ||
        (window as any).__tempSessionToken;
      const apiBase =
        import.meta.env.VITE_API_URL ||
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          ? 'http://localhost:3000'
          : 'https://bux-spades-server.fly.dev');
      const res = await fetch(`${apiBase}/api/leagues/${leagueId}/events`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to create event');
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

  if (loading) {
    return <p className="text-sm text-white/70">Loading events…</p>;
  }

  if (selectedId && detail) {
    const active = detail.status === 'ACTIVE';
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setSelectedId(null)}
          className="text-xs text-cyan-200 hover:underline"
        >
          ← All events
        </button>

        {detail.bannerUrl && (
          <img
            src={detail.bannerUrl}
            alt=""
            className="max-h-40 w-full rounded-xl border border-white/15 object-cover"
          />
        )}

        <div
          className="rounded-xl border border-white/15 p-4 backdrop-blur"
          style={{ backgroundColor: `${theme}99` }}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-semibold text-white">{detail.name}</h3>
              <p className="text-xs text-white/60">
                {detail.status} · {formatWhen(detail.startsAt)} → {formatWhen(detail.endsAt)}
              </p>
            </div>
            {active && (
              <button
                type="button"
                disabled={isTimedOut}
                onClick={() => onCreateEventTable(detail.id)}
                className="rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                style={{ background: `linear-gradient(90deg, ${theme}, #0e7490)` }}
              >
                Create event table
              </button>
            )}
          </div>
          {detail.description && (
            <p className="mt-2 whitespace-pre-wrap text-sm text-white/85">{detail.description}</p>
          )}
          {summarizeFilters(detail.filters) && (
            <p className="mt-2 text-xs text-cyan-100/90">
              Game settings: {summarizeFilters(detail.filters)}
            </p>
          )}
          {!!detail.criteria?.length && (
            <ul className="mt-3 space-y-1 text-xs text-white/75">
              {detail.criteria.map((c, i) => (
                <li key={i}>
                  {CRITERION_OPTIONS.find((o) => o.type === c.type)?.label || c.type}
                  {c.milestoneValue ? ` (${c.milestoneValue})` : ''} —{' '}
                  {Number(c.rewardCoins).toLocaleString()} coins
                </li>
              ))}
            </ul>
          )}
        </div>

        {active && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-white">Event lobby</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              {games.length === 0 ? (
                <p className="text-sm text-white/60">No event tables yet. Create one to play.</p>
              ) : (
                games.map((game) => (
                  <GameTile
                    key={game.id}
                    game={game}
                    onJoinGame={(id, seat) => onJoinGame(id, seat)}
                    onWatchGame={(id) => onWatchGame(id)}
                    canJoinOrWatch={!isTimedOut}
                  />
                ))
              )}
            </div>
          </div>
        )}

        <div
          className="overflow-x-auto rounded-xl border border-white/15 backdrop-blur"
          style={{ backgroundColor: `${theme}99` }}
        >
          <div className="border-b border-white/10 px-3 py-2 text-sm font-semibold text-white">
            Leaderboard
          </div>
          <table className="w-full min-w-[28rem] text-left text-xs">
            <thead>
              <tr className="border-b border-white/10 text-white/55">
                <th className="px-3 py-2">Player</th>
                <th className="px-2 py-2">Played</th>
                <th className="px-2 py-2">Won</th>
                <th className="px-2 py-2">Lost</th>
                <th className="px-2 py-2">Win %</th>
              </tr>
            </thead>
            <tbody>
              {(detail.leaderboard?.rows || []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-white/55">
                    No results yet
                  </td>
                </tr>
              ) : (
                detail.leaderboard!.rows.map((r) => (
                  <tr key={r.user.id} className="border-b border-white/10">
                    <td className="px-3 py-2 font-medium text-white">{r.user.username}</td>
                    <td className="px-2 py-2 tabular-nums">{r.played}</td>
                    <td className="px-2 py-2 tabular-nums text-emerald-300">{r.won}</td>
                    <td className="px-2 py-2 tabular-nums text-rose-300">{r.lost}</td>
                    <td className="px-2 py-2 tabular-nums">{r.winPercent.toFixed(1)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-100">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold text-white drop-shadow">Events</h3>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-white"
            style={{ background: `linear-gradient(90deg, ${theme}, #0e7490)` }}
          >
            {showCreate ? 'Close' : 'Create event'}
          </button>
        )}
      </div>

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
                placeholder="e.g. Weekend Grind"
              />
            </label>
            <label className={`${labelClass} sm:col-span-2`}>
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Details / rules"
                rows={3}
                className={fieldClass}
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
              Starts (local)
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className={fieldClass}
              />
            </label>
            <label className={labelClass}>
              Ends (local)
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className={fieldClass}
              />
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
          </div>

          <label className={labelClass}>
            Banner image (optional)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="mt-1 block w-full text-xs text-white/80 file:mr-3 file:rounded file:border-0 file:bg-cyan-700 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white"
              onChange={(e) => setBannerFile(e.target.files?.[0] || null)}
            />
          </label>

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

          <div className="space-y-2 border-t border-white/10 pt-3">
            <div className="text-xs font-semibold text-white/80">Prize criteria</div>
            {criteria.map((c, idx) => {
              const meta = CRITERION_OPTIONS.find((o) => o.type === c.type);
              return (
                <div
                  key={idx}
                  className="flex flex-wrap items-end gap-2 rounded border border-white/10 bg-black/20 p-2"
                >
                  <select
                    value={c.type}
                    onChange={(e) => {
                      const next = [...criteria];
                      next[idx] = { ...next[idx], type: e.target.value as CriterionType };
                      setCriteria(next);
                    }}
                    className="rounded border border-white/15 bg-black/40 px-2 py-1 text-xs text-white"
                  >
                    {CRITERION_OPTIONS.map((o) => (
                      <option key={o.type} value={o.type}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={c.rewardCoins}
                    onChange={(e) => {
                      const next = [...criteria];
                      next[idx] = { ...next[idx], rewardCoins: e.target.value };
                      setCriteria(next);
                    }}
                    placeholder="Coins"
                    className="w-28 rounded border border-white/15 bg-black/40 px-2 py-1 text-xs text-white"
                  />
                  {meta?.needsMilestone && (
                    <input
                      type="number"
                      min={1}
                      value={c.milestoneValue}
                      onChange={(e) => {
                        const next = [...criteria];
                        next[idx] = { ...next[idx], milestoneValue: e.target.value };
                        setCriteria(next);
                      }}
                      placeholder="X"
                      className="w-20 rounded border border-white/15 bg-black/40 px-2 py-1 text-xs text-white"
                    />
                  )}
                  {criteria.length > 1 && (
                    <button
                      type="button"
                      className="text-[10px] text-rose-300"
                      onClick={() => setCriteria(criteria.filter((_, i) => i !== idx))}
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
            <button
              type="button"
              className="text-xs text-cyan-200 hover:underline"
              onClick={() =>
                setCriteria([
                  ...criteria,
                  { type: 'MOST_GAMES_PLAYED', rewardCoins: '500000', milestoneValue: '' }
                ])
              }
            >
              + Add criterion
            </button>
          </div>

          <p className="text-[11px] text-white/55">
            Event tables must match these game settings (same options as tournament create).
          </p>

          <button
            type="button"
            disabled={saving}
            onClick={createEvent}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            style={{ background: `linear-gradient(90deg, ${theme}, #0e7490)` }}
          >
            {saving ? 'Creating…' : 'Create event'}
          </button>
        </div>
      )}

      <div className="space-y-2">
        {events.length === 0 ? (
          <div
            className="rounded-xl border border-white/15 p-6 text-sm text-white/70"
            style={{ backgroundColor: `${theme}99` }}
          >
            No events yet.
          </div>
        ) : (
          events.map((ev) => (
            <button
              key={ev.id}
              type="button"
              onClick={() => setSelectedId(ev.id)}
              className="flex w-full items-center gap-3 rounded-xl border border-white/15 p-3 text-left backdrop-blur hover:bg-white/5"
              style={{ backgroundColor: `${theme}99` }}
            >
              {ev.bannerUrl ? (
                <img src={ev.bannerUrl} alt="" className="h-14 w-20 shrink-0 rounded object-cover" />
              ) : (
                <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded bg-black/30 text-xs text-white/40">
                  Event
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-white">{ev.name}</div>
                <div className="text-[11px] text-white/60">
                  {ev.status} · {formatWhen(ev.startsAt)} → {formatWhen(ev.endsAt)}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default LeagueEventsPanel;
