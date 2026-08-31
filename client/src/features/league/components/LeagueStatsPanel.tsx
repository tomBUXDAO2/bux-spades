import React, { useCallback, useEffect, useState } from 'react';
import { api } from '@/services/lib/api';

type StandingRow = {
  user: { id: string; username: string; avatarUrl?: string | null };
  role: string;
  played: number;
  won: number;
  lost: number;
  winRate: number;
  bags: number;
  bagsPerGame: number;
  nilsBid: number;
  nilsMade: number;
  nilRate: number;
};

type SortKey = 'played' | 'won' | 'lost' | 'winRate' | 'bags' | 'nilRate';

type Props = {
  leagueId: string;
  theme: string;
  onOpenPlayer?: (user: { id: string; username: string; avatarUrl?: string | null }) => void;
};

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'played', label: 'Played' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
  { key: 'winRate', label: 'Win %' },
  { key: 'bags', label: 'Bags' },
  { key: 'nilRate', label: 'Nil %' }
];

const LeagueStatsPanel: React.FC<Props> = ({ leagueId, theme, onOpenPlayer }) => {
  const [rows, setRows] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState('ALL');
  const [format, setFormat] = useState('ALL');
  const [sortBy, setSortBy] = useState<SortKey>('winRate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        mode,
        format,
        sortBy,
        sortDir,
        minGames: '0',
        ...(search ? { search } : {})
      });
      const res = await api.get(`/api/leagues/${leagueId}/stats?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load stats');
      setRows(Array.isArray(data.standings) ? data.standings : []);
    } catch (e: any) {
      setError(e.message || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, [leagueId, mode, format, sortBy, sortDir, search]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(key);
      setSortDir('desc');
    }
  };

  return (
    <div className="space-y-3">
      <div
        className="flex flex-wrap items-end gap-2 rounded-xl border border-white/15 p-3 backdrop-blur"
        style={{ backgroundColor: `${theme}99` }}
      >
        <label className="text-[11px] text-white/70">
          Game type
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="mt-1 block rounded border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white"
          >
            <option value="ALL">All</option>
            <option value="PARTNERS">Partners</option>
            <option value="SOLO">Solo</option>
          </select>
        </label>
        <label className="text-[11px] text-white/70">
          Format
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="mt-1 block rounded border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white"
          >
            <option value="ALL">All</option>
            <option value="REGULAR">Regular</option>
            <option value="WHIZ">Whiz</option>
            <option value="MIRROR">Mirror</option>
            <option value="GIMMICK">Gimmick</option>
          </select>
        </label>
        <label className="min-w-[10rem] flex-1 text-[11px] text-white/70">
          Search player
          <div className="mt-1 flex gap-1">
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setSearch(searchInput.trim());
              }}
              placeholder="Name…"
              className="w-full rounded border border-white/15 bg-black/40 px-2 py-1.5 text-xs text-white placeholder:text-white/40"
            />
            <button
              type="button"
              onClick={() => setSearch(searchInput.trim())}
              className="rounded bg-white/15 px-2 py-1 text-xs font-semibold text-white hover:bg-white/25"
            >
              Go
            </button>
          </div>
        </label>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-100">
          {error}
        </div>
      )}

      <div
        className="overflow-x-auto rounded-xl border border-white/15 backdrop-blur"
        style={{ backgroundColor: `${theme}99` }}
      >
        <table className="w-full min-w-[36rem] border-collapse text-left text-xs sm:text-sm">
          <thead>
            <tr className="border-b border-white/15 text-[11px] uppercase tracking-wide text-white/60">
              <th className="px-3 py-2 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">Player</th>
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-2 py-2 font-semibold">
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={`inline-flex items-center gap-0.5 hover:text-white ${
                      sortBy === col.key ? 'text-cyan-200' : ''
                    }`}
                  >
                    {col.label}
                    {sortBy === col.key ? (sortDir === 'desc' ? '↓' : '↑') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-white/60">
                  Loading league stats…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-white/60">
                  No matching players yet.
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={row.user.id} className="border-b border-white/10 hover:bg-white/5">
                  <td className="px-3 py-2 text-white/50">{i + 1}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="flex max-w-[12rem] items-center gap-2 text-left hover:underline"
                      onClick={() => onOpenPlayer?.(row.user)}
                    >
                      <img
                        src={row.user.avatarUrl || '/default-pfp.jpg'}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/default-pfp.jpg';
                        }}
                      />
                      <span className="truncate font-medium text-white">{row.user.username}</span>
                    </button>
                  </td>
                  <td className="px-2 py-2 tabular-nums">{row.played}</td>
                  <td className="px-2 py-2 tabular-nums text-emerald-300">{row.won}</td>
                  <td className="px-2 py-2 tabular-nums text-rose-300">{row.lost}</td>
                  <td className="px-2 py-2 tabular-nums">{row.winRate.toFixed(1)}</td>
                  <td className="px-2 py-2 tabular-nums">{row.bags}</td>
                  <td className="px-2 py-2 tabular-nums">{row.nilRate.toFixed(0)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default LeagueStatsPanel;
