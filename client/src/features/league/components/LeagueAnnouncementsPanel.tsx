import React, { useCallback, useEffect, useState } from 'react';
import { api, apiFetch } from '@/services/lib/api';

type Reaction = { emoji: string; count: number; reacted: boolean };

type Announcement = {
  id: string;
  title?: string | null;
  body: string;
  createdAt: string;
  author: { id: string; username: string; avatarUrl?: string | null };
  reactions: Reaction[];
};

type Props = {
  leagueId: string;
  theme: string;
  isAdmin: boolean;
  onUnreadChange?: (count: number) => void;
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
    return '';
  }
}

const LeagueAnnouncementsPanel: React.FC<Props> = ({
  leagueId,
  theme,
  isAdmin,
  onUnreadChange
}) => {
  const [items, setItems] = useState<Announcement[]>([]);
  const [allowedEmojis, setAllowedEmojis] = useState<string[]>(['👍', '❤️', '😂', '🔥', '😮', '🎉']);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.get(`/api/leagues/${leagueId}/announcements`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Failed to load announcements');
    setItems(Array.isArray(data.announcements) ? data.announcements : []);
    if (Array.isArray(data.allowedEmojis) && data.allowedEmojis.length) {
      setAllowedEmojis(data.allowedEmojis);
    }
    if (typeof data.unreadCount === 'number') onUnreadChange?.(data.unreadCount);
  }, [leagueId, onUnreadChange]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        await load();
        if (!cancelled) {
          await api.post(`/api/leagues/${leagueId}/announcements/mark-read`, {});
          onUnreadChange?.(0);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leagueId, load, onUnreadChange]);

  const post = async () => {
    if (!body.trim()) return;
    setPosting(true);
    setError(null);
    try {
      const res = await api.post(`/api/leagues/${leagueId}/announcements`, {
        title: title.trim() || undefined,
        body: body.trim()
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to post');
      setTitle('');
      setBody('');
      setItems((prev) => [data, ...prev.filter((a) => a.id !== data.id)]);
    } catch (e: any) {
      setError(e.message || 'Failed to post');
    } finally {
      setPosting(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this announcement?')) return;
    const res = await apiFetch(`/api/leagues/${leagueId}/announcements/${id}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Delete failed');
      return;
    }
    setItems((prev) => prev.filter((a) => a.id !== id));
  };

  const toggleReaction = async (announcementId: string, emoji: string) => {
    setPickerFor(null);
    const res = await api.post(`/api/leagues/${leagueId}/announcements/${announcementId}/reactions`, {
      emoji
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || 'Reaction failed');
      return;
    }
    setItems((prev) => prev.map((a) => (a.id === data.id ? data : a)));
  };

  if (loading) {
    return <p className="text-sm text-white/70">Loading announcements…</p>;
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-xs text-rose-100">
          {error}
        </div>
      )}

      {isAdmin && (
        <div
          className="space-y-2 rounded-xl border border-white/15 p-3 backdrop-blur"
          style={{ backgroundColor: `${theme}99` }}
        >
          <div className="text-sm font-semibold text-white">New announcement</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Title (optional)"
            className="w-full rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white placeholder:text-white/40"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
            rows={4}
            placeholder="Write an update for the league…"
            className="w-full resize-y rounded-lg border border-white/15 bg-black/35 px-3 py-2 text-sm text-white placeholder:text-white/40"
          />
          <button
            type="button"
            disabled={posting || !body.trim()}
            onClick={post}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            style={{ background: `linear-gradient(90deg, ${theme}, #0e7490)` }}
          >
            {posting ? 'Posting…' : 'Post'}
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div
          className="rounded-xl border border-white/15 p-6 text-sm text-white/70 backdrop-blur"
          style={{ backgroundColor: `${theme}99` }}
        >
          No announcements yet.
        </div>
      ) : (
        items.map((a) => (
          <article
            key={a.id}
            className="rounded-xl border border-white/15 p-4 backdrop-blur"
            style={{ backgroundColor: `${theme}99` }}
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <img
                  src={a.author.avatarUrl || '/default-pfp.jpg'}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/default-pfp.jpg';
                  }}
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{a.author.username}</div>
                  <div className="text-[11px] text-white/55">{formatWhen(a.createdAt)}</div>
                </div>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => remove(a.id)}
                  className="shrink-0 rounded bg-rose-700/80 px-2 py-1 text-[10px] font-semibold text-white"
                >
                  Delete
                </button>
              )}
            </div>
            {a.title && <h3 className="mb-1 text-base font-semibold text-white">{a.title}</h3>}
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/90">{a.body}</p>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {a.reactions.map((r) => (
                <button
                  key={r.emoji}
                  type="button"
                  onClick={() => toggleReaction(a.id, r.emoji)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${
                    r.reacted
                      ? 'border-cyan-400/50 bg-cyan-500/25 text-white'
                      : 'border-white/15 bg-black/25 text-white/90 hover:bg-black/40'
                  }`}
                >
                  <span>{r.emoji}</span>
                  <span>{r.count}</span>
                </button>
              ))}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPickerFor((id) => (id === a.id ? null : a.id))}
                  className="rounded-full border border-white/15 bg-black/25 px-2 py-0.5 text-xs text-white/80 hover:bg-black/40"
                  aria-label="Add reaction"
                >
                  +
                </button>
                {pickerFor === a.id && (
                  <div className="absolute bottom-full left-0 z-20 mb-1 flex gap-1 rounded-lg border border-white/20 bg-slate-950/95 p-1.5 shadow-xl">
                    {allowedEmojis.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        className="rounded px-1.5 py-0.5 text-base hover:bg-white/10"
                        onClick={() => toggleReaction(a.id, emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </article>
        ))
      )}
    </div>
  );
};

export default LeagueAnnouncementsPanel;
