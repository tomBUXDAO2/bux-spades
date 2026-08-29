import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/services/lib/api';
import type { GifSearchResult } from '../utils/chatGif';

type GifPickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  disabled?: boolean;
  /** Anchor: render above the trigger by default */
  className?: string;
};

export const GifPicker: React.FC<GifPickerProps> = ({
  open,
  onClose,
  onSelect,
  disabled,
  className
}) => {
  const [query, setQuery] = useState('');
  const [gifs, setGifs] = useState<GifSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    setError(null);
    try {
      const endpoint = q.trim()
        ? `/api/gifs/search?q=${encodeURIComponent(q.trim())}&limit=24`
        : '/api/gifs/trending?limit=24';
      const res = await api.get(endpoint);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load GIFs');
      }
      setGifs(Array.isArray(data.gifs) ? data.gifs : []);
    } catch (e: any) {
      setGifs([]);
      setError(e?.message || 'Failed to load GIFs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || disabled) return;
    load('');
  }, [open, disabled, load]);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      load(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose]);

  if (!open || disabled) return null;

  return (
    <div
      ref={panelRef}
      className={
        className ||
        'absolute right-0 bottom-12 z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-white/15 bg-slate-950/95 shadow-xl backdrop-blur-xl'
      }
    >
      <div className="border-b border-white/10 p-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Giphy…"
          className="w-full rounded-lg border border-white/10 bg-slate-900/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/40 focus:outline-none"
        />
      </div>
      <div className="max-h-64 overflow-y-auto p-2">
        {loading && <p className="py-6 text-center text-xs text-slate-400">Loading…</p>}
        {!loading && error && <p className="py-6 text-center text-xs text-red-400">{error}</p>}
        {!loading && !error && gifs.length === 0 && (
          <p className="py-6 text-center text-xs text-slate-400">No GIFs found</p>
        )}
        {!loading && !error && gifs.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                className="overflow-hidden rounded-md border border-white/5 bg-black/40 transition hover:border-cyan-400/40"
                onClick={() => {
                  onSelect(gif.url);
                  onClose();
                }}
                title={gif.title || 'GIF'}
              >
                <img
                  src={gif.previewUrl}
                  alt={gif.title || 'GIF'}
                  loading="lazy"
                  className="h-20 w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-white/10 px-2 py-1 text-[10px] text-slate-500">
        Powered by GIPHY
      </div>
    </div>
  );
};
