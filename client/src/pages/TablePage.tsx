import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSocketManager } from '../table-ui/lib/socketManager';
import GameTable from '../table-ui/game/GameTable';
import type { GameState } from '../types/game';
import type { Socket } from 'socket.io-client';
import { socketApi } from '../table-ui/lib/socketApi';
import { api } from '@/lib/api';

export default function TablePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketManager = getSocketManager();

  // Detect spectate intent
  const isSpectator = new URLSearchParams(location.search).get('spectate') === '1';

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    socketManager.initialize(user.id, user.username);
    const newSocket = socketManager.getSocket();
    if (newSocket) {
      setSocket(newSocket);
    }

    const fetchGame = async () => {
      try {
        // If spectating, call spectate endpoint
        if (isSpectator) {
          await api.post(`/api/games/${gameId}/spectate`, {
            id: user.id,
            username: user.username,
            avatar: user.avatar
          });
        }
        const response = await api.get(`/api/games/${gameId}`);
        if (response.status === 404) {
          navigate('/'); // Redirect to lobby if not found
          return;
        }
        if (!response.ok) {
          throw new Error('Failed to fetch game');
        }
        const data = await response.json();
        setGame(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load game');
      } finally {
        setIsLoading(false);
      }
    };

    fetchGame();

    return () => {
      socketManager.disconnect();
      setSocket(null);
    };
  }, [gameId, user, navigate, isSpectator]);

  // Listen for game_update events and update local game state
  useEffect(() => {
    if (!socket) return;
    const handleGameUpdate = (updatedGame: any) => {
      setGame(updatedGame);
    };
    socket.on('game_update', handleGameUpdate);
    return () => {
      socket.off('game_update', handleGameUpdate);
    };
  }, [socket]);

  // Listen for bidding_update events and update only the bidding part of the game state
  useEffect(() => {
    if (!socket) return;
    const handleBiddingUpdate = (bidding: { currentBidderIndex: number, bids: (number|null)[] }) => {
      setGame(prev => prev ? ({
        ...prev,
        bidding: {
          ...prev.bidding,
          currentBidderIndex: bidding.currentBidderIndex,
          currentPlayer: prev.players[bidding.currentBidderIndex]?.id ?? '',
          bids: bidding.bids,
        },
        // --- FIX: Also update root-level currentPlayer! ---
        currentPlayer: prev.players[bidding.currentBidderIndex]?.id ?? '',
      }) : prev);
    };
    socket.on('bidding_update', handleBiddingUpdate);
    return () => {
      socket.off('bidding_update', handleBiddingUpdate);
    };
  }, [socket]);

  const playCardSound = () => {
    try {
      const audio = new Audio('/sounds/card.wav');
      audio.volume = 0.3;
      audio.play().catch(err => console.log('Audio play failed:', err));
    } catch (error) {
      console.log('Audio not supported or failed to load:', error);
    }
  };

  const lastTrickLengthRef = useRef(0);

  // Listen for play_update events and update play state
  useEffect(() => {
    if (!socket) return;
    const handlePlayUpdate = (data: { currentPlayerIndex: number, currentTrick: any[], hands: any[] }) => {
      // Play card sound if a new card is played
      if (Array.isArray(data.currentTrick)) {
        if (data.currentTrick.length > lastTrickLengthRef.current) {
          playCardSound();
        }
        lastTrickLengthRef.current = data.currentTrick.length;
      }
      setGame(prev => prev ? ({
        ...prev,
        play: {
          ...prev.play,
          currentTrick: data.currentTrick,
        },
        hands: prev.hands?.map((h: any) => {
          // Optionally update hand counts if needed
          return h;
        }) ?? prev.hands,
        // Don't update currentPlayer from play_update - let game_update handle that
      }) : prev);
    };
    socket.on('play_update', handlePlayUpdate);
    return () => {
      socket.off('play_update', handlePlayUpdate);
    };
  }, [socket]);

  // Ensure player always (re)joins the game room on socket connect or refresh
  useEffect(() => {
    if (socket && socket.connected && user && gameId) {
      socket.emit('join_game', { gameId, userId: user.id });
    }
  }, [socket, user, gameId]);

  // Only join as a player if not spectating
  const handleJoinGame = async () => {
    if (!user || !gameId || isSpectator) return;
    try {
      const response = await api.post(`/api/games/${gameId}/join`, {
        id: user.id,
        username: user.username,
        avatar: user.avatar
      });
      if (!response.ok) throw new Error('Failed to join game');
      const updatedGame = await response.json();
      setGame(updatedGame);
    } catch (error) {
      console.error('Error joining game:', error);
    }
  };

  const handleLeaveTable = async () => {
    if (!gameId || !user) return;
    try {
      await api.post(`/api/games/${gameId}/leave`, { id: user.id });
      window.location.href = '/';
    } catch (error) {
      console.error('Error leaving game:', error);
    }
  };

  const handleStartGame = async () => {
    if (!socket || !gameId || !user) return;
    try {
      console.log('Starting game:', gameId);
      await socketApi.startGame(socket, gameId);
    } catch (error) {
      console.error('Error starting game:', error);
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!game) {
    return <div>Game not found</div>;
  }

  return (
    <div className="table-page">
      <GameTable
        game={game}
        joinGame={handleJoinGame}
        onLeaveTable={handleLeaveTable}
        startGame={handleStartGame}
        user={user}
      />
    </div>
  );
} 