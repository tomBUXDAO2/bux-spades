import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { useAuth } from '@/features/auth/AuthContext';
import { useSocket } from '@/features/auth/SocketContext';
import { api, apiFetch } from '@/services/lib/api';
import Header from '@/components/common/Header';
import CreateGameModal from '@/components/game/CreateGameModal';
import PlayerStatsModal from '@/components/modals/PlayerStatsModal';
import FriendBlockConfirmModal from '@/components/modals/FriendBlockConfirmModal';
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
  leagueId?: string;
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
  /** friend | blocked | not_friend — from /api/auth/users */
  status?: string;
  online?: boolean;
};

type ConfirmAction = 'add_friend' | 'remove_friend' | 'block_user' | 'unblock_user';

function firstName(name?: string | null) {
  const part = String(name || 'Player').trim().split(/\s+/)[0];
  return part || 'Player';
}

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const LeaguePage: React.FC = () => {
  const { leagueId } = useParams<{ leagueId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { socket, isAuthenticated } = useSocket();

  const [league, setLeague] = useState<LeagueInfo | null>(null);
  const [games, setGames] = useState<any[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [sideTab, setSideTab] = useState<'chat' | 'members'>('chat');
  const [playerFilter, setPlayerFilter] = useState<'all' | 'friends' | 'hide-blocked'>('all');
  const [adminTab, setAdminTab] = useState<'requests' | 'moderation' | 'theme'>('requests');
  const [themeName, setThemeName] = useState('');
  const [themeColor, setThemeColor] = useState('#0f172a');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [savingTheme, setSavingTheme] = useState(false);
  const [playerStats, setPlayerStats] = useState<{ open: boolean; player: any }>({ open: false, player: null });
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    player: any;
    action: ConfirmAction;
  }>({ open: false, player: null, action: 'add_friend' });
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isAdmin = league?.role === 'OWNER' || league?.role === 'ADMIN';
  const isOwner = league?.role === 'OWNER';
  const isMuted = Boolean(league?.mutedUntil && new Date(league.mutedUntil) > new Date());
  const isTimedOut = Boolean(league?.timeoutUntil && new Date(league.timeoutUntil) > new Date());
  const theme = league?.bgColor || '#0f172a';
  const onlineCount = onlineUserIds.length;

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

  const mergeFriendStatus = useCallback(async (list: LeagueMember[]) => {
    try {
      const res = await api.get('/api/auth/users');
      if (!res.ok) return list.map((m) => ({ ...m, status: m.status || 'not_friend' }));
      const data = await res.json();
      const users = data.users || data;
      const byId = new Map<string, any>(
        Array.isArray(users) ? users.map((u: any) => [u.id, u]) : []
      );
      return list.map((m) => {
        const u = byId.get(m.userId);
        return {
          ...m,
          status: u?.status || 'not_friend'
        };
      });
    } catch {
      return list.map((m) => ({ ...m, status: m.status || 'not_friend' }));
    }
  }, []);

  const loadMembers = useCallback(async () => {
    if (!leagueId) return;
    const memRes = await api.get(`/api/leagues/${leagueId}/members`);
    if (!memRes.ok) return;
    const list = await memRes.json();
    const withStatus = await mergeFriendStatus(Array.isArray(list) ? list : []);
    setMembers(withStatus);
  }, [leagueId, mergeFriendStatus]);

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
      if (msg.leagueId && msg.leagueId !== leagueId) return;
      setChatMessages((prev) => [...prev, msg]);
    };
    const onDeleted = (payload: { leagueId?: string; messageId: string }) => {
      if (payload.leagueId && payload.leagueId !== leagueId) return;
      setChatMessages((prev) => prev.filter((m) => m.id !== payload.messageId));
      setSelectedMessageId((id) => (id === payload.messageId ? null : id));
    };
    const onPresence = (payload: { leagueId?: string; users: { userId: string }[] }) => {
      if (payload.leagueId && payload.leagueId !== leagueId) return;
      const ids = (payload.users || []).map((u) => u.userId);
      setOnlineUserIds(ids);
      setMembers((prev) => prev.map((m) => ({ ...m, online: ids.includes(m.userId) })));
    };
    const onMembership = () => {
      loadLeague();
      loadMembers();
      if (isAdmin) loadAdminData();
    };
    const refreshFriends = () => loadMembers();

    socket.on('league_chat_message', onMessage);
    socket.on('league_chat_deleted', onDeleted);
    socket.on('league_online_users', onPresence);
    socket.on('league_membership_updated', onMembership);
    socket.on('league_join_request', () => loadAdminData());
    socket.on('friendAdded', refreshFriends);
    socket.on('friendRemoved', refreshFriends);
    socket.on('userBlocked', refreshFriends);
    socket.on('userUnblocked', refreshFriends);

    const interval = setInterval(loadGames, 8000);
    return () => {
      socket.emit('leave_league_room', { leagueId });
      socket.off('league_chat_message', onMessage);
      socket.off('league_chat_deleted', onDeleted);
      socket.off('league_online_users', onPresence);
      socket.off('league_membership_updated', onMembership);
      socket.off('league_join_request');
      socket.off('friendAdded', refreshFriends);
      socket.off('friendRemoved', refreshFriends);
      socket.off('userBlocked', refreshFriends);
      socket.off('userUnblocked', refreshFriends);
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
    setShowEmojiPicker(false);
  };

  const handleSelectEmoji = (emoji: any) => {
    const input = inputRef.current;
    const emojiChar = emoji.native || emoji.colons || '';
    if (!input) {
      setNewMessage((prev) => prev + emojiChar);
      return;
    }
    const start = input.selectionStart ?? newMessage.length;
    const end = input.selectionEnd ?? newMessage.length;
    const updated = newMessage.slice(0, start) + emojiChar + newMessage.slice(end);
    setNewMessage(updated);
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + emojiChar.length;
      input.setSelectionRange(pos, pos);
    });
  };

  const deleteMessage = (messageId?: string) => {
    if (!messageId || !socket || !leagueId || !isAdmin) return;
    if (!window.confirm('Delete this message?')) return;
    socket.emit('delete_league_message', { leagueId, messageId });
    setSelectedMessageId(null);
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
      const apiBase =
        import.meta.env.VITE_API_URL ||
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
    await loadMembers();
    await loadLeague();
  };

  const handleConfirmFriendAction = () => {
    if (!confirmModal.player || !socket) return;
    if (!isAuthenticated || !socket.connected) {
      alert('Not connected. Please try again.');
      return;
    }
    const player = confirmModal.player;
    const targetUserId = player.id || player.userId;
    if (confirmModal.action === 'add_friend') {
      socket.emit('add_friend', { targetUserId });
    } else if (confirmModal.action === 'remove_friend') {
      socket.emit('remove_friend', { targetUserId });
    } else if (confirmModal.action === 'block_user') {
      socket.emit('block_user', { targetUserId });
    } else if (confirmModal.action === 'unblock_user') {
      socket.emit('unblock_user', { targetUserId });
    }
    setConfirmModal({ open: false, player: null, action: 'add_friend' });
  };

  const openMemberStats = (m: LeagueMember) => {
    setPlayerStats({
      open: true,
      player: {
        id: m.user.id,
        username: m.user.username,
        avatar: m.user.avatarUrl,
        avatarUrl: m.user.avatarUrl,
        stats: {} as any,
        status: m.status || 'not_friend'
      }
    });
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

  const headerLeft = (
    <div className="flex items-center gap-2 min-w-0">
      <Link
        to="/"
        className="shrink-0 rounded-lg border border-white/15 bg-black/20 px-2 py-1 text-xs text-white/90 hover:bg-black/30"
      >
        ← Lobby
      </Link>
      {league?.logoUrl && (
        <img
          src={league.logoUrl}
          alt=""
          className="h-9 w-9 shrink-0 rounded-lg object-cover border border-white/25"
        />
      )}
      <div className="min-w-0">
        <div className="truncate text-base font-bold text-white drop-shadow sm:text-lg">{league?.name}</div>
        <div className="truncate text-[10px] text-white/70 sm:text-xs">
          {league?.memberCount} members
          {isTimedOut ? ' · timed out' : ''}
          {isMuted ? ' · muted' : ''}
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="min-h-screen text-white"
      style={{
        background: `radial-gradient(1200px 600px at 10% -10%, ${theme}cc, transparent), linear-gradient(165deg, ${theme} 0%, #020617 55%)`
      }}
    >
      <div className="border-b border-white/10" style={{ backgroundColor: `${theme}dd` }}>
        <Header
          className="!bg-transparent !border-0 !shadow-none"
          fullWidth
          leftContent={headerLeft}
          onOpenMyStats={() =>
            user &&
            setPlayerStats({
              open: true,
              player: {
                id: user.id,
                username: user.username,
                avatar: user.avatarUrl || user.avatar,
                avatarUrl: user.avatarUrl || user.avatar,
                stats: {} as any,
                status: 'not_friend'
              }
            })
          }
        />
      </div>

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
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
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
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" />
                <span className="text-xs font-medium text-white/85">{onlineCount} online</span>
              </div>
            </div>

            {sideTab === 'chat' ? (
              <>
                <div className="flex-1 space-y-3 overflow-y-auto rounded-lg bg-black/15 p-2">
                  {chatMessages.length === 0 && (
                    <p className="text-center text-sm text-white/60 py-6">No messages yet in this league.</p>
                  )}
                  {chatMessages.map((msg, i) =>
                    msg.userId === 'system' ? (
                      <div key={msg.id || i} className="w-full text-center my-1">
                        <span className="italic text-amber-300/95 text-sm">{msg.message}</span>
                      </div>
                    ) : (
                      <div
                        key={msg.id || i}
                        className={`flex items-start gap-2 ${user && msg.userId === user.id ? 'justify-end' : ''}`}
                      >
                        {!(user && msg.userId === user.id) && (
                          <img
                            src={msg.userAvatar || '/default-pfp.jpg'}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/default-pfp.jpg';
                            }}
                          />
                        )}
                        <button
                          type="button"
                          className={`max-w-[80%] rounded-xl px-3 py-2 text-left ${
                            user && msg.userId === user.id
                              ? 'bg-gradient-to-br from-cyan-600 to-teal-700 text-white'
                              : 'border border-white/10 bg-black/35 text-white'
                          } ${isAdmin && selectedMessageId === msg.id ? 'ring-2 ring-rose-400' : ''}`}
                          onClick={() => {
                            if (!isAdmin || !msg.id || msg.id.startsWith('system-')) return;
                            setSelectedMessageId((id) => (id === msg.id ? null : msg.id || null));
                          }}
                        >
                          <div className="mb-0.5 flex items-center justify-between gap-2">
                            {!(user && msg.userId === user.id) && (
                              <span className="text-xs font-medium opacity-80">{firstName(msg.userName)}</span>
                            )}
                            <span className="text-[10px] opacity-70 ml-auto">{formatTime(msg.timestamp)}</span>
                          </div>
                          <p className="text-sm break-words">{msg.message}</p>
                          {isAdmin && selectedMessageId === msg.id && (
                            <span
                              role="button"
                              tabIndex={0}
                              className="mt-2 inline-block rounded bg-rose-700 px-2 py-0.5 text-[10px] font-semibold"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteMessage(msg.id);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.stopPropagation();
                                  deleteMessage(msg.id);
                                }
                              }}
                            >
                              Delete message
                            </span>
                          )}
                        </button>
                        {user && msg.userId === user.id && (
                          <img
                            src={msg.userAvatar || user.avatarUrl || user.avatar || '/default-pfp.jpg'}
                            alt=""
                            className="h-8 w-8 rounded-full object-cover shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/default-pfp.jpg';
                            }}
                          />
                        )}
                      </div>
                    )
                  )}
                  <div ref={chatEndRef} />
                </div>
                <form onSubmit={sendMessage} className="mt-2 relative">
                  <div className="flex items-center gap-2">
                    <input
                      ref={inputRef}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                      disabled={isMuted}
                      placeholder={isMuted ? 'You are muted' : 'Message this league…'}
                      className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/25 px-3 py-2 text-sm placeholder:text-white/50"
                    />
                    <div className="relative shrink-0">
                      <button
                        type="button"
                        disabled={isMuted}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-transparent hover:border-white/10 hover:bg-white/5 disabled:opacity-40"
                        onClick={() => !isMuted && setShowEmojiPicker((v) => !v)}
                      >
                        <span role="img" aria-label="emoji" className="text-xl">
                          😊
                        </span>
                      </button>
                      {showEmojiPicker && !isMuted && (
                        <div className="absolute right-0 bottom-12 z-50">
                          <Picker data={data} onEmojiSelect={handleSelectEmoji} theme="dark" />
                        </div>
                      )}
                    </div>
                    <button
                      type="submit"
                      disabled={isMuted || !newMessage.trim()}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg disabled:opacity-40"
                      style={{ backgroundColor: theme }}
                      aria-label="Send"
                    >
                      <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4l16 8-16 8 4-8z" />
                      </svg>
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="mb-2 flex flex-col justify-center rounded-xl border border-violet-500/20 bg-gradient-to-r from-violet-950/70 to-indigo-950/50 px-4 py-2 min-h-[64px]">
                  <div className="flex items-center justify-between h-8">
                    <span className="flex items-center gap-2 text-slate-200 font-bold text-base">
                      <img
                        src="/friend.svg"
                        alt="Friends"
                        className="h-7 w-7"
                        style={{ filter: 'invert(1) brightness(2)' }}
                      />
                      Friends: {members.filter((m) => m.status === 'friend').length}
                    </span>
                    <span className="flex items-center gap-1 text-slate-300 font-medium text-sm">
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full" />
                      {members.filter((m) => m.status === 'friend' && m.online).length} Online
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-sm text-slate-300">
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="leaguePlayerFilter"
                        value="all"
                        checked={playerFilter === 'all'}
                        onChange={() => setPlayerFilter('all')}
                        className="accent-cyan-500"
                      />
                      All
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="leaguePlayerFilter"
                        value="friends"
                        checked={playerFilter === 'friends'}
                        onChange={() => setPlayerFilter('friends')}
                        className="accent-cyan-500"
                      />
                      Friends
                    </label>
                    <label className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="radio"
                        name="leaguePlayerFilter"
                        value="hide-blocked"
                        checked={playerFilter === 'hide-blocked'}
                        onChange={() => setPlayerFilter('hide-blocked')}
                        className="accent-cyan-500"
                      />
                      Hide Blocked
                    </label>
                  </div>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto mb-1">
                  {members.length === 0 && (
                    <p className="text-center text-sm text-slate-400 py-4">No members found.</p>
                  )}
                  {[...members]
                    .filter((m) => {
                      if (playerFilter === 'friends') return m.status === 'friend';
                      if (playerFilter === 'hide-blocked') return m.status !== 'blocked';
                      return true;
                    })
                    .sort((a, b) => {
                      if (a.status === 'friend' && b.status !== 'friend') return -1;
                      if (b.status === 'friend' && a.status !== 'friend') return 1;
                      if (Boolean(b.online) !== Boolean(a.online)) return Number(b.online) - Number(a.online);
                      if (playerFilter === 'all') {
                        if (a.status === 'blocked' && b.status !== 'blocked') return 1;
                        if (b.status === 'blocked' && a.status !== 'blocked') return -1;
                      }
                      return 0;
                    })
                    .map((m) => {
                      const isSelf = user?.id === m.userId;
                      const status = m.status || 'not_friend';
                      return (
                        <div
                          key={m.id}
                          className="flex items-center gap-3 rounded-lg border border-white/5 bg-slate-900/50 p-2"
                        >
                          <img
                            src={m.user.avatarUrl || '/default-pfp.jpg'}
                            alt=""
                            className="h-8 w-8 rounded-full border-2 border-slate-600 object-cover shrink-0"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = '/default-pfp.jpg';
                            }}
                          />
                          <span
                            className={`font-medium text-sm flex items-center cursor-pointer hover:underline min-w-0 ${
                              m.online ? 'text-green-400' : 'text-slate-300'
                            }`}
                            onClick={() => openMemberStats(m)}
                          >
                            <span className="truncate">{firstName(m.user.username)}</span>
                            {m.online && (
                              <span className="ml-2 inline-block w-2 h-2 bg-green-500 rounded-full shrink-0" />
                            )}
                            {status === 'friend' && (
                              <img
                                src="/friend.svg"
                                alt="Friend"
                                className="ml-2 h-5 w-5 shrink-0"
                                style={{ filter: 'invert(1) brightness(2)' }}
                              />
                            )}
                            {(m.role === 'ADMIN' || m.role === 'OWNER') && (
                              <span className="ml-2 text-[9px] uppercase tracking-wide text-amber-200/90 shrink-0">
                                {m.role}
                              </span>
                            )}
                          </span>
                          <div className="ml-auto flex shrink-0 items-center gap-2">
                            {isOwner && !isSelf && m.role === 'MEMBER' && (
                              <button
                                type="button"
                                title="Make admin"
                                className="rounded bg-violet-700/80 px-1.5 py-1 text-[9px] font-semibold"
                                onClick={() => moderate(m.userId, 'role', { role: 'ADMIN' })}
                              >
                                +Admin
                              </button>
                            )}
                            {isOwner && !isSelf && m.role === 'ADMIN' && (
                              <button
                                type="button"
                                title="Remove admin"
                                className="rounded bg-violet-700/80 px-1.5 py-1 text-[9px] font-semibold"
                                onClick={() => moderate(m.userId, 'role', { role: 'MEMBER' })}
                              >
                                −Admin
                              </button>
                            )}
                            {!isSelf && status === 'blocked' ? (
                              <>
                                <span className="text-slate-400 text-xs mr-1">unblock?</span>
                                <button
                                  type="button"
                                  className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-600 border border-slate-300 hover:bg-slate-500"
                                  title="Unblock"
                                  onClick={() =>
                                    setConfirmModal({
                                      open: true,
                                      player: { id: m.userId, username: m.user.username },
                                      action: 'unblock_user'
                                    })
                                  }
                                >
                                  <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                                    <circle cx="12" cy="12" r="11" />
                                    <path d="M6 18L18 6" strokeWidth="2.5" />
                                  </svg>
                                </button>
                              </>
                            ) : (
                              !isSelf && (
                                <>
                                  {status === 'friend' ? (
                                    <button
                                      type="button"
                                      className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600 border border-slate-300 hover:bg-red-700"
                                      title="Remove Friend"
                                      onClick={() =>
                                        setConfirmModal({
                                          open: true,
                                          player: { id: m.userId, username: m.user.username },
                                          action: 'remove_friend'
                                        })
                                      }
                                    >
                                      <img
                                        src="/remove-friend.svg"
                                        alt="Remove Friend"
                                        className="h-5 w-5"
                                        style={{ filter: 'invert(1) brightness(2)' }}
                                      />
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600 border border-slate-300 hover:bg-green-700"
                                      title="Add Friend"
                                      onClick={() =>
                                        setConfirmModal({
                                          open: true,
                                          player: { id: m.userId, username: m.user.username },
                                          action: 'add_friend'
                                        })
                                      }
                                    >
                                      <img
                                        src="/add-friend.svg"
                                        alt="Add Friend"
                                        className="h-5 w-5"
                                        style={{ filter: 'invert(1) brightness(2)' }}
                                      />
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-600 border border-slate-300 hover:bg-slate-500"
                                    title="Block"
                                    onClick={() =>
                                      setConfirmModal({
                                        open: true,
                                        player: { id: m.userId, username: m.user.username },
                                        action: 'block_user'
                                      })
                                    }
                                  >
                                    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="white" strokeWidth="2">
                                      <circle cx="12" cy="12" r="11" />
                                      <path d="M4 4L20 20M20 4L4 20" strokeWidth="2.5" />
                                    </svg>
                                  </button>
                                </>
                              )
                            )}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </>
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

      <FriendBlockConfirmModal
        isOpen={confirmModal.open}
        action={confirmModal.action}
        username={confirmModal.player?.username || 'Unknown User'}
        onConfirm={handleConfirmFriendAction}
        onClose={() => setConfirmModal({ open: false, player: null, action: 'add_friend' })}
      />
    </div>
  );
};

export default LeaguePage;
