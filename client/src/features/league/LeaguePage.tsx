import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/features/auth/AuthContext';
import { useSocket } from '@/features/auth/SocketContext';
import { api, apiFetch } from '@/services/lib/api';
import CreateGameModal from '@/components/game/CreateGameModal';
import PlayerStatsModal from '@/components/modals/PlayerStatsModal';
import GameTile from '@/components/game/GameTile';

type LeagueInfo = {
  id: string;
  name: string;
  slug: string;
  bgColor: string;
  logoUrl: string | null;
  isMember: boolean;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | null;
  mutedUntil?: string | null;
  timeoutUntil?: string | null;
  memberCount: number;
};

type ChatMessage = {
  id?: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  message: string;
  timestamp: number;
};

type JoinRequest = {
  id: string;
  user: { id: string; username: string; avatarUrl?: string | null; facebookId?: string | null };
  facebookProfileUrl?: string | null;
};

type LeagueMember = {
  id: string;
  userId: string;
  role: string;
  mutedUntil?: string | null;
  timeoutUntil?: string | null;
  user: { id: string; username: string; avatarUrl?: string | null; facebookId?: string | null };
};

const LeaguePage: React.FC = () => {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket } = useSocket();

  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [games, setGames] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [sideTab, setSideTab] = useState<'chat' | 'members'>('chat');
  const [adminTab, setAdminTab] = useState<'requests' | 'moderation' | 'theme'>('requests');
  const [themeName, setThemeName] = useState('');
  const [themeColor, setThemeColor] = useState('#0f172a');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [savingTheme, setSavingTheme] = useState(false);
  const [playerStats, setPlayerStats] = useState<{ open: boolean; player: any }>({ open: false, player: null });
  const chatEndRef = useRef<HTMLDivElement>(null);

  const isAdmin = league?.role === 'OWNER' || league?.role === 'ADMIN';
  const isOwner = league?.role === 'OWNER';
  const isMuted = Boolean(league?.mutedUntil && new Date(league.mutedUntil) > new Date());
  const isTimedOut = Boolean(league?.timeoutUntil && new Date(league.timeoutUntil) > new Date());
  const theme = league?.bgColor || '#0f172a';

  const loadLeague = useCallback(async () => {
    if (!leagueId) return;
    const res = await api.get(`/api/leagues/${leagueId}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Failed to load league');
    }
    const data = await res.json();
    setLeague(data);
    setThemeName(data.name || '');
    setThemeColor(data.bgColor || '#0f172a');
    return data as LeagueInfo;
  }, [leagueId]);

  const loadGames = useCallback(async () => {
    if (!leagueId) return;
    const res = await api.get(`/api/games?leagueId=${encodeURIComponent(leagueId)}`);
    if (!res.ok) return;
    const data = await res.json();
    setGames(Array.isArray(data) ? data : []);
  }, [leagueId]);

  const loadChat = useCallback(async () => {
    if (!leagueId) return;
    const res = await api.get(`/api/leagues/${leagueId}/chat`);
    if (!res.ok) return;
    const data = await res.json();
    setChatMessages(Array.isArray(data) ? data : []);
  }, [leagueId]);

  const loadMembers = useCallback(async () => {
    if (!leagueId) return;
    const memRes = await api.get(`/api/leagues/${leagueId}/members`);
    if (memRes.ok) setMembers(await memRes.json());
  }, [leagueId]);

  const loadAdminData = useCallback(async () => {
    if (!leagueId || !isAdmin) return;
    const reqRes = await api.get(`/api/leagues/${leagueId}/join-requests`);
    if (reqRes.ok) setJoinRequests(await reqRes.json());
    await loadMembers();
  }, [leagueId, isAdmin, loadMembers]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const info = await loadLeague();
        if (cancelled) return;
        if (!info?.isMember) {
          setError('You are not a member of this league');
          setLoading(false);
          return;
        }
        await Promise.all([loadGames(), loadChat(), loadMembers()]);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load league');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadLeague, loadGames, loadChat, loadMembers]);

  useEffect(() => {
    if (isAdmin) loadAdminData();
  }, [isAdmin, loadAdminData]);

  useEffect(() => {
    if (!socket || !leagueId || !league?.isMember) return;
    socket.emit('join_league_room', { leagueId });
    const onMessage = (msg: ChatMessage) => {
      if ((msg as any).leagueId && (msg as any).leagueId !== leagueId) return;
      setChatMessages((prev) => [...prev, msg]);
    };
    const onMembership = () => {
      loadLeague();
      loadMembers();
      if (isAdmin) loadAdminData();
    };
    socket.on('league_chat_message', onMessage);
    socket.on('league_membership_updated', onMembership);
    socket.on('league_join_request', () => loadAdminData());
    const interval = setInterval(loadGames, 8000);
    return () => {
      socket.emit('leave_league_room', { leagueId });
      socket.off('league_chat_message', onMessage);
      socket.off('league_membership_updated', onMembership);
      socket.off('league_join_request');
      clearInterval(interval);
    };
  }, [socket, leagueId, league?.isMember, isAdmin, loadGames, loadLeague, loadMembers, loadAdminData]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!socket || !leagueId || !newMessage.trim() || isMuted) return;
    socket.emit('league_message', { leagueId, message: newMessage.trim() });
    setNewMessage('');
  };

  const handleCreateGame = async (settings: any) => {
    if (!user || !leagueId) return;
    const serverSettings = {
      mode: settings.gameMode,
      biddingOption: settings.biddingOption,
      minPoints: settings.minPoints,
      maxPoints: settings.maxPoints,
      buyIn: settings.buyIn,
      allowNil: settings.specialRules?.allowNil ?? true,
      allowBlindNil: settings.specialRules?.allowBlindNil ?? false,
      specialRules: settings.specialRules,
      leagueId,
      creatorId: user.id,
      creatorName: user.username,
      creatorImage: user.avatarUrl || user.avatar
    };
    const res = await api.post('/api/games', serverSettings);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || data.error || 'Failed to create game');
    }
    const game = await res.json();
    setIsCreateOpen(false);
    await loadGames();
    if (game?.id) navigate(`/table/${game.id}`);
  };

  const joinGame = async (gameId: string, seat?: number) => {
    if (!user) return;
    const res = await api.post(`/api/games/${gameId}/join`, {
      id: user.id,
      username: user.username,
      avatar: user.avatarUrl || user.avatar,
      seat
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Failed to join');
      return;
    }
    navigate(`/table/${gameId}`);
  };

  const saveTheme = async () => {
    if (!leagueId) return;
    setSavingTheme(true);
    try {
      const form = new FormData();
      form.append('name', themeName);
      form.append('bgColor', themeColor);
      if (logoFile) form.append('logo', logoFile);
      const token = localStorage.getItem('sessionToken');
      const apiBase = import.meta.env.VITE_API_URL ||
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          ? 'http://localhost:3000'
          : 'https://bux-spades-server.fly.dev');
      const res = await fetch(`${apiBase}/api/leagues/${leagueId}/theme`, {
        method: 'PATCH',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save theme');
      }
      await loadLeague();
      setLogoFile(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingTheme(false);
    }
  };

  const moderate = async (
    userId: string,
    action: 'mute' | 'unmute' | 'timeout' | 'clear-timeout' | 'kick' | 'role',
    extra?: any
  ) => {
    if (!leagueId) return;
    if (action === 'role') {
      const res = await apiFetch(`/api/leagues/${leagueId}/members/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role: extra.role })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to update role');
        return;
      }
    } else {
      const res = await api.post(`/api/leagues/${leagueId}/members/${userId}/${action}`, extra || {});
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Moderation action failed');
        return;
      }
    }
    await loadAdminData();
    await loadLeague();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        Loading league…
      </div>
    );
  }

  if (error && !league?.isMember) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-950 text-white p-6">
        <p>{error}</p>
        <Link to="/" className="text-cyan-400 hover:underline">
          Back to lobby
        </Link>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen text-white"
      style={{
        background: `radial-gradient(1200px 600px at 10% -10%, ${theme}cc, transparent), linear-gradient(165deg, ${theme} 0%, #020617 55%)`
      }}
    >
      <header
        className="flex items-center gap-3 border-b border-white/10 px-4 py-3 backdrop-blur-md"
        style={{ backgroundColor: `${theme}dd` }}
      >
        <Link to="/" className="rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-sm text-white/90 hover:bg-black/30">
          ← Lobby
        </Link>
        {league?.logoUrl && (
          <img src={league.logoUrl} alt="" className="h-11 w-11 rounded-lg object-cover border border-white/25 shadow" />
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight truncate drop-shadow">{league?.name}</h1>
          <p className="text-xs text-white/80">
            {league?.memberCount} members · league room
            {isTimedOut ? ' · timed out from tables' : ''}
            {isMuted ? ' · muted in chat' : ''}
          </p>
        </div>
      </header>

      {error && (
        <div className="mx-4 mt-3 rounded-lg border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-sm text-rose-100">
          {error}
        </div>
      )}

      <main className="grid gap-4 p-4 lg:grid-cols-3 min-h-[calc(100vh-72px)]">
        <section className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold drop-shadow">Available Games</h2>
            <button
              type="button"
              disabled={isTimedOut}
              onClick={() => setIsCreateOpen(true)}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-40"
              style={{ background: `linear-gradient(90deg, ${theme}, #0e7490)` }}
            >
              Create Game
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {games.length === 0 ? (
              <p className="text-white/70 text-sm">No games in this league yet. Create one.</p>
            ) : (
              games.map((game) => (
                <GameTile
                  key={game.id}
                  game={game}
                  onJoinGame={(id, seat) => joinGame(id, seat)}
                  onWatchGame={(id) => navigate(`/table/${id}`)}
                  canJoinOrWatch={!isTimedOut}
                />
              ))
            )}
          </div>

          {isAdmin && (
            <div
              className="rounded-xl border border-white/15 p-3 backdrop-blur"
              style={{ backgroundColor: `${theme}99` }}
            >
              <div className="mb-3 flex gap-2 text-xs">
                {(['requests', 'moderation', ...(isOwner ? (['theme'] as const) : [])] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setAdminTab(tab)}
                    className={`rounded-md px-2 py-1 capitalize ${adminTab === tab ? 'bg-white/25 font-semibold' : 'bg-black/20'}`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {adminTab === 'requests' && (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {joinRequests.length === 0 && (
                    <p className="text-xs text-white/70">No pending join requests</p>
                  )}
                  {joinRequests.map((r) => (
                    <div key={r.id} className="rounded-lg border border-white/15 bg-black/20 p-2 text-sm">
                      <div className="font-medium">{r.user.username}</div>
                      {r.facebookProfileUrl && (
                        <a
                          href={r.facebookProfileUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-cyan-200 hover:underline"
                        >
                          View Facebook profile
                        </a>
                      )}
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          className="rounded bg-emerald-600 px-2 py-1 text-xs"
                          onClick={() =>
                            api.post(`/api/leagues/${leagueId}/join-requests/${r.id}/approve`, {}).then(loadAdminData)
                          }
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="rounded bg-rose-700 px-2 py-1 text-xs"
                          onClick={() =>
                            api.post(`/api/leagues/${leagueId}/join-requests/${r.id}/reject`, {}).then(loadAdminData)
                          }
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {adminTab === 'moderation' && (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {members.map((m) => (
                    <div key={m.id} className="rounded-lg border border-white/15 bg-black/20 p-2 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium">{m.user.username}</span>
                        <span className="text-xs text-white/70">{m.role}</span>
                      </div>
                      {m.role !== 'OWNER' && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          <button type="button" className="rounded bg-white/10 px-2 py-0.5 text-[10px]" onClick={() => moderate(m.userId, 'mute', { preset: '24h' })}>Mute 24h</button>
                          <button type="button" className="rounded bg-white/10 px-2 py-0.5 text-[10px]" onClick={() => moderate(m.userId, 'unmute')}>Unmute</button>
                          <button type="button" className="rounded bg-white/10 px-2 py-0.5 text-[10px]" onClick={() => moderate(m.userId, 'timeout', { preset: '1h' })}>Timeout 1h</button>
                          <button type="button" className="rounded bg-white/10 px-2 py-0.5 text-[10px]" onClick={() => moderate(m.userId, 'timeout', { preset: '24h' })}>Timeout 24h</button>
                          <button type="button" className="rounded bg-white/10 px-2 py-0.5 text-[10px]" onClick={() => moderate(m.userId, 'timeout', { minutes: 30 })}>Timeout 30m</button>
                          <button type="button" className="rounded bg-white/10 px-2 py-0.5 text-[10px]" onClick={() => moderate(m.userId, 'clear-timeout')}>Clear timeout</button>
                          {isOwner && m.role === 'MEMBER' && (
                            <button type="button" className="rounded bg-violet-700/80 px-2 py-0.5 text-[10px]" onClick={() => moderate(m.userId, 'role', { role: 'ADMIN' })}>Make admin</button>
                          )}
                          {isOwner && m.role === 'ADMIN' && (
                            <button type="button" className="rounded bg-violet-700/80 px-2 py-0.5 text-[10px]" onClick={() => moderate(m.userId, 'role', { role: 'MEMBER' })}>Demote</button>
                          )}
                          <button
                            type="button"
                            className="rounded bg-amber-700/80 px-2 py-0.5 text-[10px]"
                            onClick={async () => {
                              const gameId = window.prompt('Game id to remove this player from:');
                              if (!gameId || !leagueId) return;
                              await api.post(`/api/leagues/${leagueId}/tables/${gameId}/remove-player`, {
                                userId: m.userId
                              });
                              await loadGames();
                            }}
                          >
                            Remove from table
                          </button>
                          <button type="button" className="rounded bg-rose-700 px-2 py-0.5 text-[10px]" onClick={() => moderate(m.userId, 'kick')}>Kick</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {adminTab === 'theme' && isOwner && (
                <div className="space-y-3 text-sm">
                  <label className="block">
                    <span className="text-xs text-white/70">Name</span>
                    <input value={themeName} onChange={(e) => setThemeName(e.target.value)} className="mt-1 w-full rounded border border-white/15 bg-black/30 px-2 py-1" />
                  </label>
                  <label className="block">
                    <span className="text-xs text-white/70">Colour theme</span>
                    <input type="color" value={themeColor} onChange={(e) => setThemeColor(e.target.value)} className="mt-1 h-10 w-full cursor-pointer rounded border border-white/15 bg-black/30" />
                  </label>
                  <label className="block">
                    <span className="text-xs text-white/70">Logo</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setLogoFile(e.target.files?.[0] || null)} className="mt-1 block w-full text-xs" />
                  </label>
                  <button type="button" disabled={savingTheme} onClick={saveTheme} className="rounded-lg bg-white/20 px-3 py-2 text-xs font-semibold disabled:opacity-50">
                    {savingTheme ? 'Saving…' : 'Save theme'}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="flex flex-col min-h-[480px]">
          <div
            className="flex flex-1 flex-col rounded-xl border border-white/15 p-3 backdrop-blur shadow-lg"
            style={{ backgroundColor: `${theme}b3` }}
          >
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSideTab('chat')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${sideTab === 'chat' ? 'bg-white/25' : 'bg-black/20 hover:bg-black/30'}`}
              >
                Chat
              </button>
              <button
                type="button"
                onClick={() => setSideTab('members')}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${sideTab === 'members' ? 'bg-white/25' : 'bg-black/20 hover:bg-black/30'}`}
              >
                Members ({members.length || league?.memberCount || 0})
              </button>
            </div>

            {sideTab === 'chat' ? (
              <>
                <div className="flex-1 space-y-2 overflow-y-auto rounded-lg bg-black/15 p-2">
                  {chatMessages.length === 0 && (
                    <p className="text-center text-sm text-white/60 py-6">No messages yet in this league.</p>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={msg.id || i} className="text-sm">
                      <span className="font-medium text-cyan-100">{msg.userName}: </span>
                      <span className="text-white/95">{msg.message}</span>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <form onSubmit={sendMessage} className="mt-2 flex gap-2">
                  <input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    disabled={isMuted}
                    placeholder={isMuted ? 'You are muted' : 'Message this league…'}
                    className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm placeholder:text-white/50"
                  />
                  <button
                    type="submit"
                    disabled={isMuted || !newMessage.trim()}
                    className="rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40"
                    style={{ backgroundColor: theme }}
                  >
                    Send
                  </button>
                </form>
              </>
            ) : (
              <div className="flex-1 space-y-2 overflow-y-auto rounded-lg bg-black/15 p-2">
                {members.length === 0 && (
                  <p className="text-center text-sm text-white/60 py-6">No members loaded.</p>
                )}
                {members.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-2 py-2 text-left hover:bg-black/30"
                    onClick={() =>
                      setPlayerStats({
                        open: true,
                        player: {
                          id: m.user.id,
                          username: m.user.username,
                          avatar: m.user.avatarUrl,
                          stats: {} as any,
                          status: 'not_friend'
                        }
                      })
                    }
                  >
                    <img
                      src={m.user.avatarUrl || '/default-pfp.jpg'}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/default-pfp.jpg';
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{m.user.username}</div>
                      <div className="text-[10px] uppercase tracking-wide text-white/60">{m.role}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </main>

      <CreateGameModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreateGame={handleCreateGame}
      />

      <PlayerStatsModal
        isOpen={playerStats.open}
        onClose={() => setPlayerStats({ open: false, player: null })}
        player={playerStats.player}
        leagueId={leagueId}
      />
    </div>
  );
};

export default LeaguePage;
