import React, { useCallback, useMemo, useRef, useState } from 'react';
import { MentionAutocomplete } from './MentionAutocomplete';
import {
  filterMentionCandidates,
  getActiveMentionQuery,
  insertMention,
  type MentionCandidate
} from '../utils/chatMentions';

type MentionInputProps = {
  value: string;
  onChange: (value: string) => void;
  mentionCandidates?: MentionCandidate[];
  excludeUserId?: string;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  /** Called when Enter should submit (mention menu closed). Return true if handled. */
  onSubmitKey?: () => void;
};

/**
 * Text input with @mention autocomplete overlay.
 */
export const MentionTextInput: React.FC<MentionInputProps> = ({
  value,
  onChange,
  mentionCandidates = [],
  excludeUserId,
  disabled,
  placeholder,
  className,
  style,
  inputRef: externalRef,
  onKeyDown,
  onSubmitKey
}) => {
  const innerRef = useRef<HTMLInputElement>(null);
  const ref = (externalRef as React.RefObject<HTMLInputElement>) || innerRef;
  const [cursor, setCursor] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);

  const mentionState = useMemo(
    () => getActiveMentionQuery(value, cursor),
    [value, cursor]
  );

  const filtered = useMemo(() => {
    if (!mentionState) return [];
    return filterMentionCandidates(
      mentionCandidates,
      mentionState.query,
      excludeUserId
    );
  }, [mentionCandidates, mentionState, excludeUserId]);

  const selectMention = useCallback(
    (candidate: MentionCandidate) => {
      if (!mentionState) return;
      const { text, cursor: nextCursor } = insertMention(
        value,
        mentionState.start,
        mentionState.end,
        candidate.username
      );
      onChange(text);
      setActiveIndex(0);
      requestAnimationFrame(() => {
        const el = ref.current;
        if (el) {
          el.focus();
          el.setSelectionRange(nextCursor, nextCursor);
          setCursor(nextCursor);
        }
      });
    },
    [mentionState, value, onChange, ref]
  );

  const syncCursor = (el: HTMLInputElement | null) => {
    if (!el) return;
    setCursor(el.selectionStart ?? el.value.length);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (filtered.length > 0 && mentionState) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        selectMention(filtered[activeIndex] || filtered[0]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setCursor(value.length);
        // Move cursor past query end so menu closes without clearing text
        const el = ref.current;
        if (el && mentionState) {
          const pos = mentionState.end;
          el.setSelectionRange(pos, pos);
        }
        setActiveIndex(0);
        return;
      }
    } else if (e.key === 'Enter' && !e.shiftKey && onSubmitKey) {
      e.preventDefault();
      onSubmitKey();
      return;
    }
    onKeyDown?.(e);
  };

  return (
    <div className="relative min-w-0 flex-1">
      {filtered.length > 0 && (
        <MentionAutocomplete
          candidates={filtered}
          activeIndex={activeIndex}
          onSelect={selectMention}
          onHoverIndex={setActiveIndex}
        />
      )}
      <input
        ref={ref}
        type="text"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        className={className}
        style={style}
        onChange={(e) => {
          onChange(e.target.value);
          setCursor(e.target.selectionStart ?? e.target.value.length);
          setActiveIndex(0);
        }}
        onClick={(e) => syncCursor(e.currentTarget)}
        onKeyUp={(e) => syncCursor(e.currentTarget)}
        onSelect={(e) => syncCursor(e.currentTarget)}
        onKeyDown={handleKeyDown}
        autoComplete="off"
      />
    </div>
  );
};
