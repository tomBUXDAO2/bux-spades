import React from 'react';
import { parseChatGifUrl } from '../utils/chatGif';

type ChatMessageBodyProps = {
  message: string;
  className?: string;
  style?: React.CSSProperties;
  textClassName?: string;
};

export const ChatMessageBody: React.FC<ChatMessageBodyProps> = ({
  message,
  className,
  style,
  textClassName
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
  return (
    <p className={textClassName || className} style={style}>
      {message}
    </p>
  );
};
