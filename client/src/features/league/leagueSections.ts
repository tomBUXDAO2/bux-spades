export type LeagueMainSection =
  | 'lobby'
  | 'announcements'
  | 'tournaments'
  | 'events'
  | 'stats';

export const LEAGUE_SECTION_OPTIONS: {
  id: LeagueMainSection;
  label: string;
}[] = [
  { id: 'lobby', label: 'Lobby' },
  { id: 'announcements', label: 'Announcements' },
  { id: 'tournaments', label: 'Tournaments' },
  { id: 'events', label: 'Events' },
  { id: 'stats', label: 'Stats' },
];
