import React from 'react';
import { parseChatGifUrl } from '../utils/chatGif';
import {
  segmentMessageMentions,
  type MentionMatch
} from '../utils/chatMentions';

type ChatMessageBodyProps = {
  message: string;
  className?: string;
  style?: React.CSSProperties;
  textClassName?: string;
  mentions?: MentionMatch[] | null;
  mentionEveryone?: boolean;
  /** Highlight mentions of this user */
  currentUsername?: string | null;
};

export const ChatMessageBody: React.FC<ChatMessageBodyProps> = ({
  message,
  className,
  style,
  textClassName,
  mentions,
  mentionEveryone,
  currentUsername
}) => {
  const gifUrl = parseChatGifUrl(message);
  if (gifUrl) {
    return (
      <img
        src={gifUrl}
        alt="GIF"
        loading="lazy"
        className={className || 'mt-1 max-h-40 max-w-full rounded-md'}
        style={style}
      />
    );
  }

  const segments = segmentMessageMentions(message, mentions, { mentionEveryone });
  const me = (currentUsername || '').trim().toLowerCase();

  return (
    <p className={textClassName || className} style={style}>
      {segments.map((seg, idx) => {
        if (seg.type === 'text') {
          return <React.Fragment key={idx}>{seg.value}</React.Fragment>;
        }
        if (seg.everyone) {
          return (
            <span
              key={idx}
              className="rounded bg-rose-500/30 px-0.5 font-semibold text-rose-200"
            >
              {seg.value}
            </span>
          );
        }
        const isMe = me && seg.username.toLowerCase() === me;
        return (
          <span
            key={idx}
            className={
              isMe
                ? 'rounded bg-amber-400/25 px-0.5 font-semibold text-amber-200'
                : 'font-semibold text-cyan-300'
            }
          >
            {seg.value}
          </span>
        );
      })}
    </p>
  );
};
