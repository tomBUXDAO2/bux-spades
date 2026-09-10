import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '@/features/auth/SocketContext';

type MentionToast = {
  id: string;
  fromUserName: string;
  message: string;
  route?: string;
  mentionEveryone?: boolean;
};

/**
 * Listens for `chat_mention` socket events and shows a brief in-app toast.
 * Push covers offline; this covers online / foreground.
 */
export function ChatMentionToastListener() {
  const { socket } = useSocket();
  const navigate = useNavigate();
  const [toast, setToast] = useState<MentionToast | null>(null);

  useEffect(() => {
    if (!socket) return;

    const onMention = (payload: any) => {
      const id = String(payload?.id || Date.now());
      setToast({
        id,
        fromUserName: payload?.fromUserName || 'Someone',
        message: String(payload?.message || '').slice(0, 120),
        route: typeof payload?.route === 'string' ? payload.route : undefined,
        mentionEveryone: Boolean(payload?.mentionEveryone)
      });
    };

    socket.on('chat_mention', onMention);
    return () => {
      socket.off('chat_mention', onMention);
    };
  }, [socket]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  return (
    <button
      type="button"
      className="fixed bottom-4 left-1/2 z-[100000] w-[min(24rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-xl border border-amber-400/40 bg-slate-950/95 px-4 py-3 text-left shadow-2xl backdrop-blur-xl"
      onClick={() => {
        if (toast.route) navigate(toast.route);
        setToast(null);
      }}
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-amber-300">
        {toast.mentionEveryone
          ? `${toast.fromUserName} mentioned @everyone`
          : `${toast.fromUserName} mentioned you`}
      </div>
      <div className="mt-1 line-clamp-2 text-sm text-slate-100">{toast.message}</div>
    </button>
  );
}
