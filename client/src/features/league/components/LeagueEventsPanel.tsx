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
  const [criteria, setCriteria] = useState<CriterionDraft[]>([
    { type: 'MOST_WINS', rewardCoins: '1000000', milestoneValue: '' }
  ]);
  const [saving, setSaving] = useState(false);

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
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('name', name.trim());
      form.append('description', description.trim());
      form.append('timezone', 'UTC');
      form.append('startsAt', new Date(startsAt).toISOString());
      form.append('endsAt', new Date(endsAt).toISOString());
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
      setName('');
      setDescription('');
      setStartsAt('');
      setEndsAt('');
      setBannerFile(null);
      setCriteria([{ type: 'MOST_WINS', rewardCoins: '1000000', milestoneValue: '' }]);
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
          className="space-y-2 rounded-xl border border-white/15 p-3 backdrop-blur"
          style={{ backgroundColor: `${theme}99` }}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Event name"
            className="w-full rounded border border-white/15 bg-black/35 px-3 py-2 text-sm text-white"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Details / rules"
            rows={3}
            className="w-full rounded border border-white/15 bg-black/35 px-3 py-2 text-sm text-white"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[11px] text-white/70">
              Starts
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="mt-1 w-full rounded border border-white/15 bg-black/35 px-2 py-1.5 text-xs text-white"
              />
            </label>
            <label className="text-[11px] text-white/70">
              Ends
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="mt-1 w-full rounded border border-white/15 bg-black/35 px-2 py-1.5 text-xs text-white"
              />
            </label>
          </div>
          <label className="block text-[11px] text-white/70">
            Banner image (optional)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setBannerFile(e.target.files?.[0] || null)}
              className="mt-1 block w-full text-xs"
            />
          </label>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-white/80">Prize criteria</div>
            {criteria.map((c, idx) => {
              const meta = CRITERION_OPTIONS.find((o) => o.type === c.type);
              return (
                <div key={idx} className="flex flex-wrap items-end gap-2 rounded border border-white/10 bg-black/20 p-2">
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

          <button
            type="button"
            disabled={saving}
            onClick={createEvent}
            className="rounded-lg bg-amber-600/90 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
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
