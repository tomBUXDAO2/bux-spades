import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { isAdmin } from '@/utils/adminUtils';
import { api } from '@/services/lib/api';

/**
 * Site-admin tool: create a private Facebook league and assign an owner
 * who has already logged in with Facebook (by user id or facebookId).
 */
const AdminCreateLeaguePage: React.FC = () => {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [ownerUserId, setOwnerUserId] = useState('');
  const [ownerFacebookId, setOwnerFacebookId] = useState('');
  const [bgColor, setBgColor] = useState('#0f172a');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        bgColor
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

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-lg space-y-4">
        <Link to="/" className="text-sm text-cyan-400 hover:underline">← Lobby</Link>
        <h1 className="text-2xl font-semibold">Create Facebook league</h1>
        <p className="text-sm text-slate-400">
          Owner must already have logged in with Facebook. Provide either their BUX user id or Facebook id.
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
      </div>
    </div>
  );
};

export default AdminCreateLeaguePage;
