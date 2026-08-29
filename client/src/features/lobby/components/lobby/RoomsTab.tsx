import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/lib/api';

export type LeagueRoomSummary = {
  id: string;
  name: string;
  slug: string;
  bgColor: string;
  logoUrl: string | null;
  requireJoinApproval?: boolean;
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
  const [pendingCreateRequest, setPendingCreateRequest] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createLogo, setCreateLogo] = useState<File | null>(null);
  const [createBgColor, setCreateBgColor] = useState('#0f172a');
  const [requireJoinApproval, setRequireJoinApproval] = useState(true);
  const [submittingCreate, setSubmittingCreate] = useState(false);

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
      setPendingCreateRequest(data.pendingCreateRequest || null);
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
      const res = await api.post(`/api/leagues/${leagueId}/join-requests`, {});
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to request join');
      if (data.instantJoin) {
        navigate(`/league/${leagueId}`);
        return;
      }
      await loadLeagues();
    } catch (e: any) {
      setError(e?.message || 'Failed to request join');
    } finally {
      setRequestingId(null);
    }
  };

  const submitCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    setSubmittingCreate(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('name', createName.trim());
      form.append('bgColor', createBgColor);
      form.append('requireJoinApproval', requireJoinApproval ? 'true' : 'false');
      if (createLogo) form.append('logo', createLogo);

      const token = localStorage.getItem('sessionToken');
      const apiBase = import.meta.env.VITE_API_URL ||
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          ? 'http://localhost:3000'
          : 'https://bux-spades-server.fly.dev');
      const res = await fetch(`${apiBase}/api/leagues/create-requests`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to submit request');
      setShowCreateModal(false);
      setCreateName('');
      setCreateLogo(null);
      setCreateBgColor('#0f172a');
      setRequireJoinApproval(true);
      await loadLeagues();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmittingCreate(false);
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
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs text-slate-400">League rooms</span>
        <button
          type="button"
          disabled={Boolean(pendingCreateRequest)}
          onClick={() => setShowCreateModal(true)}
          className="rounded-lg bg-gradient-to-r from-cyan-500 to-teal-600 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
          title={pendingCreateRequest ? 'You already have a pending create request' : 'Create a league'}
        >
          {pendingCreateRequest ? 'Create pending…' : 'Create league'}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-rose-200 text-xs">
          {error}
        </div>
      )}
      {pendingCreateRequest && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-amber-100 text-xs">
          Create request pending for “{pendingCreateRequest.name}” — waiting for site admin approval.
        </div>
      )}
      {leagues.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm text-center p-4">
          No league rooms yet. Request one to get started.
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
                {league.requireJoinApproval === false ? ' · open join' : ' · approval'}
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
                title={league.requireJoinApproval === false ? 'Join league' : 'Request to join'}
              >
                {requestingId === league.id
                  ? '…'
                  : league.requireJoinApproval === false
                    ? 'Join'
                    : '🔒 Request'}
              </button>
            )}
          </div>
        ))
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <form
            onSubmit={submitCreateRequest}
            className="w-full max-w-md space-y-3 rounded-xl border border-white/10 bg-slate-950 p-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Create a league</h3>
              <button type="button" className="text-slate-400 hover:text-white" onClick={() => setShowCreateModal(false)}>
                ✕
              </button>
            </div>
            <label className="block text-sm text-slate-300">
              League name
              <input
                required
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-white"
                placeholder="e.g. Friday Night Spades"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Logo (optional)
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setCreateLogo(e.target.files?.[0] || null)}
                className="mt-1 block w-full text-xs text-slate-400"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Colour theme
              <div className="mt-1 flex items-center gap-3">
                <input
                  type="color"
                  value={createBgColor}
                  onChange={(e) => setCreateBgColor(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border border-white/10 bg-transparent"
                />
                <span className="text-xs text-slate-400">
                  Used for the league page background, header, and chat panel
                </span>
              </div>
              <div
                className="mt-2 h-8 rounded-lg border border-white/10"
                style={{ background: `linear-gradient(90deg, ${createBgColor}, #020617)` }}
              />
            </label>
            <fieldset className="space-y-2 text-sm text-slate-300">
              <legend className="mb-1">Join approval</legend>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="joinApproval"
                  checked={requireJoinApproval}
                  onChange={() => setRequireJoinApproval(true)}
                />
                On — admins must approve each join request
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="joinApproval"
                  checked={!requireJoinApproval}
                  onChange={() => setRequireJoinApproval(false)}
                />
                Off — players can join instantly
              </label>
            </fieldset>
            <p className="text-xs text-slate-500">
              A site admin must approve this create request before the league goes live.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowCreateModal(false)} className="rounded-lg px-3 py-2 text-sm text-slate-300 hover:bg-white/5">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingCreate || !createName.trim()}
                className="rounded-lg bg-cyan-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submittingCreate ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default RoomsTab;
