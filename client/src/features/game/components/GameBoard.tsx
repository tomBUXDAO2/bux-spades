"use client";

import { useState, useEffect } from "react";
import { getSocket } from '@/features/game/services/lib/socket';
import type { GameState, Player, Bot, Card } from '@/types/game';
import { abbreviateBotName } from '@/utils/botUtils';

interface GameBoardProps {
  gameId: string;
}

export default function GameBoard({ gameId }: GameBoardProps) {
  const [game, setGame] = useState<GameState | null>(null);
  const socket = getSocket();

  useEffect(() => {
    if (!socket) return;
    
    const handleGameUpdate = (updatedGame: GameState) => {
      if (updatedGame.id === gameId) {
        setGame(updatedGame);
      }
    };
    
    // game_update handled in useSocketEventHandlers.ts
    
    // Initial request for game data
    socket.emit("get_game", { gameId });
    
    return () => {
      // Cleanup handled in useSocketEventHandlers.ts
    };
  }, [gameId, socket]);

  const currentPlayer = game?.players.find(
    (p: Player | Bot | null) => p?.id === "TODO"
  );

  const handlePlayCard = () => {
    if (!socket) return;
    // TODO: Implement playCardFn
  };

  const handleMakeBid = () => {
    if (!socket) return;
    // TODO: Implement makeBidFn
  };

  if (!game) {
    return <div>Loading game...</div>;
  }

  // Scores come from backend - no calculation needed
  const team1Score = game.team1TotalScore || 0;
  const team2Score = game.team2TotalScore || 0;
  const team1Bags = game.team1Bags || 0;
  const team2Bags = game.team2Bags || 0;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Game #{game.id.slice(0, 8)}</h2>
        <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full">
          {game.status}
        </div>
      </div>

      {/* Score display */}
      <div className="grid grid-cols-2 gap-4">
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium mb-2">Team 1</h3>
          <p>Score: {team1Score}</p>
          <p>Bags: {team1Bags}</p>
        </div>
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium mb-2">Team 2</h3>
          <p>Score: {team2Score}</p>
          <p>Bags: {team2Bags}</p>
        </div>
      </div>

      {/* Current trick */}
      {game.currentTrick && game.currentTrick.length > 0 && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium mb-2">Current Trick</h3>
          <div className="flex gap-4">
            {Array.isArray(game.currentTrick) && game.currentTrick.map((card: Card, index: number) => (
              <div
                key={index}
                className="p-2 bg-white rounded border text-center min-w-[60px]"
              >
                {card.rank} {card.suit}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bidding phase */}
      {game.status === "BIDDING" && currentPlayer && !currentPlayer.bid && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium mb-2">Make Your Bid</h3>
          <div className="flex gap-2">
            {Array.from({ length: 13 }, (_, i) => i).map((bid: number) => (
              <button
                key={bid}
                onClick={() => handleMakeBid()}
                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                {bid}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Player's hand */}
      {currentPlayer && currentPlayer.hand && currentPlayer.hand.length > 0 && (
        <div className="p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium mb-2">Your Hand</h3>
          <div className="flex flex-wrap gap-2">
            {Array.isArray(currentPlayer.hand) && currentPlayer.hand.map((card: Card, index: number) => (
              <button
                key={index}
                onClick={() => handlePlayCard()}
                disabled={game.status !== "PLAYING" || game.currentPlayer !== currentPlayer.id}
                className={`p-2 bg-white rounded border text-center min-w-[60px] ${
                  game.status === "PLAYING" && game.currentPlayer === currentPlayer.id
                    ? "hover:bg-blue-50"
                    : "opacity-70"
                }`}
              >
                {card.rank} {card.suit}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Player information */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {game.players.map((player: Player | Bot | null) => (
          <div
            key={player?.id}
            className={`p-4 rounded-lg ${
              game.currentPlayer === player?.id
                ? "bg-blue-50 border-2 border-blue-200"
                : "bg-gray-50"
            }`}
          >
            <div className="font-medium">{player && (('type' in player && player.type === 'bot') ? abbreviateBotName(player.username) : (player.username || (player as any).name))}</div>
            {game.status !== "WAITING" && (
              <>
                <div className="text-sm text-gray-600">
                  Bid: {player && (player.bid ?? "?")}
                </div>
                <div className="text-sm text-gray-600">
                  Tricks: {player && player.tricks}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
} 