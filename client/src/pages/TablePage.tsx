import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import GameTable from '../table-ui/game/GameTable';
import type { Game } from '../../../shared/types/game';

const TablePage: React.FC = () => {
  const { gameId } = useParams();
  const [game, setGame] = useState<Game | null>(null);
  // TODO: Replace with real user context
  const user = { id: 'demo-user', username: 'Demo User' };

  useEffect(() => {
    if (!gameId) return;
    fetch(`/api/games/${gameId}`)
      .then(res => res.json())
      .then(setGame);
  }, [gameId]);

  if (!game) return <div className="flex items-center justify-center h-screen text-white">Loading table...</div>;

  // Dummy handlers for now
  const dummy = () => {};
  return (
    <GameTable
      game={game as any}
      socket={null}
      createGame={dummy}
      joinGame={dummy}
      onGamesUpdate={dummy}
      onLeaveTable={dummy}
      startGame={async () => {}}
      user={user}
    />
  );
};

export default TablePage; 