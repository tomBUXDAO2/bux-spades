import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getSocketManager } from '../table-ui/lib/socketManager';
import GameTable from '../table-ui/game/GameTable';
import type { GameState } from '../types/game';
import type { Socket } from 'socket.io-client';
import { socketApi } from '../table-ui/lib/socketApi';

export default function TablePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [socket, setSocket] = useState<Socket | null>(null);
  const socketManager = getSocketManager();

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    const newSocket = socketManager.initialize({ user });
    if (newSocket) {
      setSocket(newSocket);
    }

    const fetchGame = async () => {
      try {
        const response = await fetch(`/api/games/${gameId}`);
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
  }, [gameId, user, navigate]);

  const handleJoinGame = async () => {
    if (!user || !gameId) return;
    try {
      const response = await fetch(`/api/games/${gameId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: user.id,
          username: user.username,
          avatar: user.avatar
        }),
      });
      if (!response.ok) throw new Error('Failed to join game');
      const updatedGame = await response.json();
      setGame(updatedGame);
    } catch (error) {
      console.error('Error joining game:', error);
    }
  };

  const handleLeaveTable = async () => {
    if (!socket || !gameId || !user) return;
    try {
      socket.emit('leave_game', { gameId, userId: user.id });
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
        socket={socket}
        joinGame={handleJoinGame}
        onLeaveTable={handleLeaveTable}
        startGame={handleStartGame}
        user={user}
      />
    </div>
  );
} 