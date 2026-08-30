import React, { useEffect, useRef, useState } from 'react';
import {
  LEAGUE_SECTION_OPTIONS,
  type LeagueMainSection,
} from './leagueSections';

type Props = {
  value: LeagueMainSection;
  onChange: (section: LeagueMainSection) => void;
  /** Unread announcements count for badge (0 hides badge). */
  announcementsUnread?: number;
  theme: string;
};

const LeagueSectionSelect: React.FC<Props> = ({
  value,
  onChange,
  announcementsUnread = 0,
  theme,
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = LEAGUE_SECTION_OPTIONS.find((o) => o.id === value) || LEAGUE_SECTION_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative min-w-[11rem]">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-white/20 bg-black/35 px-3 py-2 text-sm font-semibold text-white shadow-sm backdrop-blur hover:bg-black/45"
        style={{ boxShadow: `0 0 0 1px ${theme}44` }}
      >
        <span className="flex items-center gap-2">
          {current.label}
          {value === 'announcements' && announcementsUnread > 0 && (
            <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
              {announcementsUnread > 99 ? '99+' : announcementsUnread}
            </span>
          )}
          {value !== 'announcements' && announcementsUnread > 0 && (
            <span
              className="h-2 w-2 rounded-full bg-rose-400"
              title={`${announcementsUnread} unread announcements`}
            />
          )}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 opacity-80 transition ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 overflow-hidden rounded-lg border border-white/20 bg-slate-950/95 py-1 shadow-xl backdrop-blur-xl"
        >
          {LEAGUE_SECTION_OPTIONS.map((opt) => {
            const selected = opt.id === value;
            const showBadge = opt.id === 'announcements' && announcementsUnread > 0;
            return (
              <li key={opt.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                    selected ? 'bg-white/20 font-semibold text-white' : 'text-white/90 hover:bg-white/10'
                  }`}
                  onClick={() => {
                    onChange(opt.id);
                    setOpen(false);
                  }}
                >
                  <span>{opt.label}</span>
                  {showBadge && (
                    <span className="rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                      {announcementsUnread > 99 ? '99+' : announcementsUnread}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default LeagueSectionSelect;
