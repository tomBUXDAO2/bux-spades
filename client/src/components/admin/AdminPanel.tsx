import React, { useState, useEffect } from 'react';
import { useAuth } from '@/features/auth/AuthContext';

interface Game {
  id: string;
  status: 'WAITING' | 'BIDDING' | 'PLAYING';
  createdAt: string;
  updatedAt: string;
  settings: any;
  currentPlayer?: string;
  currentTrick?: number;
  currentRound?: number;
  players: Array<{
    seatIndex: number;
    userId: string;
    user: {
      id: string;
      username: string;
      discordId: string;
      avatar?: string;
    };
    isReady: boolean;
    type: string;
  }>;
}

interface EventCriterionForm {
  type: 'MOST_WINS' | 'MOST_GAMES_PLAYED' | 'HIGHEST_WIN_PERCENT' | 'GAMES_PLAYED_MILESTONE' | 'GAMES_WON_MILESTONE';
  rewardCoins: number;
  milestoneValue?: number;
}

interface EventFormState {
  name: string;
  description: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  bannerUrl: string;
  formats: string[];
  modes: string[];
  minCoins?: number;
  maxCoins?: number;
  minPoints?: number;
  maxPoints?: number;
  nilAllowed: boolean | null;
  blindNilAllowed: boolean | null;
  specialRule1: string[];
  specialRule2: string[];
  gimmickVariants: string[];
  criteria: EventCriterionForm[];
}

interface EventSummary {
  id: string;
  name: string;
  description?: string;
  timezone: string;
  startsAt: string;
  endsAt: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  bannerUrl?: string | null;
  filters?: Record<string, unknown> | null;
  criteria: Array<{
    id: string;
    type: EventCriterionForm['type'];
    rewardCoins: number;
    milestoneValue?: number | null;
  }>;
  participants?: Array<{
    id: string;
    eventId: string;
    userId: string;
    gamesPlayed: number;
    gamesWon: number;
    winPercent: number;
    milestoneProgress: Record<string, number> | null;
  }>;
}

interface TournamentFormState {
  name: string;
  mode: 'PARTNERS' | 'SOLO';
  format: 'REGULAR' | 'WHIZ' | 'MIRROR' | 'GIMMICK';
  startTime: string;
  buyIn?: number;
  eliminationType: 'SINGLE' | 'DOUBLE';
  prizes: {
    winners: string;
    runnersUp: string;
  };
  bannerUrl: string;
  // Game settings
  minPoints?: number;
  maxPoints?: number;
  nilAllowed: boolean | null;
  blindNilAllowed: boolean | null;
  numHands?: number;
  gimmickVariant?: string | null;
  isRated: boolean;
}

const FORMAT_OPTIONS = ['REGULAR', 'WHIZ', 'MIRROR', 'GIMMICK'] as const;
const MODE_OPTIONS = ['PARTNERS', 'SOLO'] as const;
const GIMMICK_OPTIONS = ['SUICIDE', 'BID4NIL', 'BID3', 'BIDHEARTS', 'CRAZY_ACES', 'JOKER'] as const;
const SPECIAL_RULE1_OPTIONS = ['SCREAMER', 'ASSASSIN', 'SECRET_ASSASSIN'] as const;
const SPECIAL_RULE2_OPTIONS = ['LOWBALL', 'HIGHBALL'] as const;

const TIMEZONE_OPTIONS = [
  { label: 'UK', value: 'Europe/London' },
  { label: 'USA - Pacific', value: 'America/Los_Angeles' },
  { label: 'USA - Mountain', value: 'America/Denver' },
  { label: 'USA - Central', value: 'America/Chicago' },
  { label: 'USA - Eastern', value: 'America/New_York' },
] as const;

const generateCoinOptions = () => {
  const values: number[] = [];
  for (let value = 50_000; value <= 1_000_000; value += 50_000) {
    values.push(value);
  }
  for (let value = 1_500_000; value <= 10_000_000; value += 500_000) {
    values.push(value);
  }
  return values;
};

const COIN_OPTION_VALUES = generateCoinOptions();

const formatCoins = (value?: number | null) => {
  if (value === null || value === undefined) {
    return '';
  }

  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    const formatted = Number.isInteger(millions) ? millions.toString() : millions.toFixed(1).replace(/\.0$/, '');
    return `${formatted}mil`;
  }

  const thousands = value / 1_000;
  const formatted = Number.isInteger(thousands) ? thousands.toString() : thousands.toFixed(1).replace(/\.0$/, '');
  return `${formatted}k`;
};

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'games' | 'tournaments' | 'events'>('games');
  const [games, setGames] = useState<Game[]>([]);
  const [selectedGames, setSelectedGames] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventError, setEventError] = useState<string | null>(null);
  const [eventSuccessMessage, setEventSuccessMessage] = useState<string | null>(null);
  const [eventStatusUpdating, setEventStatusUpdating] = useState<string | null>(null);
  const resolvedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timezoneDefault = TIMEZONE_OPTIONS.some((option) => option.value === resolvedTimezone)
    ? resolvedTimezone
    : TIMEZONE_OPTIONS[0].value;
  const [creatingEvent, setCreatingEvent] = useState(false);
  const [newEvent, setNewEvent] = useState<EventFormState>({
    name: '',
    description: '',
    timezone: timezoneDefault,
    startsAt: '',
    endsAt: '',
    bannerUrl: '',
    formats: [...FORMAT_OPTIONS],
    modes: [...MODE_OPTIONS],
    minCoins: undefined,
    maxCoins: undefined,
    minPoints: undefined,
    maxPoints: undefined,
    nilAllowed: null,
    blindNilAllowed: null,
    specialRule1: [],
    specialRule2: [],
    gimmickVariants: [],
    criteria: [
      { type: 'MOST_WINS', rewardCoins: 2000000 },
      { type: 'MOST_GAMES_PLAYED', rewardCoins: 2000000 },
    ],
  });
  const { user } = useAuth();
  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string | null>(null);
  const [bannerUploadError, setBannerUploadError] = useState<string | null>(null);
  const [bannerUploading, setBannerUploading] = useState(false);
  
  // Tournament state
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(false);
  const [tournamentError, setTournamentError] = useState<string | null>(null);
  const [tournamentSuccessMessage, setTournamentSuccessMessage] = useState<string | null>(null);
  const [creatingTournament, setCreatingTournament] = useState(false);
  const [newTournament, setNewTournament] = useState<TournamentFormState>({
    name: '',
    mode: 'PARTNERS',
    format: 'REGULAR',
    startTime: '',
    buyIn: undefined,
    eliminationType: 'SINGLE',
    prizes: {
      winners: '',
      runnersUp: '',
    },
    bannerUrl: '',
    minPoints: -100,
    maxPoints: 500,
    nilAllowed: true,
    blindNilAllowed: false,
    numHands: undefined,
    gimmickVariant: null,
    isRated: true,
  });
  const [tournamentBannerPreviewUrl, setTournamentBannerPreviewUrl] = useState<string | null>(null);
  const [tournamentBannerUploadError, setTournamentBannerUploadError] = useState<string | null>(null);
  const [tournamentBannerUploading, setTournamentBannerUploading] = useState(false);
  
  // Detect screen width for responsive sizing
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);
  const [screenHeight, setScreenHeight] = useState(window.innerHeight);
  
  useEffect(() => {
    const handleResize = () => {
      setScreenWidth(window.innerWidth);
      setScreenHeight(window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Detect portrait mode
  const isPortrait = screenHeight > screenWidth;
  
  // Apply scaling for 600-649px screens (landscape)
  const isSmallScreen = screenWidth >= 600 && screenWidth <= 649;
  // Apply medium scaling for 650-699px screens
  const isMediumScreen = screenWidth >= 650 && screenWidth <= 699;
  // Apply large scaling for 700-749px screens
  const isLargeScreen = screenWidth >= 700 && screenWidth <= 749;
  // Apply extra large scaling for 750-799px screens
  const isExtraLargeScreen = screenWidth >= 750 && screenWidth <= 799;
  const textScale = isSmallScreen ? 0.7 : (isMediumScreen ? 0.85 : (isLargeScreen ? 0.95 : (isExtraLargeScreen ? 0.98 : 1)));
  const iconScale = isSmallScreen ? 0.7 : (isMediumScreen ? 0.85 : (isLargeScreen ? 0.95 : (isExtraLargeScreen ? 0.98 : 1)));
  const paddingScale = isSmallScreen ? 0.6 : (isMediumScreen ? 0.7 : (isLargeScreen ? 0.85 : (isExtraLargeScreen ? 0.9 : 1)));

  // Fetch games when panel opens
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'games') {
      fetchGames();
    } else if (activeTab === 'events') {
      fetchEvents();
    } else if (activeTab === 'tournaments') {
      fetchTournaments();
    }
  }, [isOpen, activeTab]);

  useEffect(() => {
    return () => {
      if (bannerPreviewUrl) {
        URL.revokeObjectURL(bannerPreviewUrl);
      }
    };
  }, [bannerPreviewUrl]);

  const bannerDisplayUrl = newEvent.bannerUrl
    ? (newEvent.bannerUrl.startsWith('http')
        ? newEvent.bannerUrl
        : `${apiBaseUrl}${newEvent.bannerUrl}`)
    : null;
  const bannerPreviewSrc = bannerPreviewUrl || bannerDisplayUrl;

  const fetchGames = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('sessionToken');
      const apiUrl = apiBaseUrl;
      const response = await fetch(`${apiUrl}/api/admin/games`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch games');
      }

      const data = await response.json();
      setGames(data.games || []);
    } catch (err) {
      console.error('Error fetching games:', err);
      setError('Failed to load games');
    } finally {
      setLoading(false);
    }
  };

  const handleEventInputChange = <K extends keyof EventFormState>(key: K, value: EventFormState[K]) => {
    setNewEvent(prev => ({
      ...prev,
      [key]: value,
    }));
  };

  const toggleSelection = (array: string[], value: string) => {
    if (array.includes(value)) {
      return array.filter(item => item !== value);
    }
    return [...array, value];
  };

  const handleBannerFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0] || null;
    input.value = '';

    if (!file) {
      return;
    }

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setBannerUploadError('Only PNG or JPEG images are supported.');
      return;
    }

    setBannerUploading(true);
    setBannerUploadError(null);

    try {
      const token = localStorage.getItem('sessionToken');
      const formData = new FormData();
      formData.append('banner', file);

      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${apiBaseUrl}/api/admin/events/banner`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!response.ok) {
        const message = await response.json().catch(() => ({}));
        throw new Error(message?.error || 'Failed to upload banner image');
      }

      const data = await response.json();
      handleEventInputChange('bannerUrl', data.bannerUrl);

      if (bannerPreviewUrl) {
        URL.revokeObjectURL(bannerPreviewUrl);
      }
      setBannerPreviewUrl(URL.createObjectURL(file));
    } catch (err: any) {
      console.error('Error uploading event banner:', err);
      setBannerUploadError(err?.message || 'Failed to upload banner image');
    } finally {
      setBannerUploading(false);
    }
  };

  const handleClearBanner = () => {
    handleEventInputChange('bannerUrl', '');
    if (bannerPreviewUrl) {
      URL.revokeObjectURL(bannerPreviewUrl);
    }
    setBannerPreviewUrl(null);
    setBannerUploadError(null);
  };

  const criterionTypeLabels: Record<EventCriterionForm['type'], string> = {
    MOST_WINS: 'Most Wins',
    MOST_GAMES_PLAYED: 'Most Games Played',
    HIGHEST_WIN_PERCENT: 'Highest Win %',
    GAMES_PLAYED_MILESTONE: 'Games Played Milestone',
    GAMES_WON_MILESTONE: 'Games Won Milestone',
  };

  const addCriterion = () => {
    setNewEvent(prev => ({
      ...prev,
      criteria: [
        ...prev.criteria,
        { type: 'MOST_WINS', rewardCoins: 1000000 },
      ],
    }));
  };

  const updateCriterion = (index: number, updates: Partial<EventCriterionForm>) => {
    setNewEvent(prev => {
      const next = [...prev.criteria];
      next[index] = {
        ...next[index],
        ...updates,
      };
      return { ...prev, criteria: next };
    });
  };

  const removeCriterion = (index: number) => {
    setNewEvent(prev => {
      const next = [...prev.criteria];
      next.splice(index, 1);
      return { ...prev, criteria: next };
    });
  };

  const buildEventPayload = () => {
    const startsAtIso = newEvent.startsAt ? new Date(newEvent.startsAt).toISOString() : null;
    const endsAtIso = newEvent.endsAt ? new Date(newEvent.endsAt).toISOString() : null;

    if (!startsAtIso || !endsAtIso) {
      throw new Error('Please provide both start and end times');
    }

    const filters: Record<string, unknown> = {};

    if (newEvent.formats.length && newEvent.formats.length < FORMAT_OPTIONS.length) {
      filters.allowedFormats = newEvent.formats;
    }

    if (newEvent.modes.length && newEvent.modes.length < MODE_OPTIONS.length) {
      filters.allowedModes = newEvent.modes;
    }

    if (newEvent.minCoins !== undefined || newEvent.maxCoins !== undefined) {
      const min = newEvent.minCoins ?? newEvent.maxCoins ?? 0;
      const max = newEvent.maxCoins ?? newEvent.minCoins ?? 0;
      filters.coinRange = { min, max };
    }

    if (newEvent.minPoints !== undefined) {
      filters.minPoints = newEvent.minPoints;
    }

    if (newEvent.maxPoints !== undefined) {
      filters.maxPoints = newEvent.maxPoints;
    }

    if (newEvent.nilAllowed !== null) {
      filters.nilAllowed = newEvent.nilAllowed;
    }

    if (newEvent.blindNilAllowed !== null) {
      filters.blindNilAllowed = newEvent.blindNilAllowed;
    }

    if (newEvent.specialRule1.length) {
      filters.allowedSpecialRule1 = newEvent.specialRule1;
    }

    if (newEvent.specialRule2.length) {
      filters.allowedSpecialRule2 = newEvent.specialRule2;
    }

    if (newEvent.gimmickVariants.length) {
      filters.allowedGimmickVariants = newEvent.gimmickVariants;
    }

    const criteria = newEvent.criteria
      .filter(criterion => criterion.rewardCoins > 0)
      .map(criterion => ({
        type: criterion.type,
        rewardCoins: Math.floor(criterion.rewardCoins),
        milestoneValue:
          (criterion.type === 'GAMES_PLAYED_MILESTONE' || criterion.type === 'GAMES_WON_MILESTONE') && criterion.milestoneValue
            ? Math.floor(criterion.milestoneValue)
            : null,
      }));

    return {
      name: newEvent.name.trim(),
      description: newEvent.description.trim() || null,
      timezone: newEvent.timezone,
      startsAt: startsAtIso,
      endsAt: endsAtIso,
      bannerUrl: newEvent.bannerUrl.trim() || null,
      filters: Object.keys(filters).length ? filters : null,
      criteria,
    };
  };

  const handleCreateEvent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setEventError(null);

    try {
      const payload = buildEventPayload();

      if (!payload.name) {
        throw new Error('Event name is required');
      }

      if (!payload.criteria || payload.criteria.length === 0) {
        throw new Error('Please configure at least one reward criterion.');
      }

      setCreatingEvent(true);

      const token = localStorage.getItem('sessionToken');
      const apiUrl = apiBaseUrl;
      const response = await fetch(`${apiUrl}/api/admin/events`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const message = await response.json().catch(() => ({}));
        throw new Error(message?.error || 'Failed to create event');
      }

      setEventSuccessMessage('Event created successfully!');
      resetEventForm();
      await fetchEvents();
    } catch (err: any) {
      console.error('Error creating event:', err);
      setEventError(err?.message || 'Failed to create event');
    } finally {
      setCreatingEvent(false);
    }
  };

  const handleUpdateEventStatus = async (eventId: string, status: EventSummary['status']) => {
    setEventError(null);
    setEventSuccessMessage(null);
    setEventStatusUpdating(eventId);
    try {
      const token = localStorage.getItem('sessionToken');
      const apiUrl = apiBaseUrl;
      const response = await fetch(`${apiUrl}/api/admin/events/${eventId}/status`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });

      if (!response.ok) {
        throw new Error('Failed to update event status');
      }

      await fetchEvents();
      setEventSuccessMessage(`Event status updated to ${status}.`);
    } catch (err) {
      console.error('Error updating event status:', err);
      setEventError('Failed to update event status');
    } finally {
      setEventStatusUpdating(null);
    }
  };

  const formatTimestamp = (isoString: string) => {
    return new Date(isoString).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  const renderEventCard = (event: EventSummary) => {
    const now = Date.now();
    const startMs = new Date(event.startsAt).getTime();
    const endMs = new Date(event.endsAt).getTime();
    const isLive = event.status === 'ACTIVE' && now >= startMs && now <= endMs;

    const criteriaList = event.criteria.map(criterion => {
      const label = criterionTypeLabels[criterion.type];
      const reward = `${formatCoins(criterion.rewardCoins)} coins`;
      if ((criterion.type === 'GAMES_PLAYED_MILESTONE' || criterion.type === 'GAMES_WON_MILESTONE') && criterion.milestoneValue) {
        return `${label} — ${reward} (every ${criterion.milestoneValue})`;
      }
      return `${label} — ${reward}`;
    });

    return (
      <div key={event.id} className="bg-slate-800 rounded-lg border border-slate-700 p-4 mb-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h4 className="text-white font-semibold text-lg">{event.name}</h4>
            <div className="text-slate-400 text-sm">
              {formatTimestamp(event.startsAt)} – {formatTimestamp(event.endsAt)} ({event.timezone})
            </div>
            {event.description && (
              <p className="text-slate-300 mt-2 text-sm whitespace-pre-wrap">{event.description}</p>
            )}
            {criteriaList.length > 0 && (
              <div className="mt-2 text-sm text-slate-300">
                <div className="font-semibold text-white mb-1">Prizes</div>
                <ul className="list-disc list-inside space-y-1">
                  {criteriaList.map((line, index) => (
                    <li key={`${event.id}-criterion-${index}`}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="flex flex-col items-start gap-2">
            <span
              className={`text-xs font-bold uppercase px-2 py-1 rounded ${
                event.status === 'ACTIVE'
                  ? 'bg-green-600 text-white'
                  : event.status === 'SCHEDULED'
                  ? 'bg-yellow-500 text-black'
                  : event.status === 'COMPLETED'
                  ? 'bg-slate-600 text-white'
                  : 'bg-red-600 text-white'
              }`}
            >
              {event.status}
              {isLive ? ' • LIVE' : ''}
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={eventStatusUpdating === event.id || event.status === 'ACTIVE'}
                className="px-3 py-1 text-sm rounded bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white"
                onClick={() => handleUpdateEventStatus(event.id, 'ACTIVE')}
              >
                {event.status === 'ACTIVE' ? 'Active' : 'Set Active'}
              </button>
              <button
                type="button"
                disabled={eventStatusUpdating === event.id || event.status === 'COMPLETED'}
                className="px-3 py-1 text-sm rounded bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white"
                onClick={() => handleUpdateEventStatus(event.id, 'COMPLETED')}
              >
                {event.status === 'COMPLETED' ? 'Completed' : 'Mark Complete'}
              </button>
              <button
                type="button"
                disabled={eventStatusUpdating === event.id || event.status === 'CANCELLED'}
                className="px-3 py-1 text-sm rounded bg-red-600 hover:bg-red-700 disabled:bg-slate-600 text-white"
                onClick={() => handleUpdateEventStatus(event.id, 'CANCELLED')}
              >
                {event.status === 'CANCELLED' ? 'Cancelled' : 'Cancel'}
              </button>
            </div>
          </div>
        </div>
        {event.filters && Object.keys(event.filters).length > 0 && (
          <details className="mt-3 text-sm text-slate-300">
            <summary className="cursor-pointer text-white font-medium">Filters</summary>
            <pre className="mt-2 bg-slate-900 rounded p-3 text-xs text-slate-200 overflow-x-auto">
              {JSON.stringify(event.filters, null, 2)}
            </pre>
          </details>
        )}
      </div>
    );
  };

  const resetEventForm = () => {
    setNewEvent({
      name: '',
      description: '',
      timezone: timezoneDefault,
      startsAt: '',
      endsAt: '',
      bannerUrl: '',
      formats: [...FORMAT_OPTIONS],
      modes: [...MODE_OPTIONS],
      minCoins: undefined,
      maxCoins: undefined,
      minPoints: undefined,
      maxPoints: undefined,
      nilAllowed: null,
      blindNilAllowed: null,
      specialRule1: [],
      specialRule2: [],
      gimmickVariants: [],
      criteria: [
        { type: 'MOST_WINS', rewardCoins: 2000000 },
        { type: 'MOST_GAMES_PLAYED', rewardCoins: 2000000 },
      ],
    });
    if (bannerPreviewUrl) {
      URL.revokeObjectURL(bannerPreviewUrl);
    }
    setBannerPreviewUrl(null);
    setBannerUploadError(null);
  };

  const fetchEvents = async () => {
    setEventsLoading(true);
    setEventError(null);
    setEventSuccessMessage(null);
    try {
      const token = localStorage.getItem('sessionToken');
      const apiUrl = apiBaseUrl;
      const response = await fetch(`${apiUrl}/api/admin/events?status=SCHEDULED,ACTIVE,COMPLETED&limit=20`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch events');
      }

      const data = await response.json();
      setEvents(Array.isArray(data.events) ? data.events : []);
    } catch (err) {
      console.error('Error fetching events:', err);
      setEventError('Failed to load events');
    } finally {
      setEventsLoading(false);
    }
  };

  const handleGameSelect = (gameId: string) => {
    const newSelected = new Set(selectedGames);
    if (newSelected.has(gameId)) {
      newSelected.delete(gameId);
    } else {
      newSelected.add(gameId);
    }
    setSelectedGames(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedGames.size === games.length) {
      setSelectedGames(new Set());
    } else {
      setSelectedGames(new Set(games.map(game => game.id)));
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedGames.size === 0) return;

    if (!confirm(`Are you sure you want to delete ${selectedGames.size} game(s)? This action cannot be undone.`)) {
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('sessionToken');
      const response = await fetch(`${apiBaseUrl}/api/admin/games`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ gameIds: Array.from(selectedGames) }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete games');
      }

      const data = await response.json();
      console.log('Deleted games:', data);
      
      // Refresh games list
      await fetchGames();
      setSelectedGames(new Set());
    } catch (err) {
      console.error('Error deleting games:', err);
      setError('Failed to delete games');
    } finally {
      setLoading(false);
    }
  };

  const handleRemovePlayer = async (gameId: string, userId: string, username: string) => {
    if (!confirm(`Are you sure you want to remove ${username} from this game?`)) {
      return;
    }

    try {
      const token = localStorage.getItem('sessionToken');
      const response = await fetch(`${apiBaseUrl}/api/admin/games/${gameId}/players/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to remove player');
      }

      // Refresh games list
      await fetchGames();
    } catch (err) {
      console.error('Error removing player:', err);
      setError('Failed to remove player');
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'WAITING': return 'text-yellow-400';
      case 'BIDDING': return 'text-blue-400';
      case 'PLAYING': return 'text-green-400';
      default: return 'text-gray-400';
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-[9998]"
        onClick={onClose}
      />

      {/* Admin Panel */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center" style={{ padding: isPortrait ? '8px' : `${16 * paddingScale}px` }}>
        <div 
          className="bg-slate-900 rounded-lg shadow-2xl border border-red-500/50 w-full max-w-4xl overflow-hidden"
          style={{ maxHeight: isPortrait ? 'calc(100vh - 16px)' : '90vh' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-red-600 to-red-700 flex items-center justify-between" style={{ paddingTop: `${8 * paddingScale}px`, paddingBottom: `${8 * paddingScale}px`, paddingLeft: isPortrait ? `${12 * paddingScale}px` : `${24 * paddingScale}px`, paddingRight: isPortrait ? `${12 * paddingScale}px` : `${24 * paddingScale}px` }}>
            <div className="flex items-center" style={{ gap: `${12 * paddingScale}px` }}>
              <span style={{ fontSize: `${24 * textScale}px` }}>⚠️</span>
              <h2 className="font-bold text-white" style={{ fontSize: `${20 * textScale}px` }}>ADMIN PANEL</h2>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 leading-none"
              style={{ fontSize: `${24 * textScale}px` }}
            >
              ×
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-slate-700">
            <button
              onClick={() => setActiveTab('games')}
              className={`flex-1 font-medium transition-colors ${
                activeTab === 'games'
                  ? 'bg-slate-800 text-white border-b-2 border-red-500'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
              style={{ padding: isPortrait ? `${8 * paddingScale}px 12px` : `${12 * paddingScale}px ${24 * paddingScale}px`, fontSize: isPortrait ? `${12 * textScale}px` : `${14 * textScale}px` }}
            >
              🎮 Manage Games
            </button>
            <button
              onClick={() => setActiveTab('tournaments')}
              className={`flex-1 font-medium transition-colors ${
                activeTab === 'tournaments'
                  ? 'bg-slate-800 text-white border-b-2 border-red-500'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
              style={{ padding: isPortrait ? `${8 * paddingScale}px 12px` : `${12 * paddingScale}px ${24 * paddingScale}px`, fontSize: isPortrait ? `${12 * textScale}px` : `${14 * textScale}px` }}
            >
              🏆 Tournaments
            </button>
            <button
              onClick={() => setActiveTab('events')}
              className={`flex-1 font-medium transition-colors ${
                activeTab === 'events'
                  ? 'bg-slate-800 text-white border-b-2 border-red-500'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
              style={{ padding: isPortrait ? `${8 * paddingScale}px 12px` : `${12 * paddingScale}px ${24 * paddingScale}px`, fontSize: isPortrait ? `${12 * textScale}px` : `${14 * textScale}px` }}
            >
              📅 Daily Events
            </button>
          </div>

          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(90vh-140px)]" style={{ padding: isPortrait ? `${12 * paddingScale}px` : `${24 * paddingScale}px` }}>
            {activeTab === 'games' && (
              <div>
                <div className={isPortrait ? "flex flex-col mb-4" : "flex justify-between items-center mb-4"} style={{ gap: isPortrait ? `${12 * paddingScale}px` : '0' }}>
                  <div>
                    <h3 className="font-semibold text-white" style={{ fontSize: `${18 * textScale}px` }}>Manage Stuck Games</h3>
                    <p className="text-slate-400" style={{ fontSize: `${14 * textScale}px` }}>
                      View and delete games that are stuck or need manual intervention.
                    </p>
                  </div>
                  <div className="flex" style={{ gap: `${8 * paddingScale}px` }}>
                    <button
                      onClick={fetchGames}
                      disabled={loading}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 rounded text-white flex items-center justify-center"
                      style={{ padding: `${4 * paddingScale}px ${12 * paddingScale}px`, fontSize: `${14 * textScale}px` }}
                    >
                      {loading ? 'Loading...' : 'Refresh'}
                    </button>
                    <button
                      onClick={handleSelectAll}
                      className="bg-gray-600 hover:bg-gray-700 rounded text-white flex items-center justify-center"
                      style={{ padding: `${4 * paddingScale}px ${12 * paddingScale}px`, fontSize: `${14 * textScale}px` }}
                    >
                      {selectedGames.size === games.length ? 'Deselect All' : 'Select All'}
                    </button>
                    <button
                      onClick={handleDeleteSelected}
                      disabled={selectedGames.size === 0 || loading}
                      className="bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded text-white flex items-center justify-center"
                      style={{ padding: `${4 * paddingScale}px ${12 * paddingScale}px`, fontSize: `${14 * textScale}px` }}
                    >
                      Delete Selected ({selectedGames.size})
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="mb-4 bg-red-900 border border-red-700 rounded text-red-200" style={{ padding: `${12 * paddingScale}px`, fontSize: `${14 * textScale}px` }}>
                    {error}
                  </div>
                )}

                <div className="bg-slate-800 rounded-lg border border-slate-700 max-h-96 overflow-y-auto">
                  {games.length === 0 ? (
                    <div className="text-center text-slate-400" style={{ padding: `${32 * paddingScale}px`, fontSize: `${14 * textScale}px` }}>
                      {loading ? 'Loading games...' : 'No active games found'}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-700">
                      {games.map((game) => (
                        <div
                          key={game.id}
                          className={`hover:bg-slate-700/50 cursor-pointer transition-colors ${
                            selectedGames.has(game.id) ? 'bg-red-900/20 border-l-4 border-red-500' : ''
                          }`}
                          style={{ padding: `${16 * paddingScale}px` }}
                          onClick={() => handleGameSelect(game.id)}
                        >
                          <div className="flex items-start" style={{ gap: `${12 * paddingScale}px` }}>
                            <input
                              type="checkbox"
                              checked={selectedGames.has(game.id)}
                              onChange={() => handleGameSelect(game.id)}
                              className="mt-1 text-red-600 bg-slate-700 border-slate-600 rounded focus:ring-red-500"
                              style={{ width: `${16 * iconScale}px`, height: `${16 * iconScale}px` }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center mb-2" style={{ gap: `${12 * paddingScale}px` }}>
                                <span className="font-mono text-slate-400" style={{ fontSize: `${14 * textScale}px` }}>
                                  {game.id}
                                </span>
                                <span className={`rounded font-semibold ${getStatusColor(game.status)} bg-slate-700`} style={{ padding: `${4 * paddingScale}px ${8 * paddingScale}px`, fontSize: `${12 * textScale}px` }}>
                                  {game.status}
                                </span>
                                <span className="text-slate-400" style={{ fontSize: `${12 * textScale}px` }}>
                                  {formatDate(game.createdAt)}
                                </span>
                              </div>
                              
                              <div className="text-slate-300 mb-2" style={{ fontSize: `${14 * textScale}px` }}>
                                <div>Players: {game.players.length}/4</div>
                                {game.currentPlayer && <div>Current Player: {game.currentPlayer}</div>}
                                {game.currentTrick && <div>Current Trick: {game.currentTrick}</div>}
                                {game.currentRound && <div>Current Round: {game.currentRound}</div>}
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4" style={{ gap: `${8 * paddingScale}px` }}>
                                {game.players.map((player, index) => (
                                  <div key={player.seatIndex} className="flex items-center bg-slate-700 rounded" style={{ gap: `${8 * paddingScale}px`, padding: `${8 * paddingScale}px` }}>
                                    <span className="text-slate-400" style={{ fontSize: `${12 * textScale}px` }}>Seat {player.seatIndex}:</span>
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium truncate text-white" style={{ fontSize: `${14 * textScale}px` }}>
                                        {player.user.username}
                                      </div>
                                      <div className="text-slate-400" style={{ fontSize: `${12 * textScale}px` }}>
                                        {player.type} • {player.isReady ? 'Ready' : 'Not Ready'}
                                      </div>
                                    </div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemovePlayer(game.id, player.userId, player.user.username);
                                      }}
                                      className="text-red-400 hover:text-red-300"
                                      style={{ fontSize: `${12 * textScale}px`, padding: `${0}px ${4 * paddingScale}px` }}
                                      title="Remove player"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                                {Array.from({ length: 4 - game.players.length }).map((_, index) => (
                                  <div key={`empty-${index}`} className="flex items-center bg-slate-700 rounded opacity-50" style={{ gap: `${8 * paddingScale}px`, padding: `${8 * paddingScale}px` }}>
                                    <span className="text-slate-400" style={{ fontSize: `${12 * textScale}px` }}>Seat {game.players.length + index}:</span>
                                    <div className="text-slate-500" style={{ fontSize: `${14 * textScale}px` }}>Empty</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'tournaments' && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-white mb-2" style={{ fontSize: `${18 * textScale}px` }}>Create Tournament</h3>
                  <p className="text-slate-400" style={{ fontSize: `${14 * textScale}px` }}>
                    Set up a tournament with custom rules, prizes, and elimination format. Tournament will be posted to Discord automatically.
                  </p>
                </div>

                {tournamentSuccessMessage && (
                  <div className="bg-green-900/50 border border-green-700 rounded p-3 text-green-200" style={{ fontSize: `${14 * textScale}px` }}>
                    {tournamentSuccessMessage}
                  </div>
                )}

                {tournamentError && (
                  <div className="bg-red-900/50 border border-red-700 rounded p-3 text-red-200" style={{ fontSize: `${14 * textScale}px` }}>
                    {tournamentError}
                  </div>
                )}

                <form className="bg-slate-800 rounded-lg border border-slate-700 p-4 space-y-4" onSubmit={handleCreateTournament} style={{ fontSize: `${14 * textScale}px` }}>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white">Tournament Name *</label>
                      <input
                        required
                        value={newTournament.name}
                        onChange={e => handleTournamentInputChange('name', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                        placeholder="e.g. Winter Championship 2025"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white">Start Date & Time *</label>
                      <input
                        required
                        type="datetime-local"
                        value={newTournament.startTime}
                        onChange={e => handleTournamentInputChange('startTime', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white">Mode *</label>
                      <select
                        required
                        value={newTournament.mode}
                        onChange={e => handleTournamentInputChange('mode', e.target.value as 'PARTNERS' | 'SOLO')}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                      >
                        {MODE_OPTIONS.map(mode => (
                          <option key={mode} value={mode}>{mode}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white">Format *</label>
                      <select
                        required
                        value={newTournament.format}
                        onChange={e => handleTournamentInputChange('format', e.target.value as 'REGULAR' | 'WHIZ' | 'MIRROR' | 'GIMMICK')}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                      >
                        {FORMAT_OPTIONS.map(format => (
                          <option key={format} value={format}>{format}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white">Elimination Type *</label>
                      <select
                        required
                        value={newTournament.eliminationType}
                        onChange={e => handleTournamentInputChange('eliminationType', e.target.value as 'SINGLE' | 'DOUBLE')}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                      >
                        <option value="SINGLE">Single Elimination</option>
                        <option value="DOUBLE">Double Elimination (lose twice to be eliminated)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white">Buy-in (Coins)</label>
                      <select
                        value={newTournament.buyIn || ''}
                        onChange={e => handleTournamentInputChange('buyIn', e.target.value ? Number(e.target.value) : undefined)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                      >
                        <option value="">Free Tournament</option>
                        {COIN_OPTION_VALUES.map(value => (
                          <option key={value} value={value}>{formatCoins(value)}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white">Winners Prize</label>
                      <input
                        value={newTournament.prizes.winners}
                        onChange={e => handleTournamentInputChange('prizes', { ...newTournament.prizes, winners: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                        placeholder="e.g. 10M coins or Trophy + 5M coins"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white">Runners-up Prize</label>
                      <input
                        value={newTournament.prizes.runnersUp}
                        onChange={e => handleTournamentInputChange('prizes', { ...newTournament.prizes, runnersUp: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                        placeholder="e.g. 5M coins"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-white">Banner Image</label>
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={handleTournamentBannerFileChange}
                      className="w-full text-sm text-slate-200 file:mr-4 file:cursor-pointer file:rounded file:border-0 file:bg-red-600 file:px-3 file:py-2 file:text-white"
                    />
                    <p className="text-xs text-slate-400">
                      Upload a PNG or JPEG banner for the tournament.
                    </p>
                    {tournamentBannerUploading && (
                      <div className="text-xs text-slate-300">Uploading banner...</div>
                    )}
                    {tournamentBannerUploadError && (
                      <div className="text-xs text-red-300">{tournamentBannerUploadError}</div>
                    )}
                    {tournamentBannerPreviewUrl && (
                      <div className="flex flex-col gap-2 rounded border border-slate-700 bg-slate-900 p-3">
                        <div className="flex items-start gap-3">
                          <img
                            src={tournamentBannerPreviewUrl}
                            alt="Tournament banner preview"
                            className="h-24 w-40 rounded object-cover"
                          />
                          <div className="flex flex-col gap-2 text-xs text-slate-300">
                            <span>Current banner preview</span>
                            <button
                              type="button"
                              onClick={handleClearTournamentBanner}
                              className="text-red-300 hover:text-red-200 text-sm"
                            >
                              Remove banner
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-700 pt-4">
                    <h4 className="font-semibold text-white mb-3" style={{ fontSize: `${16 * textScale}px` }}>Game Settings</h4>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-white">Min Points</label>
                        <input
                          type="number"
                          value={newTournament.minPoints || ''}
                          onChange={e => handleTournamentInputChange('minPoints', e.target.value ? Number(e.target.value) : undefined)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                          placeholder="-100"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-white">Max Points</label>
                        <input
                          type="number"
                          value={newTournament.maxPoints || ''}
                          onChange={e => handleTournamentInputChange('maxPoints', e.target.value ? Number(e.target.value) : undefined)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                          placeholder="500"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-white">Number of Hands</label>
                        <input
                          type="number"
                          value={newTournament.numHands || ''}
                          onChange={e => handleTournamentInputChange('numHands', e.target.value ? Number(e.target.value) : undefined)}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                          placeholder="Leave empty for default"
                        />
                      </div>
                      {newTournament.format === 'GIMMICK' && (
                        <div className="space-y-2">
                          <label className="block text-sm font-semibold text-white">Gimmick Variant</label>
                          <select
                            value={newTournament.gimmickVariant || ''}
                            onChange={e => handleTournamentInputChange('gimmickVariant', e.target.value || null)}
                            className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                          >
                            <option value="">None</option>
                            {GIMMICK_OPTIONS.map(variant => (
                              <option key={variant} value={variant}>{variant}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-white">Nil Allowed</label>
                        <select
                          value={newTournament.nilAllowed === null ? '' : newTournament.nilAllowed ? 'true' : 'false'}
                          onChange={e => handleTournamentInputChange('nilAllowed', e.target.value === '' ? null : e.target.value === 'true')}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                        >
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-white">Blind Nil Allowed</label>
                        <select
                          value={newTournament.blindNilAllowed === null ? '' : newTournament.blindNilAllowed ? 'true' : 'false'}
                          onChange={e => handleTournamentInputChange('blindNilAllowed', e.target.value === '' ? null : e.target.value === 'true')}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                        >
                          <option value="false">No</option>
                          <option value="true">Yes</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="block text-sm font-semibold text-white">Rated Game</label>
                        <select
                          value={newTournament.isRated ? 'true' : 'false'}
                          onChange={e => handleTournamentInputChange('isRated', e.target.value === 'true')}
                          className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                        >
                          <option value="true">Yes</option>
                          <option value="false">No</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="submit"
                      disabled={creatingTournament}
                      className="bg-red-600 hover:bg-red-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-semibold rounded px-4 py-2"
                      style={{ fontSize: `${14 * textScale}px` }}
                    >
                      {creatingTournament ? 'Creating...' : 'Create Tournament'}
                    </button>
                    <button
                      type="button"
                      onClick={resetTournamentForm}
                      className="bg-slate-700 hover:bg-slate-600 text-white font-semibold rounded px-4 py-2"
                      style={{ fontSize: `${14 * textScale}px` }}
                    >
                      Reset
                    </button>
                  </div>
                </form>

                {tournaments.length > 0 && (
                  <div className="mt-6">
                    <h3 className="font-semibold text-white mb-4" style={{ fontSize: `${18 * textScale}px` }}>Existing Tournaments</h3>
                    <div className="space-y-3">
                      {tournaments.map(tournament => (
                        <div key={tournament.id} className="bg-slate-800 rounded-lg border border-slate-700 p-4">
                          <div className="flex justify-between items-start">
                            <div>
                              <h4 className="font-semibold text-white" style={{ fontSize: `${16 * textScale}px` }}>{tournament.name}</h4>
                              <p className="text-slate-400" style={{ fontSize: `${12 * textScale}px` }}>
                                {tournament.mode} • {tournament.format} • {tournament.eliminationType} Elimination
                              </p>
                              <p className="text-slate-400" style={{ fontSize: `${12 * textScale}px` }}>
                                Starts: {new Date(tournament.startTime).toLocaleString()}
                              </p>
                              <p className="text-slate-400" style={{ fontSize: `${12 * textScale}px` }}>
                                Status: {tournament.status} • Registrations: {tournament._count?.registrations || 0}
                              </p>
                            </div>
                            <a
                              href={`/tournament/${tournament.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300"
                              style={{ fontSize: `${12 * textScale}px` }}
                            >
                              View Lobby →
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'events' && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-white mb-2" style={{ fontSize: `${18 * textScale}px` }}>Create Event</h3>
                  <p className="text-slate-400" style={{ fontSize: `${14 * textScale}px` }}>
                    Configure event schedule, eligible game filters, and prizes. Event games still count toward overall league stats.
                  </p>
                </div>

                <form className="bg-slate-800 rounded-lg border border-slate-700 p-4 space-y-4" onSubmit={handleCreateEvent}>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white">Event Name</label>
                      <input
                        required
                        value={newEvent.name}
                        onChange={e => handleEventInputChange('name', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                        placeholder="e.g. Weekend Whiz Challenge"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white">Timezone</label>
                      <select
                        value={newEvent.timezone}
                        onChange={e => handleEventInputChange('timezone', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                      >
                        {TIMEZONE_OPTIONS.map(tz => (
                          <option key={tz.value} value={tz.value}>{tz.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white">Start Time</label>
                      <input
                        required
                        type="datetime-local"
                        value={newEvent.startsAt}
                        onChange={e => handleEventInputChange('startsAt', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white">End Time</label>
                      <input
                        required
                        type="datetime-local"
                        value={newEvent.endsAt}
                        onChange={e => handleEventInputChange('endsAt', e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-white">Description</label>
                    <textarea
                      value={newEvent.description}
                      onChange={e => handleEventInputChange('description', e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white min-h-[80px]"
                      placeholder="Describe the event, special rewards, or rules."
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-white">Banner Image</label>
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={handleBannerFileChange}
                      className="w-full text-sm text-slate-200 file:mr-4 file:cursor-pointer file:rounded file:border-0 file:bg-red-600 file:px-3 file:py-2 file:text-white"
                    />
                    <p className="text-xs text-slate-400">
                      Upload a PNG or JPEG banner. Only the current event banner is stored.
                    </p>
                    {bannerUploading && (
                      <div className="text-xs text-slate-300">Uploading banner...</div>
                    )}
                    {bannerUploadError && (
                      <div className="text-xs text-red-300">{bannerUploadError}</div>
                    )}
                    {bannerPreviewSrc && (
                      <div className="flex flex-col gap-2 rounded border border-slate-700 bg-slate-900 p-3">
                        <div className="flex items-start gap-3">
                          <img
                            src={bannerPreviewSrc}
                            alt="Event banner preview"
                            className="h-24 w-40 rounded object-cover"
                          />
                          <div className="flex flex-col gap-2 text-xs text-slate-300">
                            <span>Current banner preview</span>
                            <div className="flex flex-wrap gap-3">
                              {bannerDisplayUrl && (
                                <a
                                  href={bannerDisplayUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:underline text-sm"
                                >
                                  Open full image
                                </a>
                              )}
                              <button
                                type="button"
                                onClick={handleClearBanner}
                                className="text-red-300 hover:text-red-200 text-sm"
                              >
                                Remove banner
                              </button>
                            </div>
                          </div>
                        </div>
                        {bannerDisplayUrl && (
                          <code className="break-all text-xs text-slate-400">
                            {bannerDisplayUrl}
                          </code>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white">Allowed Formats</label>
                      <div className="flex flex-wrap gap-2">
                        {FORMAT_OPTIONS.map(format => (
                          <button
                            type="button"
                            key={format}
                            onClick={() => handleEventInputChange('formats', toggleSelection(newEvent.formats, format))}
                            className={`px-3 py-1 rounded border ${
                              newEvent.formats.includes(format) ? 'bg-red-600 border-red-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-300'
                            }`}
                          >
                            {format}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-slate-400">Leave all selected to allow any format.</p>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white">Allowed Modes</label>
                      <div className="flex flex-wrap gap-2">
                        {MODE_OPTIONS.map(mode => (
                          <button
                            type="button"
                            key={mode}
                            onClick={() => handleEventInputChange('modes', toggleSelection(newEvent.modes, mode))}
                            className={`px-3 py-1 rounded border ${
                              newEvent.modes.includes(mode) ? 'bg-red-600 border-red-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-300'
                            }`}
                          >
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white">Buy-In Range (Coins)</label>
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={newEvent.minCoins !== undefined ? String(newEvent.minCoins) : ''}
                          onChange={e => handleEventInputChange('minCoins', e.target.value ? Number(e.target.value) : undefined)}
                          className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                        >
                          <option value="">Min</option>
                          {COIN_OPTION_VALUES.map(value => (
                            <option key={`min-${value}`} value={value}>{formatCoins(value)}</option>
                          ))}
                        </select>
                        <select
                          value={newEvent.maxCoins !== undefined ? String(newEvent.maxCoins) : ''}
                          onChange={e => handleEventInputChange('maxCoins', e.target.value ? Number(e.target.value) : undefined)}
                          className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                        >
                          <option value="">Max</option>
                          {COIN_OPTION_VALUES.map(value => (
                            <option key={`max-${value}`} value={value}>{formatCoins(value)}</option>
                          ))}
                        </select>
                      </div>
                      <p className="text-xs text-slate-400">Leave blank to allow any buy-in.</p>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-semibold text-white">Points</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          min={-250}
                          max={-100}
                          step={50}
                          value={newEvent.minPoints ?? ''}
                          onChange={e => handleEventInputChange('minPoints', e.target.value ? Number(e.target.value) : undefined)}
                          className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                          placeholder="Min points"
                        />
                        <input
                          type="number"
                          min={100}
                          max={650}
                          step={50}
                          value={newEvent.maxPoints ?? ''}
                          onChange={e => handleEventInputChange('maxPoints', e.target.value ? Number(e.target.value) : undefined)}
                          className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white"
                          placeholder="Max points"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">Nil Bids</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleEventInputChange('nilAllowed', true)}
                          className={`px-3 py-1 rounded border ${
                            newEvent.nilAllowed === true ? 'bg-red-600 border-red-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-300'
                          }`}
                        >
                          Enabled
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEventInputChange('nilAllowed', false)}
                          className={`px-3 py-1 rounded border ${
                            newEvent.nilAllowed === false ? 'bg-red-600 border-red-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-300'
                          }`}
                        >
                          Disabled
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEventInputChange('nilAllowed', null)}
                          className={`px-3 py-1 rounded border ${
                            newEvent.nilAllowed === null ? 'bg-red-900 border-red-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-300'
                          }`}
                        >
                          Any
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">Blind Nil</label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleEventInputChange('blindNilAllowed', true)}
                          className={`px-3 py-1 rounded border ${
                            newEvent.blindNilAllowed === true ? 'bg-red-600 border-red-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-300'
                          }`}
                        >
                          Enabled
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEventInputChange('blindNilAllowed', false)}
                          className={`px-3 py-1 rounded border ${
                            newEvent.blindNilAllowed === false ? 'bg-red-600 border-red-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-300'
                          }`}
                        >
                          Disabled
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEventInputChange('blindNilAllowed', null)}
                          className={`px-3 py-1 rounded border ${
                            newEvent.blindNilAllowed === null ? 'bg-red-900 border-red-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-300'
                          }`}
                        >
                          Any
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">Special Rule #1</label>
                      <div className="flex flex-wrap gap-2">
                        {SPECIAL_RULE1_OPTIONS.map(rule => (
                          <button
                            type="button"
                            key={rule}
                            onClick={() => handleEventInputChange('specialRule1', toggleSelection(newEvent.specialRule1, rule))}
                            className={`px-3 py-1 rounded border ${
                              newEvent.specialRule1.includes(rule) ? 'bg-red-600 border-red-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-300'
                            }`}
                          >
                            {rule}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">Special Rule #2</label>
                      <div className="flex flex-wrap gap-2">
                        {SPECIAL_RULE2_OPTIONS.map(rule => (
                          <button
                            type="button"
                            key={rule}
                            onClick={() => handleEventInputChange('specialRule2', toggleSelection(newEvent.specialRule2, rule))}
                            className={`px-3 py-1 rounded border ${
                              newEvent.specialRule2.includes(rule) ? 'bg-red-600 border-red-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-300'
                            }`}
                          >
                            {rule}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-white mb-2">Allowed Gimmicks</label>
                      <div className="flex flex-wrap gap-2">
                        {GIMMICK_OPTIONS.map(variant => (
                          <button
                            type="button"
                            key={variant}
                            onClick={() => handleEventInputChange('gimmickVariants', toggleSelection(newEvent.gimmickVariants, variant))}
                            className={`px-3 py-1 rounded border ${
                              newEvent.gimmickVariants.includes(variant) ? 'bg-red-600 border-red-500 text-white' : 'bg-slate-900 border-slate-700 text-slate-300'
                            }`}
                          >
                            {variant}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">Only applies if Gimmick format is enabled.</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-white font-semibold text-base">Rewards</h4>
                      <button
                        type="button"
                        onClick={addCriterion}
                        className="px-3 py-1 text-sm rounded bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        Add Reward
                      </button>
                    </div>
                    <div className="space-y-3">
                      {newEvent.criteria.map((criterion, index) => (
                        <div key={index} className="bg-slate-900 border border-slate-700 rounded p-3 grid md:grid-cols-12 gap-3 items-end">
                          <div className="md:col-span-4 space-y-1">
                            <label className="text-xs uppercase tracking-wide text-slate-400">Type</label>
                            <select
                              value={criterion.type}
                              onChange={e => updateCriterion(index, { type: e.target.value as EventCriterionForm['type'] })}
                              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2 text-white text-sm"
                            >
                              {Object.entries(criterionTypeLabels).map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                              ))}
                            </select>
                          </div>
                          <div className="md:col-span-3 space-y-1">
                            <label className="text-xs uppercase tracking-wide text-slate-400">Reward Coins</label>
                            <select
                              value={String(criterion.rewardCoins)}
                              onChange={e => updateCriterion(index, { rewardCoins: Number(e.target.value) })}
                              className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2 text-white text-sm"
                            >
                              {COIN_OPTION_VALUES.map(value => (
                                <option key={`reward-${value}`} value={value}>{formatCoins(value)}</option>
                              ))}
                            </select>
                          </div>
                          {(criterion.type === 'GAMES_PLAYED_MILESTONE' || criterion.type === 'GAMES_WON_MILESTONE') && (
                            <div className="md:col-span-3 space-y-1">
                              <label className="text-xs uppercase tracking-wide text-slate-400">Milestone Count</label>
                              <input
                                type="number"
                                min={1}
                                value={criterion.milestoneValue ?? ''}
                                onChange={e =>
                                  updateCriterion(index, {
                                    milestoneValue: e.target.value ? Math.max(1, Number(e.target.value)) : undefined,
                                  })
                                }
                                className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-2 text-white text-sm"
                              />
                            </div>
                          )}
                          <div className="md:col-span-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() => removeCriterion(index)}
                              className="px-3 py-2 text-sm rounded bg-red-600 hover:bg-red-700 text-white"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {eventError && (
                    <div className="bg-red-900 border border-red-700 text-red-100 rounded px-3 py-2 text-sm">
                      {eventError}
                    </div>
                  )}
                  {eventSuccessMessage && (
                    <div className="bg-emerald-900 border border-emerald-600 text-emerald-100 rounded px-3 py-2 text-sm">
                      {eventSuccessMessage}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={creatingEvent}
                      className="px-4 py-2 rounded bg-red-600 hover:bg-red-700 text-white disabled:bg-slate-600"
                    >
                      {creatingEvent ? 'Saving...' : 'Create Event'}
                    </button>
                  </div>
                </form>

                <div className="flex items-center justify-between">
                  <h4 className="text-white font-semibold text-lg">Recent Events</h4>
                  <button
                    onClick={fetchEvents}
                    disabled={eventsLoading}
                    className="px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white text-sm disabled:bg-slate-600"
                  >
                    {eventsLoading ? 'Refreshing...' : 'Refresh'}
                  </button>
                </div>

                {eventsLoading ? (
                  <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 text-center text-slate-400">
                    Loading events...
                  </div>
                ) : eventError && !eventSuccessMessage ? (
                  <div className="bg-red-900 border border-red-700 rounded px-3 py-2 text-sm text-red-100">
                    {eventError}
                  </div>
                ) : events.length === 0 ? (
                  <div className="bg-slate-800 rounded-lg border border-slate-700 p-6 text-center text-slate-400">
                    No events created yet.
                  </div>
                ) : (
                  <div>{events.map(renderEventCard)}</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminPanel;

