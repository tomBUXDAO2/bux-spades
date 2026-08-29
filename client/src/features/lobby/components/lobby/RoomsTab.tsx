import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/lib/api';

export type LeagueRoomSummary = {
  id: string;
  name: string;
  slug: string;
  bgColor: string;
  logoUrl: string | null;
  memberCount: number;
  isMember: boolean;
  role: string | null;
  pendingRequest: boolean;
  owner?: { id: string; username: string; avatarUrl?: string | null };
};

interface RoomsTabProps {
  user: any | null;
  textScale?: number;
}

const RoomsTab: React.FC<RoomsTabProps> = ({ user, textScale = 1 }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [requiresFacebook, setRequiresFacebook] = useState(false);
  const [leagues, setLeagues] = useState<LeagueRoomSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);

  const loadLeagues = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/api/leagues');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load rooms');
      setRequiresFacebook(Boolean(data.requiresFacebook));
      setLeagues(data.leagues || []);
    } catch (e: any) {
      setError(e?.message || 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadLeagues();
  }, [loadLeagues]);

  const requestJoin = async (leagueId: string) => {
    setRequestingId(leagueId);
    try {
      await api.post(`/api/leagues/${leagueId}/join-requests`, {});
      await loadLeagues();
    } catch (e: any) {
      setError(e?.message || 'Failed to request join');
    } finally {
      setRequestingId(null);
    }
  };

  if (!user) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm p-4 text-center">
        Sign in to browse league rooms.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        Loading rooms…
      </div>
    );
  }

  if (requiresFacebook || !user.facebookId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 text-center">
        <p className="text-slate-200 font-medium" style={{ fontSize: `${15 * textScale}px` }}>
          Private leagues require Facebook login
        </p>
        <p className="text-slate-400 text-sm" style={{ fontSize: `${13 * textScale}px` }}>
          League owners verify real players via Facebook. Sign out and continue with Facebook, or use a Facebook account, to request access.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto flex flex-col gap-2">
      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-rose-200 text-xs">
          {error}
        </div>
      )}
      {leagues.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm text-center p-4">
          No league rooms yet. Ask a site admin to create one.
        </div>
      ) : (
        leagues.map((league) => (
          <div
            key={league.id}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/60 px-3 py-2"
          >
            <div
              className="h-10 w-10 rounded-lg flex-shrink-0 overflow-hidden border border-white/10"
              style={{ backgroundColor: league.bgColor || '#0f172a' }}
            >
              {league.logoUrl ? (
                <img src={league.logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-white/70 text-xs font-bold">
                  {league.name.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-white font-medium truncate" style={{ fontSize: `${14 * textScale}px` }}>
                {league.name}
              </div>
              <div className="text-slate-400 text-xs">
                {league.memberCount} member{league.memberCount === 1 ? '' : 's'}
                {league.role ? ` · ${league.role}` : ''}
              </div>
            </div>
            {league.isMember ? (
              <button
                type="button"
                className="lobby-button rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 px-3 py-1.5 text-xs font-semibold text-white"
                onClick={() => navigate(`/league/${league.id}`)}
              >
                Enter
              </button>
            ) : league.pendingRequest ? (
              <span className="text-xs text-amber-300/90 px-2">Pending</span>
            ) : (
              <button
                type="button"
                disabled={requestingId === league.id}
                className="lobby-button rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:bg-white/10 disabled:opacity-50"
                onClick={() => requestJoin(league.id)}
                title="Request to join (locked until approved)"
              >
                {requestingId === league.id ? '…' : '🔒 Request'}
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
};

export default RoomsTab;
