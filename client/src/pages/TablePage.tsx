import { playCardSound } from '@/utils/soundUtils';
import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import GameTable from '../table-ui/game/GameTable';
import type { GameState } from '../types/game';

import { socketApi } from '../table-ui/lib/socketApi';
import { api } from '@/lib/api';
import LandscapePrompt from '../LandscapePrompt';

export default function TablePage() {
  console.log('🚨🚨🚨 [CRITICAL DEBUG] TablePage component loaded at:', new Date().toISOString());
  const { gameId } = useParams<{ gameId: string }>(); console.log('[TABLE PAGE DEBUG] gameId from useParams:', gameId);
  const { user } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Modal state
  const [showStartWarning, setShowStartWarning] = useState(false);
  const [showBotWarning, setShowBotWarning] = useState(false);
  const [emptySeats, setEmptySeats] = useState(0);
  const [botCount, setBotCount] = useState(0);
  // Closure popup now shown on HomePage after redirect
  // Animation state to prevent currentTrick updates during trick animation
  const [isAnimatingTrick, setIsAnimatingTrick] = useState(false);

  // Detect spectate intent
  const isSpectator = new URLSearchParams(location.search).get('spectate') === '1';
  const [isSpectatorLocal, setIsSpectatorLocal] = useState(isSpectator);

  // Check if device is mobile or tablet
  const isMobileOrTablet = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           window.innerWidth <= 1024;
  };

  // Helper function to check if a player is a bot

  // Helper function to count empty seats and bot players
  const updateModalState = (gameState: GameState) => {
    // Determine occupied seats from player.position or seatIndex
    const players = (gameState.players || []).filter(Boolean) as any[];
    const occupied = new Set<number>();
    players.forEach(p => {
      const seat = (p as any).position ?? (p as any).seatIndex;
      if (typeof seat === 'number' && seat >= 0 && seat <= 3) occupied.add(seat);
    });
    const emptySeatsCount = 4 - occupied.size;
    const botPlayersCount = players.filter(p => (p as any)?.type === 'bot').length;
    setEmptySeats(emptySeatsCount);
    setBotCount(botPlayersCount);
  };

  // Request full-screen mode (only for game table)
  const requestFullScreen = async () => {
    if (isMobileOrTablet()) {
      try {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        } else if ((document.documentElement as any).webkitRequestFullscreen) {
          await (document.documentElement as any).webkitRequestFullscreen();
        } else if ((document.documentElement as any).msRequestFullscreen) {
          await (document.documentElement as any).msRequestFullscreen();
        }
        setIsFullScreen(true);
      } catch (error) {
        console.log('Full-screen request failed:', error);
      }
    }
  };

  // Exit full-screen mode
  const exitFullScreen = async () => {
    try {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if ((document as any).webkitExitFullscreen) {
        await (document as any).webkitExitFullscreen();
      } else if ((document as any).msExitFullscreen) {
        await (document as any).msExitFullscreen();
      }
      setIsFullScreen(false);
    } catch (error) {
      console.log('Exit full-screen failed:', error);
    }
  };

  // Listen for full-screen changes
  useEffect(() => {
    const handleFullScreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullScreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullScreenChange);
    document.addEventListener('msfullscreenchange', handleFullScreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullScreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullScreenChange);
      document.removeEventListener('msfullscreenchange', handleFullScreenChange);
    };
  }, []);

  // Debug logging for game state changes
  useEffect(() => {
    console.log('[REFRESH DEBUG] Component mounted/updated, game state:', game ? 'exists' : 'null');
    if (game) {
      console.log('[GAME STATE DEBUG] Game state updated:', {
        currentPlayer: game.currentPlayer,
        status: game.status,
        playCurrentPlayer: game.play?.currentPlayer,
        biddingCurrentPlayer: game.bidding?.currentPlayer
      });
    }
  }, [game]);

  // On auto-disconnect (timeouts), waiting-timeout close, or game deletion, set a closure message and redirect home
  useEffect(() => {
    if (!socket || !user) return;

    const triggerClosure = (message: string) => {
      try {
        localStorage.setItem('tableClosureMessage', message);
        localStorage.removeItem('activeGameId');
      } catch {}
      navigate('/', { replace: true });
    };

    const handleAutoDisconnect = (data: { playerId: string }) => {
      if (data.playerId === user.id) {
        triggerClosure('You were removed from the table after 3 consecutive timeouts.');
      }
    };

    const handleGameDeleted = () => {
      // Do not show any popup for no-human-players case; just return home
      try { localStorage.removeItem('activeGameId'); } catch {}
      navigate('/', { replace: true });
    };

    const handleGameClosed = (data: { reason?: string }) => {
      if (data?.reason === 'game_timeout_waiting_too_long') {
        triggerClosure('The table was closed due to 15 minute inactivity');
      } else {
        triggerClosure('The table was closed.');
      }
    };

    socket.off('game_closed', handleGameClosed);
    socket.on('player_auto_disconnect', handleAutoDisconnect);
    socket.on('game_deleted', handleGameDeleted);
    socket.on('game_closed', handleGameClosed);

    return () => {
      socket.off('game_closed', handleGameClosed);
    };
  }, [socket, user]);

  // Initialize socket and fetch game
  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }

    console.log('[INIT] Starting initialization sequence for game:', gameId);
    
    // Persist active game id immediately for reconnect logic
    if (gameId && gameId !== 'undefined') { try { localStorage.setItem('activeGameId', String(gameId)); } catch {} }
    
    // Socket is now managed by SocketContext

    const fetchGame = async (retryCount = 0) => {
      try {
        console.log(`[GAME FETCH] Attempting to fetch game ${gameId} (attempt ${retryCount + 1})`);
        
        // If spectating, call spectate endpoint
        if (isSpectator) {
          await api.post(`/api/games/${gameId}/spectate`, {
            id: user.id,
            username: user.username,
            avatar: user.avatarUrl
          });
        }
        const response = await api.get(`/api/games/${gameId}`);
        if (response.status === 404) {
          navigate('/'); // Redirect to lobby if not found
          return;
        }
        if (!response.ok) {
          throw new Error(`Failed to fetch game: ${response.status}`);
        }
        const responseData = await response.json(); const data = responseData.game;
        
        // Ensure currentPlayer is set correctly
        if (data.status === 'BIDDING' && data.bidding?.currentPlayer) {
          data.currentPlayer = data.bidding.currentPlayer;
        } else if (data.status === 'PLAYING' && data.play?.currentPlayer) {
          data.currentPlayer = data.play.currentPlayer;
        }
        
        setGame(data);
        // Update modal state for initial game load
        updateModalState(data);
        
        // Check if this is a league game and if user is assigned to it
        const isLeagueGame = (data as any).league;
        const isUserInGame = data.players.some((player: any) => player && player.id === user.id);
        const isUserAssignedToLeagueGame = isLeagueGame && isUserInGame;
        
        console.log('[LEAGUE GAME DEBUG] Checking game and user status:', {
          userId: user.id,
          isLeagueGame,
          isUserInGame,
          isUserAssignedToLeagueGame,
          isSpectator,
          gameStatus: data.status,
          gamePlayers: data.players.map((p: any) => p ? { id: p.id, username: p.username } : null)
        });
        
        // For league games, if user is assigned and not spectating, auto-join them
        if (isUserAssignedToLeagueGame && !isSpectator) {
          console.log('[LEAGUE GAME] User is assigned to this league game, auto-joining...');
          // Auto-join the user to the game
          try {
            const joinResponse = await api.post(`/api/games/${gameId}/join`, {
              id: user.id,
              username: user.username,
              avatar: user.avatarUrl
            });
            if (joinResponse.ok) {
              const updatedGame = await joinResponse.json();
              setGame(prevGame => ({ ...prevGame, ...updatedGame }));
              updateModalState(updatedGame);
              console.log('[LEAGUE GAME] Successfully auto-joined user to game');
            } else {
              const errorData = await joinResponse.json();
              console.error('[LEAGUE GAME] Failed to auto-join user to game:', errorData);
            }
          } catch (error) {
            console.error('[LEAGUE GAME] Error auto-joining user to game:', error);
          }
        } else if (isUserAssignedToLeagueGame && isSpectator) {
          // If user is assigned to league game but accessing as spectator, redirect them to player view
          console.log('[LEAGUE GAME] User is assigned to league game but accessing as spectator, redirecting to player view');
          navigate(`/table/${gameId}`, { replace: true });
        }
        
        // ADDITIONAL: Auto-join any user who is assigned to a seat in a WAITING game (fallback for non-league games)
        if (!isUserInGame && !isSpectator && data.status === 'WAITING') {
          console.log('[AUTO-JOIN FALLBACK] User is assigned to seat in WAITING game, auto-joining...');
          try {
            const joinResponse = await api.post(`/api/games/${gameId}/join`, {
              id: user.id,
              username: user.username,
              avatar: user.avatarUrl
            });
            if (joinResponse.ok) {
              const updatedGame = await joinResponse.json();
              setGame(prevGame => ({ ...prevGame, ...updatedGame }));
              updateModalState(updatedGame);
              console.log('[AUTO-JOIN FALLBACK] Successfully auto-joined user to game');
            } else {
              const errorData = await joinResponse.json();
              console.error('[AUTO-JOIN FALLBACK] Failed to auto-join user to game:', errorData);
            }
          } catch (error) {
            console.error('[AUTO-JOIN FALLBACK] Error auto-joining user to game:', error);
          }
        }

        // ROBUSTNESS CHECK: If user is not in game but should be (based on server state), try to add them
        if (!isUserInGame && !isSpectator && data.status === 'WAITING') {
          console.log('[ROBUSTNESS CHECK] User not found in game but game is WAITING, checking if they should be added...');
          
          // Check if there are empty seats and user should be in this game
          const emptySeats = data.players.filter((player: any) => !player);
          if (emptySeats.length > 0) {
            console.log('[ROBUSTNESS CHECK] Found empty seats, attempting to add user to game...');
            try {
              const joinResponse = await api.post(`/api/games/${gameId}/join`, {
                id: user.id,
                username: user.username,
                avatar: user.avatarUrl
              });
              if (joinResponse.ok) {
                const updatedGame = await joinResponse.json();
                setGame(prevGame => ({ ...prevGame, ...updatedGame }));
                updateModalState(updatedGame);
                console.log('[ROBUSTNESS CHECK] Successfully added user to game');
              } else {
                const errorData = await joinResponse.json();
                console.error('[ROBUSTNESS CHECK] Failed to add user to game:', errorData);
              }
            } catch (error) {
              console.error('[ROBUSTNESS CHECK] Error adding user to game:', error);
            }
          }
        }
        
        // Request full-screen on mobile/tablet after game loads
        if (isMobileOrTablet()) {
          setTimeout(() => {
            requestFullScreen();
          }, 1000); // Small delay to ensure game is loaded
        }

        // After fetching game, store activeGameId and ensure we join the socket room if socket is ready
        if (gameId && gameId !== 'undefined') { try { localStorage.setItem('activeGameId', String(gameId)); } catch {} }
        if (socket && socket.connected && !isSpectator && gameId && gameId !== 'undefined') {
          setTimeout(() => {
            if (socket && socket.connected) {
              console.log('[TABLE PAGE] Emitting join_game for game:', gameId);
              socket.emit('join_game', { gameId });
            }
          }, 300);
        }
      } catch (err) {
        console.error(`[GAME FETCH] Error fetching game (attempt ${retryCount + 1}):`, err);
        
        // Retry up to 3 times with exponential backoff
        if (retryCount < 3) {
          const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
          console.log(`[GAME FETCH] Retrying in ${delay}ms...`);
          setTimeout(() => fetchGame(retryCount + 1), delay);
          return;
        }
        
        setError(err instanceof Error ? err.message : 'Failed to load game after multiple attempts');
      } finally {
        if (retryCount === 0) {
          setIsLoading(false);
        }
      }
    };

    fetchGame();

    // Add a fallback mechanism to ensure join_game is sent
    const fallbackJoinGame = () => {
      if (socket && socket.connected && !isSpectator && gameId && gameId !== 'undefined') {
        console.log('SENDING JOIN_GAME EVENT');
        socket.emit('join_game', { gameId });
      } else {
        console.log('SOCKET NOT READY FOR JOIN_GAME');
      }
    };

    // Try to join game after a delay as fallback
    setTimeout(fallbackJoinGame, 2000);

    return () => {
      // Socket cleanup is handled by SocketContext
      // Exit full-screen when leaving the page
      if (isFullScreen) {
        exitFullScreen();
      }
    };
  }, [gameId, user, navigate, isSpectator]);

  // Re-emit join_game on socket reconnect
  useEffect(() => {
    if (!socket) return;
    const onReconnect = () => {
      try {
        const activeGameId = localStorage.getItem('activeGameId');
        if (activeGameId && !isSpectator) {
          console.log('[TABLE PAGE] Reconnect detected; rejoining game', activeGameId);
          socket.emit('join_game', { gameId: activeGameId });
        }
      } catch {}
    };
    socket.on('reconnect', onReconnect);
    return () => { socket.off('reconnect', onReconnect); };
  }, [socket, isSpectator]);

  // Listen for game_update events and update local game state
  useEffect(() => {
    if (!socket) return;
    
    const handleGameUpdate = (updatedGame: any) => {
      console.log('[GAME UPDATE] Received game update:', {
        status: updatedGame.status,
        currentPlayer: updatedGame.currentPlayer,
        biddingCurrentPlayer: updatedGame.bidding?.currentPlayer,
        playCurrentPlayer: updatedGame.play?.currentPlayer
      });
      
      // Ensure currentPlayer is set correctly
      if (updatedGame.status === 'BIDDING' && updatedGame.bidding?.currentPlayer) {
        updatedGame.currentPlayer = updatedGame.bidding.currentPlayer;
      } else if (updatedGame.status === 'PLAYING' && updatedGame.play?.currentPlayer) {
        updatedGame.currentPlayer = updatedGame.play.currentPlayer;
      }
      
      setGame(prevGame => ({ ...prevGame, ...updatedGame }));
      
      // Update modal state when game state changes
      updateModalState(updatedGame);
    };
    
    // Remove any existing listeners first to prevent duplicates
    socket.off('game_update', handleGameUpdate);
    socket.on('game_update', handleGameUpdate);
    
    // Handle table inactivity
    const handleTableInactive = (data: { reason: string; message: string }) => {
      console.log('[INACTIVITY] Table inactive event received:', data);
      try {
        localStorage.setItem('tableClosureMessage', 'The table was closed due to 15 minute inactivity');
        localStorage.removeItem('activeGameId');
      } catch {}
      navigate('/', { replace: true });
    };

    socket.off('table_inactive', handleTableInactive);
    socket.on('table_inactive', handleTableInactive);
    
    return () => {
      socket.off('game_update', handleGameUpdate);
      socket.off('table_inactive', handleTableInactive);
    };
  }, [socket, isAnimatingTrick]);

  // Listen for bidding_update events and update only the bidding part of the game state
  useEffect(() => {
    if (!socket) return;
    
      const handleBiddingUpdate = (bidding: { currentBidderIndex: number, bids: (number|null)[] }) => {
      console.log('[BIDDING UPDATE] Received bidding update:', bidding);
      
    setGame(prev => {
      if (!prev) return prev;
      
      const nextPlayer = prev.players[bidding.currentBidderIndex];
      
      const updatedGame = {
        ...prev,
        bidding: {
          ...prev.bidding,
          currentBidderIndex: bidding.currentBidderIndex,
          currentPlayer: nextPlayer?.id ?? '',
          bids: bidding.bids,
        },
        // --- CRITICAL FIX: Update root-level currentPlayer! ---
        currentPlayer: nextPlayer?.id ?? '',
      };
        
        console.log('[BIDDING UPDATE] Updated game state:', {
          currentBidderIndex: updatedGame.bidding.currentBidderIndex,
          currentPlayer: updatedGame.currentPlayer,
          bids: updatedGame.bidding.bids
        });
      
      return updatedGame;
    });
  };
    
    // Handle bidding completion
      const handleBiddingComplete = (data: { bids: (number|null)[] }) => {
    setGame(prev => {
      if (!prev) return prev;
      
              const updatedGame = {
          ...prev,
          status: 'PLAYING' as const,
          bidding: {
            ...prev.bidding,
            bids: data.bids,
          }
        };
      
      return updatedGame;
    });
  };
    
    // Handle play start
      const handlePlayStart = (data: { gameId: string, currentPlayerIndex: number, currentTrick: any[], trickNumber: number }) => {
    setGame(prev => {
      if (!prev) return prev;
      const currentPlayer = prev.players[data.currentPlayerIndex];
      
      const updatedGame = {
        ...prev,
        status: 'PLAYING' as const,
        play: {
          currentPlayer: currentPlayer?.id ?? '',
          currentPlayerIndex: data.currentPlayerIndex,
          currentTrick: isAnimatingTrick ? prev.play.currentTrick : data.currentTrick,
          trickNumber: data.trickNumber,
          spadesBroken: false
        }
      };
      
      return updatedGame;
    });
  };
    
    // Remove any existing listeners first to prevent duplicates
    socket.off('bidding_update', handleBiddingUpdate);
    socket.off('bidding_complete', handleBiddingComplete);
    socket.off('play_start', handlePlayStart);
    
    socket.on('bidding_update', handleBiddingUpdate);
    socket.on('bidding_complete', handleBiddingComplete);
    socket.on('play_start', handlePlayStart);
    
    return () => {
      socket.off('bidding_update', handleBiddingUpdate);
      socket.off('bidding_complete', handleBiddingComplete);
      socket.off('play_start', handlePlayStart);
    };
  }, [socket, isAnimatingTrick]);

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
          currentTrick: isAnimatingTrick ? prev.play.currentTrick : data.currentTrick,
        },
        hands: Array.isArray(prev.hands) ? prev.hands.map((h: any) => {
          // Optionally update hand counts if needed
          return h;
        }) : prev.hands,
        // Don't update currentPlayer from play_update - let game_update handle that
      }) : prev);
    };
    
    // Remove any existing listeners first to prevent duplicates
    socket.off('play_update', handlePlayUpdate);
    socket.on('play_update', handlePlayUpdate);
    
    return () => {
      socket.off('play_update', handlePlayUpdate);
    };
  }, [socket, isAnimatingTrick]);

  // Ensure player always (re)joins the game room on socket connect or refresh
  useEffect(() => {
    console.log('[REFRESH DEBUG] Socket effect triggered:', { 
      hasSocket: !!socket, 
      isConnected: socket?.connected, 
      hasUser: !!user, 
      hasGameId: !!gameId 
    });
    
    if (socket && socket.connected && user && gameId) {
      // Only join via socket if we're not spectating and the game exists
      if (!isSpectatorLocal) {
        console.log('[SOCKET DEBUG] Emitting join_game:', { gameId });
        // socket.emit('join_game', { gameId }); // User already in game
      } else {
        console.log('[SOCKET DEBUG] Emitting join_game_as_spectator:', { gameId });
        socket.emit('join_game_as_spectator', { gameId });
      }
    }
  }, [socket, user, gameId, isSpectatorLocal]);

  // Listen for trick animation events to control animation state
  useEffect(() => {
    if (!socket) return;
    
    const handleTrickComplete = () => {
      setIsAnimatingTrick(true);
    };
    
    const handleClearTrick = () => {
      setIsAnimatingTrick(false);
    };
    
    socket.on('trick_complete', handleTrickComplete);
    socket.on('clear_trick', handleClearTrick);
    
    return () => {
      socket.off('trick_complete', handleTrickComplete);
      socket.off('clear_trick', handleClearTrick);
    };
  }, [socket]);
  // Only join as a player if not spectating
  const handleJoinGame = async (
    gameIdParam?: string,
    userIdParam?: string,
    options?: { seat?: number; username?: string; avatar?: string }
  ) => {
    const targetGameId = gameIdParam || gameId;
    const targetUserId = userIdParam || user?.id;
    try {
      if (!targetGameId || !targetUserId) return;

      // If a specific seat is provided (e.g., spectator clicking JOIN seat), use it
      if (options?.seat !== undefined) {
        console.log('[HTTP JOIN] Spectator joining specific seat via HTTP:', { gameId: targetGameId, seat: options.seat });
        const response = await api.post(`/api/games/${targetGameId}/join`, {
          id: targetUserId,
          username: options.username ?? user?.username,
          avatar: options.avatar ?? user?.avatarUrl,
          seat: options.seat,
        });
        if (!response.ok) {
          const errorData = await response.json();
          console.error('[HTTP JOIN] Failed to join seat:', errorData);
          throw new Error(`Failed to join seat: ${errorData.error || 'Unknown error'}`);
        }
        const joinResponse = await response.json();
        const updatedGame = joinResponse.game;
        console.log('[HTTP JOIN] Joined seat successfully. Updated game:', updatedGame);

        // If server did not return game, fetch it
        let nextGame = updatedGame;
        if (!nextGame) {
          const getResp = await api.get(`/api/games/${targetGameId}`);
          const gameData = await getResp.json();
          nextGame = gameData.game || gameData; // support either shape
        }

        if (nextGame) {
          setGame(prevGame => ({ ...prevGame, ...nextGame }));
          updateModalState(nextGame);
        }

        // Now join the socket room as a player
        if (socket && socket.connected) {
          console.log('[HTTP JOIN] Emitting socket join after seat join:', { targetGameId });
          // socket.emit('join_game', { gameId: targetGameId, userId: targetUserId, timestamp: new Date().toISOString() }); // User already in game
        }

        // Flip spectator status locally
        setIsSpectatorLocal(false);
        return;
      }

      // Default behavior (non-spectator user joining without specifying a seat)
      if (isSpectatorLocal) return; // keep spectators from generic join without seat

      console.log('[HTTP JOIN] Attempting to join game via HTTP:', { gameId: targetGameId, userId: targetUserId });
      const response = await api.post(`/api/games/${targetGameId}/join`, {
        id: targetUserId,
        username: user?.username,
        avatar: user?.avatarUrl,
      });
      if (!response.ok) {
        const errorData = await response.json();
        console.error('[HTTP JOIN] Failed to join game:', errorData);
        throw new Error(`Failed to join game: ${errorData.error || 'Unknown error'}`);
      }
      const joinResponse = await response.json();
      const updatedGame = joinResponse.game;

      // If server did not return game, fetch it
      let nextGame = updatedGame;
      if (!nextGame) {
        const getResp = await api.get(`/api/games/${targetGameId}`);
        const gameData = await getResp.json();
        nextGame = gameData.game || gameData;
      }

      console.log('[HTTP JOIN] Successfully joined game:', nextGame);
      console.log('[HTTP JOIN] Game players after join:', nextGame?.players?.map((p: any, i: number) => `${i}: ${p ? p.id : 'null'}`));
      if (nextGame) {
        setGame(prevGame => ({ ...prevGame, ...nextGame }));
        updateModalState(nextGame);
      }

      if (socket && socket.connected) {
        console.log('[HTTP JOIN] Emitting socket join after successful HTTP join, socket connected:', socket.connected);
        // socket.emit('join_game', { gameId: targetGameId, userId: targetUserId, timestamp: new Date().toISOString() }); // User already in game
      } else {
        console.log('[HTTP JOIN] Socket not connected, cannot emit join_game');
      }
    } catch (error) {
      console.error('Error joining game:', error);
    }
  };

  const handleLeaveTable = async () => {
    if (!gameId || !user) return;
    try {
      await api.post(`/api/games/${gameId}/leave`, { id: user.id });
      localStorage.removeItem('activeGameId');
      navigate('/');
    } catch (error) {
      console.error('Error leaving game:', error);
    }
  };

  const handleStartGame = async () => {
    if (!socket || !gameId || !user || !game) return;
    
    // Check for empty seats first
    if (emptySeats > 0) {
      setShowStartWarning(true);
      return;
    }
    
    // Check for bot players
    if (botCount > 0) {
      setShowBotWarning(true);
      return;
    }
    
    try {
      console.log('Starting game:', gameId);
      await socketApi.startGame(socket, gameId);
    } catch (error) {
      console.error('Error starting game:', error);
    }
  };

  // Modal handlers
  const handleCloseStartWarning = () => {
    setShowStartWarning(false);
  };

  const handleCloseBotWarning = () => {
    setShowBotWarning(false);
  };

  const handlePlayWithBots = async () => {
    if (!socket || !gameId || !user || !game) return;
    try {
      console.log('Playing with bots:', gameId);
      
      // Determine empty seats from player positions
      const players = (game.players || []).filter(Boolean) as any[];
      const occupied = new Set<number>();
      players.forEach(p => {
        const seat = (p as any).position ?? (p as any).seatIndex;
        if (typeof seat === 'number' && seat >= 0 && seat <= 3) occupied.add(seat);
      });
      const emptySeatIndexes = [0,1,2,3].filter(i => !occupied.has(i));

      // Prefer socket path (matches in-table Invite Bot button behavior)
      if (socket.connected) {
        for (const seatIndex of emptySeatIndexes) {
          console.log('[BOTS] Emitting fill_seat_with_bot via socket for seat', seatIndex);
          socket.emit('fill_seat_with_bot', { gameId, seatIndex });
        }
      } else {
        // Fallback to HTTP endpoints
        for (const seatIndex of emptySeatIndexes) {
          try {
            const endpoint = game.status === 'WAITING'
              ? `/api/games/${gameId}/invite-bot`
              : `/api/games/${gameId}/invite-bot-midgame`;
            console.log('[BOTS] Inviting via HTTP for seat', seatIndex);
            const res = await api.post(endpoint, { seatIndex, requesterId: user.id });
            if (!res.ok) {
              const error = await res.json();
              console.error('Failed to invite bot:', error);
            } else {
              const updatedGame = await res.json();
              setGame(prevGame => ({ ...prevGame, ...updatedGame }));
              updateModalState(updatedGame as any);
            }
          } catch (err) {
            console.error('Error inviting bot to seat', seatIndex, ':', err);
          }
        }
      }
      
      // Give the server a moment to broadcast game_update with bots
      await new Promise(r => setTimeout(r, 300));
      
      // Then start the game
      await socketApi.startGame(socket, gameId);
      setShowStartWarning(false);
    } catch (error) {
      console.error('Error playing with bots:', error);
    }
  };

  const handleStartWithBots = async () => {
    if (!socket || !gameId || !user) return;
    try {
      console.log('Starting game with bots:', gameId);
      await socketApi.startGame(socket, gameId);
      setShowBotWarning(false);
    } catch (error) {
      console.error('Error starting game with bots:', error);
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
    <>
      <div className="table-page relative">
        <LandscapePrompt />
        {/* Full-screen toggle button for mobile/tablet */}
        {isMobileOrTablet() && (
          <button
            onClick={isFullScreen ? exitFullScreen : requestFullScreen}
            className="fixed top-4 right-4 z-50 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg shadow-lg transition-colors"
            title={isFullScreen ? "Exit Full Screen" : "Enter Full Screen"}
          >
            {isFullScreen ? (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            )}
          </button>
        )}
        
        <GameTable
          game={game}
          joinGame={handleJoinGame}
          onLeaveTable={handleLeaveTable}
          startGame={handleStartGame}
          user={user}
          showStartWarning={showStartWarning}
          showBotWarning={showBotWarning}
          onCloseStartWarning={handleCloseStartWarning}
          onCloseBotWarning={handleCloseBotWarning}
          emptySeats={emptySeats}
          botCount={botCount}
          isSpectator={isSpectatorLocal}

        />
      </div>

      {/* Mobile Modals - rendered using portal at document body level */}
      {showStartWarning && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] sm:hidden">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl border border-white/20">
            <div>
              {/* Header with inline icon and title */}
              <div className="flex items-center justify-center mb-4">
                <svg className="h-6 w-6 text-yellow-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-2xl font-bold text-white">
                  Empty Seats Detected
                </h3>
              </div>
              {/* Message - center aligned */}
              <div className="text-center mb-6">
                <p className="text-lg text-gray-200 mb-2 font-semibold">
                  Coin games require 4 human players.<br />You have {emptySeats} empty seat{emptySeats !== 1 ? 's' : ''}.
                </p>
                <p className="text-gray-300">
                  If you continue, the game will start with bot players in all empty seats and the game will not be rated.
                </p>
              </div>
              {/* Buttons */}
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleCloseStartWarning}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePlayWithBots}
                  className="px-4 py-2 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-600 transition-colors"
                >
                  Play with Bots
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showBotWarning && createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] sm:hidden">
          <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl border border-white/20">
            <div>
              {/* Header with inline icon and title */}
              <div className="flex items-center justify-center mb-4">
                <svg className="h-6 w-6 text-yellow-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="text-2xl font-bold text-white">
                  Bot Players Detected
                </h3>
              </div>
              {/* Message - center aligned */}
              <div className="text-center mb-6">
                <p className="text-lg text-gray-200 mb-2 font-semibold">
                  Coin games require 4 human players.<br />You have {botCount} bot player{botCount !== 1 ? 's' : ''}.
                </p>
                <p className="text-gray-300">
                  If you continue, the game will start but will not be rated.
                </p>
              </div>
              {/* Buttons */}
              <div className="flex gap-3 justify-center">
                <button
                  onClick={handleCloseBotWarning}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartWithBots}
                  className="px-4 py-2 bg-yellow-500 text-black font-semibold rounded-lg hover:bg-yellow-600 transition-colors"
                >
                  Start Game
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Inactivity Modal removed; message now shown on HomePage after redirect */}
    </>
  );
}