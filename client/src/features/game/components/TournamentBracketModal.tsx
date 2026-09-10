import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/services/lib/api';
import TournamentBracketTree, {
  type BracketMatch
} from '@/features/league/components/TournamentBracketTree';
import TournamentDoubleBracket from '@/features/league/components/TournamentDoubleBracket';
import { shortRoundLabel } from '@/features/league/utils/tournamentGame';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  leagueId: string;
  tournamentId: string;
  currentGameId?: string;
  currentUserId?: string;
};

export default function TournamentBracketModal({
  isOpen,
  onClose,
  leagueId,
  tournamentId,
  currentGameId,
  currentUserId = ''
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [eliminationType, setEliminationType] = useState('SINGLE');
  const [matches, setMatches] = useState<BracketMatch[]>([]);
  const [teamLabels, setTeamLabels] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!leagueId || !tournamentId) return;
    try {
      setError(null);
      const res = await api.get(`/api/leagues/${leagueId}/tournaments/${tournamentId}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load bracket');
      setName(data.name || 'Tournament');
      setEliminationType(data.eliminationType || 'SINGLE');
      setMatches(Array.isArray(data.matches) ? data.matches : []);
      setTeamLabels(data.teamLabels || {});
    } catch (e: any) {
      setError(e.message || 'Failed to load bracket');
    } finally {
      setLoading(false);
    }
  }, [leagueId, tournamentId]);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    load();
    const t = window.setInterval(() => load().catch(() => undefined), 8000);
    return () => window.clearInterval(t);
  }, [isOpen, load]);

  const getTeamName = useCallback(
    (teamId: string | null) => {
      if (!teamId) return 'TBD';
      return teamLabels[teamId] || teamId.replace(/^team_/, '').slice(0, 12);
    },
    [teamLabels]
  );

  const isDouble = useMemo(() => {
    if (String(eliminationType).toUpperCase() === 'DOUBLE') return true;
    return matches.length > 0 && matches.every((m) => m.round >= 100);
  }, [eliminationType, matches]);

  const currentMatch = matches.find((m) => m.gameId === currentGameId);
  const noop = () => undefined;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-2 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-950/95 shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <div>
            <h3 className="text-base font-semibold text-white">{name} — Live bracket</h3>
            {currentMatch && (
              <p className="text-xs text-cyan-200/90">
                Your match: {shortRoundLabel(currentMatch.round)} · M{currentMatch.matchNumber}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {loading && <p className="text-sm text-white/70">Loading bracket…</p>}
          {error && (
            <p className="rounded border border-rose-400/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-100">
              {error}
            </p>
          )}
          {!loading && !error && matches.length === 0 && (
            <p className="text-sm text-white/60">Bracket not ready yet.</p>
          )}
          {!loading && matches.length > 0 && (
            <div className="overflow-x-auto">
              {isDouble ? (
                <TournamentDoubleBracket
                  matches={matches}
                  getTeamName={getTeamName}
                  currentUserId={currentUserId}
                  live
                  isAdmin={false}
                  isTimedOut={false}
                  saving={false}
                  onReady={noop}
                  onOpenTable={noop}
                  onForceOpen={noop}
                />
              ) : (
                <TournamentBracketTree
                  matches={matches}
                  getTeamName={getTeamName}
                  currentUserId={currentUserId}
                  live
                  isAdmin={false}
                  isTimedOut={false}
                  saving={false}
                  onReady={noop}
                  onOpenTable={noop}
                  onForceOpen={noop}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
