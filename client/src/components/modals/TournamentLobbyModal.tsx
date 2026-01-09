import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface TournamentRegistration {
  id: string;
  userId: string;
  partnerId: string | null;
  isComplete: boolean;
  registeredAt: string;
  user: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  };
  partner: {
    id: string;
    username: string;
    avatarUrl?: string | null;
  } | null;
}

interface TournamentMatch {
  id: string;
  round: number;
  matchNumber: number;
  team1Id: string | null;
  team2Id: string | null;
  winnerId: string | null;
  gameId: string | null;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED';
}

interface Tournament {
  id: string;
  name: string;
  mode: 'PARTNERS' | 'SOLO';
  format: 'REGULAR' | 'WHIZ' | 'MIRROR' | 'GIMMICK';
  startTime: string;
  status: 'REGISTRATION_OPEN' | 'REGISTRATION_CLOSED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  eliminationType: 'SINGLE' | 'DOUBLE';
  buyIn: number | null;
  tournamentBuyIn: number | null;
  prizes: {
    winners?: string;
    runnersUp?: string;
  } | null;
  bannerUrl: string | null;
  minPoints: number | null;
  maxPoints: number | null;
  nilAllowed: boolean | null;
  blindNilAllowed: boolean | null;
  gimmickVariant: string | null;
  specialRules: {
    specialRule1?: string[];
    specialRule2?: string[];
  } | null;
  registrations: TournamentRegistration[];
  matches: TournamentMatch[];
}

interface TournamentLobbyModalProps {
  isOpen: boolean;
  tournamentId: string;
  onClose: () => void;
}

const TournamentLobbyModal: React.FC<TournamentLobbyModalProps> = ({ isOpen, tournamentId, onClose }) => {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3000';

  useEffect(() => {
    if (!isOpen || !tournamentId) return;

    fetchTournament();
  }, [isOpen, tournamentId]);

  const fetchTournament = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/api/tournaments/${tournamentId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch tournament');
      }
      const data = await response.json();
      setTournament(data.tournament);
    } catch (err) {
      console.error('Error fetching tournament:', err);
      setError('Failed to load tournament');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const startTimestamp = tournament ? Math.floor(new Date(tournament.startTime).getTime() / 1000) : 0;
  
  const formatCoins = (value: number | null | undefined) => {
    if (!value) return 'Free';
    if (value >= 1000000) {
      const millions = value / 1000000;
      return Number.isInteger(millions) ? `${millions}M` : `${millions.toFixed(1)}M`;
    }
    const thousands = value / 1000;
    return Number.isInteger(thousands) ? `${thousands}k` : `${thousands.toFixed(1)}k`;
  };

  const entryFeeStr = tournament?.tournamentBuyIn 
    ? `${formatCoins(tournament.tournamentBuyIn)} coins`
    : 'Free Entry';
  
  const tableBuyInStr = tournament?.buyIn 
    ? `${formatCoins(tournament.buyIn)} coins per game`
    : 'Free Games';

  // Calculate teams and unpartnered players
  const completeTeams = tournament?.registrations.filter(reg => reg.partnerId && reg.isComplete) || [];
  const unpartneredPlayers = tournament?.registrations.filter(reg => !reg.partnerId) || [];

  // Group registrations into teams
  const teams: Array<{ player1: TournamentRegistration; player2?: TournamentRegistration }> = [];
  const processedIds = new Set<string>();
  
  tournament?.registrations.forEach(reg => {
    if (processedIds.has(reg.id)) return;
    
    if (reg.partnerId && reg.isComplete) {
      const partner = tournament.registrations.find(r => r.userId === reg.partnerId && r.partnerId === reg.userId);
      if (partner) {
        teams.push({ player1: reg, player2: partner });
        processedIds.add(reg.id);
        processedIds.add(partner.id);
      }
    } else if (!reg.partnerId) {
      teams.push({ player1: reg });
      processedIds.add(reg.id);
    }
  });

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div 
        className="bg-gradient-to-b from-slate-900 to-slate-800 rounded-lg border border-slate-700 p-4 md:p-8 max-w-6xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="text-white text-xl text-center py-8">Loading tournament...</div>
        ) : error || !tournament ? (
          <div className="text-red-400 text-xl text-center py-8">{error || 'Tournament not found'}</div>
        ) : (
          <div className="space-y-6">
            {/* Header with close button */}
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-3xl font-bold text-white">{tournament.name}</h1>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white text-2xl font-bold"
              >
                ×
              </button>
            </div>

            {/* Tournament Banner */}
            {tournament.bannerUrl && (
              <div className="rounded-lg overflow-hidden mb-6">
                <img
                  src={tournament.bannerUrl.startsWith('http') ? tournament.bannerUrl : `${apiBaseUrl}${tournament.bannerUrl}`}
                  alt={tournament.name}
                  className="w-full h-64 object-cover"
                />
              </div>
            )}

            {/* Tournament Details */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <div className="grid md:grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-slate-400 text-sm mb-1">Start Time</p>
                  <p className="text-white font-semibold">
                    <span className="font-mono">{new Date(tournament.startTime).toLocaleString()}</span>
                    {' '}(Discord: <span className="font-mono">&lt;t:{startTimestamp}:F&gt;</span>)
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm mb-1">Status</p>
                  <p className="text-white font-semibold capitalize">{tournament.status.replace('_', ' ')}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm mb-1">Mode & Format</p>
                  <p className="text-white font-semibold">{tournament.mode} • {tournament.format}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm mb-1">Elimination</p>
                  <p className="text-white font-semibold">
                    {tournament.eliminationType === 'DOUBLE' ? 'Double (lose twice to be eliminated)' : 'Single'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm mb-1">Entry Fee</p>
                  <p className="text-white font-semibold">{entryFeeStr}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm mb-1">Table Buy-in</p>
                  <p className="text-white font-semibold">{tableBuyInStr}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-sm mb-1">Points Range</p>
                  <p className="text-white font-semibold">
                    {tournament.minPoints || -100} to {tournament.maxPoints || 500}
                  </p>
                </div>
              </div>

              {/* Prizes */}
              {tournament.prizes && (tournament.prizes.winners || tournament.prizes.runnersUp) && (
                <div className="border-t border-slate-700 pt-4 mb-4">
                  <h3 className="font-semibold mb-2 text-white">Prizes</h3>
                  {tournament.prizes.winners && (
                    <p className="text-yellow-400">🏆 Winners: {tournament.prizes.winners}</p>
                  )}
                  {tournament.prizes.runnersUp && (
                    <p className="text-gray-400">🥈 Runners-up: {tournament.prizes.runnersUp}</p>
                  )}
                </div>
              )}

              {/* Registration Notice */}
              <div className="bg-blue-900/30 border border-blue-700 rounded p-4 mt-4">
                <p className="text-blue-200 text-sm">
                  <strong>Note:</strong> Registration must be done via the Discord Join button in the #tournaments channel. 
                  Only members of the Discord server can register.
                </p>
              </div>
            </div>

            {/* Registered Teams */}
            <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
              <h2 className="text-2xl font-bold mb-4 text-white">Registered Teams</h2>
              <div className="mb-4 text-slate-400">
                <p>Complete Teams: {completeTeams.length / 2}</p>
                <p>Players without Partner: {unpartneredPlayers.length}</p>
                <p>Total Registrations: {tournament.registrations.length}</p>
              </div>

              {teams.length === 0 ? (
                <p className="text-slate-400">No registrations yet.</p>
              ) : (
                <div className="space-y-3">
                  {teams.map((team, index) => (
                    <div key={index} className="bg-slate-700 rounded p-4">
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                          {team.player1.user.avatarUrl && (
                            <img
                              src={team.player1.user.avatarUrl}
                              alt={team.player1.user.username}
                              className="w-8 h-8 rounded-full"
                            />
                          )}
                          <span className="font-semibold text-white">{team.player1.user.username}</span>
                        </div>
                        {team.player2 ? (
                          <>
                            <span className="text-slate-400">+</span>
                            <div className="flex items-center gap-2">
                              {team.player2.user.avatarUrl && (
                                <img
                                  src={team.player2.user.avatarUrl}
                                  alt={team.player2.user.username}
                                  className="w-8 h-8 rounded-full"
                                />
                              )}
                              <span className="font-semibold text-white">{team.player2.user.username}</span>
                            </div>
                          </>
                        ) : (
                          <span className="text-slate-500 italic">(needs partner)</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bracket */}
            {tournament.matches.length > 0 && (
              <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
                <h2 className="text-2xl font-bold mb-4 text-white">Tournament Bracket</h2>
                <div className="text-slate-400">
                  <p>Bracket will be generated when registration closes.</p>
                  <p className="text-sm mt-2">Matches: {tournament.matches.length}</p>
                </div>
                {/* TODO: Render bracket visualization */}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TournamentLobbyModal;

