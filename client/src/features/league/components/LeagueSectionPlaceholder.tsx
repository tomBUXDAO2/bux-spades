import React from 'react';
import type { LeagueMainSection } from '../leagueSections';

type Props = {
  section: Exclude<LeagueMainSection, 'lobby'>;
  theme: string;
};

const COPY: Record<
  Exclude<LeagueMainSection, 'lobby'>,
  { title: string; body: string }
> = {
  announcements: {
    title: 'Announcements',
    body: 'League news and updates from admins will appear here. Members will be able to react with a fixed emoji set, and unread counts will show on the section menu.',
  },
  tournaments: {
    title: 'Tournaments',
    body: 'Single and double elimination brackets, registration, roll call, and match tables will live here.',
  },
  events: {
    title: 'Events',
    body: 'Timed contests with their own lobbies, prize criteria, and live leaderboards will live here.',
  },
  stats: {
    title: 'League stats',
    body: 'League-wide standings with filters, sorting, and player search will live here.',
  },
};

const LeagueSectionPlaceholder: React.FC<Props> = ({ section, theme }) => {
  const copy = COPY[section];
  return (
    <div
      className="rounded-xl border border-white/15 p-6 backdrop-blur"
      style={{ backgroundColor: `${theme}99` }}
    >
      <h3 className="text-lg font-semibold text-white drop-shadow">{copy.title}</h3>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-white/75">{copy.body}</p>
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-cyan-200/80">Coming soon</p>
    </div>
  );
};

export default LeagueSectionPlaceholder;
