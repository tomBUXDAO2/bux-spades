import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface TournamentRegistration {
  id: string;
  userId: string;
  partnerId: string | null;
  isComplete: boolean;
  isSub: boolean;
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
                {(() => {
                  // Build team ID to players map
                  const teamIdToPlayers = new Map<string, Array<{ username: string; avatarUrl?: string | null }>>();
                  tournament.registrations.forEach(reg => {
                    if (reg.partnerId && reg.isComplete) {
                      const teamId = `team_${reg.userId}_${reg.partnerId}`;
                      if (!teamIdToPlayers.has(teamId)) {
                        teamIdToPlayers.set(teamId, [
                          { username: reg.user.username, avatarUrl: reg.user.avatarUrl },
                          { username: reg.partner?.username || 'Unknown', avatarUrl: reg.partner?.avatarUrl },
                        ]);
                      }
                    } else if (!reg.partnerId && !reg.isSub) {
                      const teamId = `team_${reg.userId}`;
                      teamIdToPlayers.set(teamId, [
                        { username: reg.user.username, avatarUrl: reg.user.avatarUrl },
                      ]);
                    }
                  });

                  const getTeamDisplay = (teamId: string | null) => {
                    if (!teamId) return { name: 'TBD', players: [] };
                    
                    // Check if already mapped
                    let players = teamIdToPlayers.get(teamId);
                    if (players) {
                      return { 
                        name: players.map(p => p.username).join(' & '), 
                        players 
                      };
                    }
                    
                    // Parse team ID format: team_userId1_userId2 or team_userId
                    if (teamId.startsWith('team_')) {
                      const parts = teamId.replace('team_', '').split('_');
                      const playerUsernames: string[] = [];
                      
                      for (const userId of parts) {
                        // Find user in registrations
                        const reg = tournament.registrations.find(r => r.userId === userId);
                        if (reg) {
                          playerUsernames.push(reg.user.username);
                        } else {
                          // Try to find as partner
                          const partnerReg = tournament.registrations.find(r => r.partnerId === userId);
                          if (partnerReg) {
                            playerUsernames.push(partnerReg.partner?.username || 'Unknown');
                          } else {
                            playerUsernames.push('Unknown');
                          }
                        }
                      }
                      
                      if (playerUsernames.length > 0) {
                        return {
                          name: playerUsernames.join(' & '),
                          players: playerUsernames.map(username => ({ username, avatarUrl: null }))
                        };
                      }
                    }
                    
                    // Fallback: return team ID as name
                    return { name: teamId, players: [] };
                  };

                  // Check if double elimination
                  const isDoubleElimination = tournament.eliminationType === 'DOUBLE';
                  
                  if (isDoubleElimination) {
                    // Separate winners and losers brackets
                    const winnersMatches = tournament.matches.filter(m => m.round < 1000 && m.round % 100 === 0);
                    const losersMatches = tournament.matches.filter(m => m.round < 1000 && m.round % 100 !== 0);
                    const grandFinals = tournament.matches.filter(m => m.round === 1000);

                    // Group by round
                    const winnersByRound = new Map<number, typeof tournament.matches>();
                    winnersMatches.forEach(m => {
                      const round = m.round / 100;
                      if (!winnersByRound.has(round)) {
                        winnersByRound.set(round, []);
                      }
                      winnersByRound.get(round)!.push(m);
                    });

                    const losersByRound = new Map<number, typeof tournament.matches>();
                    losersMatches.forEach(m => {
                      const round = m.round;
                      if (!losersByRound.has(round)) {
                        losersByRound.set(round, []);
                      }
                      losersByRound.get(round)!.push(m);
                    });

                    const winnersRounds = Array.from(winnersByRound.keys()).sort((a, b) => a - b);
                    const losersRounds = Array.from(losersByRound.keys()).sort((a, b) => a - b);

                    return (
                      <div className="space-y-8">
                        {/* Winners Bracket */}
                        <div>
                          <h3 className="text-xl font-bold mb-4 text-green-400">Winners Bracket</h3>
                          <div className="overflow-x-auto">
                            <div className="flex gap-4 min-w-max">
                              {winnersRounds.map((roundNum, idx) => {
                                const roundMatches = winnersByRound.get(roundNum)!;
                                const roundName = roundNum === winnersRounds.length ? 'Final' :
                                                 roundNum === winnersRounds.length - 1 ? 'Semi-Finals' :
                                                 roundNum === winnersRounds.length - 2 ? 'Quarter-Finals' :
                                                 `Round ${roundNum}`;
                                
                                return (
                                  <div key={roundNum} className="flex flex-col gap-2 min-w-[200px]">
                                    <div className="text-center font-semibold text-white mb-2 text-sm">{roundName}</div>
                                    {roundMatches.map((match, matchIdx) => {
                                      const team1 = getTeamDisplay(match.team1Id);
                                      const team2 = getTeamDisplay(match.team2Id);
                                      const winner = match.winnerId ? getTeamDisplay(match.winnerId) : null;
                                      const isBye = match.status === 'COMPLETED' && !match.team2Id;

                                      return (
                                        <div
                                          key={match.id}
                                          className={`bg-slate-700 rounded p-2 border ${
                                            match.status === 'COMPLETED' ? 'border-yellow-500' : 
                                            match.status === 'IN_PROGRESS' ? 'border-blue-500' : 
                                            'border-slate-600'
                                          }`}
                                        >
                                          <div className="text-xs text-slate-400 mb-1">M{match.matchNumber}</div>
                                          <div className={`text-xs py-1 px-2 rounded mb-1 ${winner && winner.name === team1.name ? 'bg-yellow-600 text-white font-semibold' : 'bg-slate-600 text-white'}`}>
                                            {team1.name}
                                          </div>
                                          {team2.name !== 'TBD' && !isBye ? (
                                            <div className={`text-xs py-1 px-2 rounded ${winner && winner.name === team2.name ? 'bg-yellow-600 text-white font-semibold' : 'bg-slate-600 text-white'}`}>
                                              {team2.name}
                                            </div>
                                          ) : isBye ? (
                                            <div className="text-xs text-yellow-400 italic">BYE</div>
                                          ) : (
                                            <div className="text-xs text-slate-500 italic">TBD</div>
                                          )}
                                          {match.gameId && (
                                            <div className="text-xs text-blue-400 mt-1">Game: {match.gameId.slice(-8)}</div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Losers Bracket */}
                        {losersRounds.length > 0 && (
                          <div>
                            <h3 className="text-xl font-bold mb-4 text-red-400">Losers Bracket</h3>
                            <div className="overflow-x-auto">
                              <div className="flex gap-4 min-w-max">
                                {losersRounds.map((roundNum) => {
                                  const roundMatches = losersByRound.get(roundNum)!;
                                  
                                  return (
                                    <div key={roundNum} className="flex flex-col gap-2 min-w-[200px]">
                                      <div className="text-center font-semibold text-white mb-2 text-sm">Round {roundNum}</div>
                                      {roundMatches.map((match) => {
                                        const team1 = getTeamDisplay(match.team1Id);
                                        const team2 = getTeamDisplay(match.team2Id);
                                        const winner = match.winnerId ? getTeamDisplay(match.winnerId) : null;

                                        return (
                                          <div
                                            key={match.id}
                                            className={`bg-slate-700 rounded p-2 border ${
                                              match.status === 'COMPLETED' ? 'border-yellow-500' : 
                                              match.status === 'IN_PROGRESS' ? 'border-blue-500' : 
                                              'border-slate-600'
                                            }`}
                                          >
                                            <div className="text-xs text-slate-400 mb-1">M{match.matchNumber}</div>
                                            <div className={`text-xs py-1 px-2 rounded mb-1 ${winner && winner.name === team1.name ? 'bg-yellow-600 text-white font-semibold' : 'bg-slate-600 text-white'}`}>
                                              {team1.name}
                                            </div>
                                            <div className={`text-xs py-1 px-2 rounded ${winner && winner.name === team2.name ? 'bg-yellow-600 text-white font-semibold' : 'bg-slate-600 text-white'}`}>
                                              {team2.name !== 'TBD' ? team2.name : 'TBD'}
                                            </div>
                                            {match.gameId && (
                                              <div className="text-xs text-blue-400 mt-1">Game: {match.gameId.slice(-8)}</div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Grand Finals */}
                        {grandFinals.length > 0 && (
                          <div>
                            <h3 className="text-xl font-bold mb-4 text-yellow-400">Grand Finals</h3>
                            <div className="flex justify-center">
                              <div className="flex flex-col gap-2 min-w-[200px]">
                                {grandFinals.map((match) => {
                                  const team1 = getTeamDisplay(match.team1Id);
                                  const team2 = getTeamDisplay(match.team2Id);
                                  const winner = match.winnerId ? getTeamDisplay(match.winnerId) : null;

                                  return (
                                    <div
                                      key={match.id}
                                      className={`bg-slate-700 rounded p-3 border-2 ${
                                        match.status === 'COMPLETED' ? 'border-yellow-500' : 
                                        match.status === 'IN_PROGRESS' ? 'border-blue-500' : 
                                        'border-slate-600'
                                      }`}
                                    >
                                      <div className="text-sm text-slate-400 mb-2">Grand Finals</div>
                                      <div className={`text-sm py-2 px-3 rounded mb-2 ${winner && winner.name === team1.name ? 'bg-yellow-600 text-white font-semibold' : 'bg-slate-600 text-white'}`}>
                                        {team1.name}
                                      </div>
                                      <div className={`text-sm py-2 px-3 rounded ${winner && winner.name === team2.name ? 'bg-yellow-600 text-white font-semibold' : 'bg-slate-600 text-white'}`}>
                                        {team2.name !== 'TBD' ? team2.name : 'TBD'}
                                      </div>
                                      {match.gameId && (
                                        <div className="text-xs text-blue-400 mt-2">Game: {match.gameId.slice(-8)}</div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  } else {
                    // Single elimination bracket
                    const matchesByRound = new Map<number, typeof tournament.matches>();
                    tournament.matches.forEach(match => {
                      if (!matchesByRound.has(match.round)) {
                        matchesByRound.set(match.round, []);
                      }
                      matchesByRound.get(match.round)!.push(match);
                    });

                    const rounds = Array.from(matchesByRound.keys()).sort((a, b) => a - b);
                    const totalRounds = rounds.length;

                    const getRoundName = (roundNum: number) => {
                      if (roundNum === totalRounds) {
                        return 'Final';
                      } else if (roundNum === totalRounds - 1) {
                        return 'Semi-Finals';
                      } else if (roundNum === totalRounds - 2) {
                        return 'Quarter-Finals';
                      } else if (roundNum === totalRounds - 3) {
                        return 'Round of 16';
                      } else if (roundNum === totalRounds - 4) {
                        return 'Round of 32';
                      } else {
                        const firstRoundMatches = matchesByRound.get(1) || [];
                        const hasByes = firstRoundMatches.some(m => m.status === 'COMPLETED' && !m.team2Id);
                        return hasByes ? 'Qualifying Round' : `Round ${roundNum}`;
                      }
                    };

                    return (
                      <div className="overflow-x-auto">
                        <div className="flex gap-4 min-w-max pb-4">
                          {rounds.map((roundNum, idx) => {
                            const roundMatches = matchesByRound.get(roundNum)!;
                            const roundName = getRoundName(roundNum);
                            const isFinal = roundNum === totalRounds;

                            return (
                              <div key={roundNum} className="flex flex-col gap-2 min-w-[200px]">
                                <div className={`text-center font-semibold mb-2 ${isFinal ? 'text-yellow-400 text-lg' : 'text-white text-sm'}`}>
                                  {roundName}
                                </div>
                                {roundMatches.map((match, matchIdx) => {
                                  const team1 = getTeamDisplay(match.team1Id);
                                  const team2 = getTeamDisplay(match.team2Id);
                                  const winner = match.winnerId ? getTeamDisplay(match.winnerId) : null;
                                  const isBye = match.status === 'COMPLETED' && !match.team2Id;

                                  return (
                                    <div
                                      key={match.id}
                                      className={`bg-slate-700 rounded p-2 border ${
                                        match.status === 'COMPLETED' ? 'border-yellow-500' : 
                                        match.status === 'IN_PROGRESS' ? 'border-blue-500' : 
                                        'border-slate-600'
                                      } ${isFinal ? 'border-2' : ''}`}
                                    >
                                      <div className="text-xs text-slate-400 mb-1">M{match.matchNumber}</div>
                                      <div className={`text-xs py-1 px-2 rounded mb-1 ${winner && winner.name === team1.name ? 'bg-yellow-600 text-white font-semibold' : 'bg-slate-600 text-white'}`}>
                                        {team1.name}
                                      </div>
                                      {team2.name !== 'TBD' && !isBye ? (
                                        <div className={`text-xs py-1 px-2 rounded ${winner && winner.name === team2.name ? 'bg-yellow-600 text-white font-semibold' : 'bg-slate-600 text-white'}`}>
                                          {team2.name}
                                        </div>
                                      ) : isBye ? (
                                        <div className="text-xs text-yellow-400 italic">BYE</div>
                                      ) : (
                                        <div className="text-xs text-slate-500 italic">TBD</div>
                                      )}
                                      {match.gameId && (
                                        <div className="text-xs text-blue-400 mt-1">Game: {match.gameId.slice(-8)}</div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                          {/* Winner column */}
                          {rounds.length > 0 && (
                            <div className="flex flex-col justify-center min-w-[150px]">
                              <div className="text-center font-bold text-yellow-400 mb-2 text-lg">Winner</div>
                              <div className="bg-gradient-to-b from-yellow-600 to-yellow-700 rounded p-4 border-2 border-yellow-500 text-center">
                                <div className="text-white font-bold text-sm">
                                  {(() => {
                                    const finalMatch = matchesByRound.get(rounds[rounds.length - 1])?.[0];
                                    if (finalMatch?.winnerId) {
                                      return getTeamDisplay(finalMatch.winnerId).name;
                                    }
                                    return 'TBD';
                                  })()}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TournamentLobbyModal;

