import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/services/lib/api';

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
  onOpenTable: (gameId: string) => void;
};

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
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'PARTNERS' | 'SOLO'>('PARTNERS');
  const [format, setFormat] = useState('REGULAR');
  const [eliminationType, setEliminationType] = useState('SINGLE');
  const [startTime, setStartTime] = useState('');
  const [firstPlaceCoins, setFirstPlaceCoins] = useState('5000000');
  const [secondPlaceCoins, setSecondPlaceCoins] = useState('2000000');

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

  const myReg = useMemo(
    () => detail?.registrations?.find((r) => r.userId === currentUserId),
    [detail, currentUserId]
  );

  const partnerOptions = useMemo(
    () => members.filter((m) => m.userId !== currentUserId),
    [members, currentUserId]
  );

  const post = async (path: string, body?: object) => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.post(path, body || {});
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setDetail(data);
      await loadList();
      return data;
    } catch (e: any) {
      setError(e.message || 'Request failed');
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const createTournament = async () => {
    if (!name.trim() || !startTime) {
      setError('Name and start time are required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await api.post(`/api/leagues/${leagueId}/tournaments`, {
        name: name.trim(),
        mode,
        format,
        eliminationType,
        startTime: new Date(startTime).toISOString(),
        firstPlaceCoins: Math.floor(Number(firstPlaceCoins) || 0),
        secondPlaceCoins: Math.floor(Number(secondPlaceCoins) || 0)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      setShowCreate(false);
      setName('');
      setStartTime('');
      await loadList();
      setSelectedId(data.id);
    } catch (e: any) {
      setError(e.message || 'Failed to create');
    } finally {
      setSaving(false);
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
                  Prizes: {Number(detail.prizes.firstPlaceCoins || 0).toLocaleString()} /{' '}
                  {Number(detail.prizes.secondPlaceCoins || 0).toLocaleString()} coins
                </p>
              )}
            </div>
            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                {open && (
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
                    onClick={() => {
                      if (window.confirm('Cancel this tournament?')) {
                        post(`/api/leagues/${leagueId}/tournaments/${detail.id}/cancel`);
                      }
                    }}
                    className="rounded-lg bg-rose-700/80 px-3 py-2 text-xs font-semibold text-white"
                  >
                    Cancel
                  </button>
                )}
              </div>
            )}
          </div>

          {detail.registrationStats && (
            <p className="mt-2 text-xs text-white/65">
              {detail.registrationStats.totalRegistrations} registered ·{' '}
              {detail.registrationStats.completeTeams} complete teams ·{' '}
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
                  <label className="block text-xs text-white/70">
                    Partner (optional)
                    <select
                      value={partnerId}
                      onChange={(e) => setPartnerId(e.target.value)}
                      className="mt-1 block w-48 rounded border border-white/20 bg-black/40 px-2 py-1.5 text-xs text-white"
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
            {(detail.registrations || []).length === 0 && (
              <li className="text-white/50">No registrations yet.</li>
            )}
            {(detail.registrations || []).map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {r.user.username}
                  {r.partner ? ` + ${r.partner.username}` : r.isSub ? ' (sub)' : ' (solo)'}
                </span>
                {isAdmin && open && !r.partnerId && !r.isSub && detail.mode === 'PARTNERS' && (
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
                )}
              </li>
            ))}
          </ul>
        </div>

        {(closed || live || detail.status === 'COMPLETED') && (
          <div
            className="rounded-xl border border-white/15 p-4 backdrop-blur"
            style={{ backgroundColor: `${theme}99` }}
          >
            <h4 className="mb-2 text-sm font-semibold text-white">Bracket / matches</h4>
            {(detail.matches || []).length === 0 ? (
              <p className="text-xs text-white/60">No matches yet.</p>
            ) : (
              <ul className="space-y-2">
                {(detail.matches || []).map((m) => {
                  const inMatch = (m.players || []).some((p) => p.id === currentUserId);
                  const amReady = (m.ready?.ready || []).includes(currentUserId);
                  const readyCount = m.ready?.ready?.length || 0;
                  const need = (m.players || []).length || 4;
                  return (
                    <li
                      key={m.id}
                      className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/85"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">
                          {roundLabel(m.round)} · Match {m.matchNumber} · {m.status}
                          {m.gameId ? ' · table open' : ''}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {live && inMatch && !m.gameId && m.status === 'PENDING' && (
                            <button
                              type="button"
                              disabled={saving || amReady || isTimedOut}
                              onClick={() =>
                                post(
                                  `/api/leagues/${leagueId}/tournaments/${detail.id}/matches/${m.id}/ready`
                                )
                              }
                              className="rounded-lg bg-emerald-600/90 px-2.5 py-1 font-semibold text-white disabled:opacity-40"
                            >
                              {amReady ? 'Ready ✓' : 'Ready'}
                            </button>
                          )}
                          {m.gameId && (
                            <button
                              type="button"
                              onClick={() => onOpenTable(m.gameId!)}
                              className="rounded-lg bg-cyan-700/90 px-2.5 py-1 font-semibold text-white"
                            >
                              Open table
                            </button>
                          )}
                          {isAdmin && live && !m.gameId && m.team1Id && m.team2Id && (
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() =>
                                post(
                                  `/api/leagues/${leagueId}/tournaments/${detail.id}/matches/${m.id}/open-table`
                                )
                              }
                              className="rounded-lg bg-white/15 px-2.5 py-1 font-semibold text-white"
                            >
                              Force open table
                            </button>
                          )}
                        </div>
                      </div>
                      {live && !m.gameId && m.status === 'PENDING' && m.team1Id && m.team2Id && (
                        <p className="mt-1 text-white/55">
                          Roll call {readyCount}/{need}
                          {typeof m.ready?.timeRemaining === 'number'
                            ? ` · ${Math.max(0, m.ready.timeRemaining)}s left`
                            : ''}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
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
          className="space-y-3 rounded-xl border border-white/15 p-4 backdrop-blur"
          style={{ backgroundColor: `${theme}99` }}
        >
          <label className="block text-xs text-white/70">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-sm text-white"
            />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs text-white/70">
              Mode
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as 'PARTNERS' | 'SOLO')}
                className="mt-1 w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-sm text-white"
              >
                <option value="PARTNERS">Partners</option>
                <option value="SOLO">Solo</option>
              </select>
            </label>
            <label className="block text-xs text-white/70">
              Format
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="mt-1 w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-sm text-white"
              >
                <option value="REGULAR">Regular</option>
                <option value="WHIZ">Whiz</option>
                <option value="MIRROR">Mirror</option>
                <option value="GIMMICK">Gimmick</option>
              </select>
            </label>
            <label className="block text-xs text-white/70">
              Elimination
              <select
                value={eliminationType}
                onChange={(e) => setEliminationType(e.target.value)}
                className="mt-1 w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-sm text-white"
              >
                <option value="SINGLE">Single</option>
                <option value="DOUBLE">Double</option>
              </select>
            </label>
            <label className="block text-xs text-white/70">
              Start (local)
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="mt-1 w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-white/70">
              1st prize coins
              <input
                type="number"
                min={0}
                value={firstPlaceCoins}
                onChange={(e) => setFirstPlaceCoins(e.target.value)}
                className="mt-1 w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-sm text-white"
              />
            </label>
            <label className="block text-xs text-white/70">
              2nd prize coins
              <input
                type="number"
                min={0}
                value={secondPlaceCoins}
                onChange={(e) => setSecondPlaceCoins(e.target.value)}
                className="mt-1 w-full rounded border border-white/20 bg-black/40 px-2 py-1.5 text-sm text-white"
              />
            </label>
          </div>
          <p className="text-[11px] text-white/55">
            Registration auto-closes at T-10. Leftover solo entries are randomly paired; odd
            player can be marked sub. Admin starts roll call; all Ready opens the match table.
            Credit prizes from the league wallet.
          </p>
          <button
            type="button"
            disabled={saving}
            onClick={createTournament}
            className="rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            style={{ background: `linear-gradient(90deg, ${theme}, #0e7490)` }}
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
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
