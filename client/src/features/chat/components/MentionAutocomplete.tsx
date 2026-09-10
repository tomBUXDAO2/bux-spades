import React from 'react';
import type { MentionCandidate } from '../utils/chatMentions';

type MentionAutocompleteProps = {
  candidates: MentionCandidate[];
  activeIndex: number;
  onSelect: (candidate: MentionCandidate) => void;
  onHoverIndex?: (index: number) => void;
  className?: string;
};

export const MentionAutocomplete: React.FC<MentionAutocompleteProps> = ({
  candidates,
  activeIndex,
  onSelect,
  onHoverIndex,
  className
}) => {
  if (!candidates.length) return null;

  return (
    <ul
      role="listbox"
      className={
        className ||
        'absolute bottom-full left-0 z-50 mb-1 max-h-48 w-full overflow-auto rounded-lg border border-white/15 bg-slate-950/95 py-1 shadow-xl backdrop-blur-xl'
      }
    >
      {candidates.map((c, i) => (
        <li key={c.id} role="option" aria-selected={i === activeIndex}>
          <button
            type="button"
            className={`flex w-full items-center px-3 py-1.5 text-left text-sm ${
              i === activeIndex
                ? 'bg-cyan-500/25 text-cyan-100'
                : 'text-slate-200 hover:bg-white/10'
            }`}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(c);
            }}
            onMouseEnter={() => onHoverIndex?.(i)}
          >
            <span className="font-medium">@{c.username}</span>
          </button>
        </li>
      ))}
    </ul>
  );
};
