import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { isAdmin } from '@/utils/adminUtils';
import { api } from '@/services/lib/api';

/**
 * Site-admin tool: create leagues directly, and approve player create-requests.
 */
const AdminCreateLeaguePage: React.FC = () => {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [ownerFacebookId, setOwnerFacebookId] = useState('');
  const [bgColor, setBgColor] = useState('#0f172a');
  const [requireJoinApproval, setRequireJoinApproval] = useState(true);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createRequests, setCreateRequests] = useState<any[]>([]);

  const loadRequests = useCallback(async () => {
    try {
      const res = await api.get('/api/admin/leagues/create-requests');
      if (res.ok) setCreateRequests(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (user && isAdmin(user.discordId)) loadRequests();
  }, [user, loadRequests]);

  if (!user || !isAdmin(user.discordId)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-950 text-white p-6">
        <p>Admin access required</p>
        <Link to="/" className="text-cyan-400">Back</Link>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await api.post('/api/admin/leagues', {
        name,
        ownerUserId: ownerUserId || undefined,
        ownerFacebookId: ownerFacebookId || undefined,
        bgColor,
        requireJoinApproval
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setResult(data);
      setName('');
      setOwnerUserId('');
      setOwnerFacebookId('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const approve = async (id: string) => {
    await api.post(`/api/admin/leagues/create-requests/${id}/approve`, {});
    await loadRequests();
  };

  const reject = async (id: string) => {
    await api.post(`/api/admin/leagues/create-requests/${id}/reject`, {});
    await loadRequests();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-lg space-y-6">
        <Link to="/" className="text-sm text-cyan-400 hover:underline">← Lobby</Link>
        <h1 className="text-2xl font-semibold">League admin</h1>

        <section className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-4">
          <h2 className="font-medium">Pending create requests</h2>
          {createRequests.length === 0 ? (
            <p className="text-sm text-slate-400">None</p>
          ) : (
            createRequests.map((r) => (
              <div key={r.id} className="rounded-lg border border-white/10 p-3 text-sm space-y-2">
                <div className="font-medium">{r.name}</div>
                <div className="text-slate-400 text-xs">
                  by {r.requester?.username}
                  {r.requireJoinApproval === false ? ' · open join' : ' · join approval on'}
                </div>
                {r.bgColor && (
                  <div className="h-4 w-full rounded border border-white/10" style={{ background: r.bgColor }} />
                )}
                {r.facebookProfileUrl && (
                  <a href={r.facebookProfileUrl} target="_blank" rel="noreferrer" className="text-xs text-cyan-400 hover:underline">
                    Facebook profile
                  </a>
                )}
                {r.logoUrl && <img src={r.logoUrl} alt="" className="h-12 w-12 rounded object-cover" />}
                <div className="flex gap-2">
                  <button type="button" onClick={() => approve(r.id)} className="rounded bg-emerald-600 px-2 py-1 text-xs">Approve</button>
                  <button type="button" onClick={() => reject(r.id)} className="rounded bg-rose-700 px-2 py-1 text-xs">Reject</button>
                </div>
              </div>
            ))
          )}
        </section>

        <section>
          <h2 className="mb-2 font-medium">Create league directly</h2>
          <p className="text-sm text-slate-400 mb-3">
            Owner must already have logged in with Facebook.
          </p>
          <form onSubmit={submit} className="space-y-3 rounded-xl border border-white/10 bg-slate-900/60 p-4">
            <label className="block text-sm">
              League name
              <input required value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-3 py-2" />
            </label>
            <label className="block text-sm">
              Owner user id
              <input value={ownerUserId} onChange={(e) => setOwnerUserId(e.target.value)} className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-3 py-2" placeholder="cuid…" />
            </label>
            <label className="block text-sm">
              Or owner Facebook id
              <input value={ownerFacebookId} onChange={(e) => setOwnerFacebookId(e.target.value)} className="mt-1 w-full rounded border border-white/10 bg-slate-950 px-3 py-2" />
            </label>
            <label className="block text-sm">
              Background color
              <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="mt-1 h-10 w-full" />
            </label>
            <fieldset className="text-sm space-y-1">
              <legend>Join approval</legend>
              <label className="flex gap-2 items-center">
                <input type="radio" checked={requireJoinApproval} onChange={() => setRequireJoinApproval(true)} /> On
              </label>
              <label className="flex gap-2 items-center">
                <input type="radio" checked={!requireJoinApproval} onChange={() => setRequireJoinApproval(false)} /> Off (instant join)
              </label>
            </fieldset>
            {error && <p className="text-sm text-rose-400">{error}</p>}
            {result && (
              <p className="text-sm text-emerald-400">
                Created “{result.name}” ({result.id}). Owner can open it from Rooms.
              </p>
            )}
            <button type="submit" disabled={busy} className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold disabled:opacity-50">
              {busy ? 'Creating…' : 'Create league'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default AdminCreateLeaguePage;
