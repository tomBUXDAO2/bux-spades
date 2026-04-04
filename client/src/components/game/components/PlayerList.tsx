// Player list component for chat
// Extracted from Chat.tsx

import React from 'react';
import type { Player } from "../../../types/game";
import { abbreviateBotName } from '../../../utils/botUtils';

interface PlayerListProps {
  players: Player[];
  spectators?: Player[];
  isMobile: boolean;
  scaleFactor: number;
  onPlayerClick?: (player: Player) => void;
  playerStatuses: Record<string, 'friend' | 'blocked' | 'not_friend'>;
  onAddFriend: (playerId: string) => void;
  onRemoveFriend: (playerId: string) => void;
  onBlockUser: (playerId: string) => void;
  onUnblockUser: (playerId: string) => void;
}

// Fallback avatars 
const GUEST_AVATAR = "/guest-avatar.png";
const BOT_AVATAR = "/bot-avatar.jpg";

export const PlayerList: React.FC<PlayerListProps> = ({
  players,
  spectators = [],
  isMobile,
  scaleFactor,
  onPlayerClick,
  playerStatuses,
  onAddFriend,
  onRemoveFriend,
  onBlockUser,
  onUnblockUser
}) => {
  const getFontSizes = () => {
    const baseSize = isMobile ? 12 : 14;
    return {
      playerName: `${Math.floor(baseSize * scaleFactor)}px`,
      status: `${Math.floor((baseSize - 2) * scaleFactor)}px`,
      sectionTitle: `${Math.floor((baseSize + 2) * scaleFactor)}px`
    };
  };

  const fontSizes = getFontSizes();

  const getPlayerStatus = (userId: string) => {
    return playerStatuses[userId] || 'not_friend';
  };

  const handlePlayerAction = (action: string, playerId: string) => {
    if (action === 'add_friend') {
      onAddFriend(playerId);
    } else if (action === 'remove_friend') {
      onRemoveFriend(playerId);
    } else if (action === 'block_user') {
      onBlockUser(playerId);
    } else if (action === 'unblock_user') {
      onUnblockUser(playerId);
    }
  };

  const renderPlayer = (player: Player, isSpectator: boolean = false) => {
    const status = getPlayerStatus(player.id);
    const isBot = (player as any).type === 'bot';
    
    return (
      <div
        key={player.id}
        className="flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-white/5"
      >
        <div className="flex items-center gap-2 flex-1">
          <img
            src={isBot ? BOT_AVATAR : (player.avatarUrl || GUEST_AVATAR)}
            alt={player.username || player.name}
            className="w-6 h-6 rounded-full"
            onError={(e) => {
              (e.target as HTMLImageElement).src = isBot ? BOT_AVATAR : GUEST_AVATAR;
            }}
          />
          <div className="flex-1 min-w-0">
            <div
              className="cursor-pointer truncate font-medium text-white hover:text-cyan-300"
              style={{ fontSize: fontSizes.playerName }}
              onClick={() => onPlayerClick && onPlayerClick(player)}
            >
              {isBot ? abbreviateBotName(player.username || player.name) : (player.username || player.name)}
              {isBot && <span className="ml-1 text-xs text-slate-400">(Bot)</span>}
            </div>
            <div className="text-xs text-slate-400" style={{ fontSize: fontSizes.status }}>
              {isSpectator ? 'Spectator' : 'Player'}
              {status !== 'not_friend' && (
                <span className="ml-1">
                  {status === 'friend' ? '👥 Friend' : '🚫 Blocked'}
                </span>
              )}
            </div>
          </div>
        </div>
        
        {/* Player actions */}
        {!isBot && status !== 'blocked' && (
          <div className="flex gap-1">
            {status === 'friend' ? (
              <button
                onClick={() => handlePlayerAction('remove_friend', player.id)}
                className="rounded px-2 py-1 text-xs text-red-100 transition-colors border border-red-500/40 bg-red-950/50 hover:bg-red-900/60"
                title="Remove friend"
              >
                Remove
              </button>
            ) : (
              <button
                onClick={() => handlePlayerAction('add_friend', player.id)}
                className="rounded px-2 py-1 text-xs text-emerald-100 transition-colors border border-emerald-500/40 bg-emerald-950/50 hover:bg-emerald-900/60"
                title="Add friend"
              >
                Add
              </button>
            )}
            <button
              onClick={() => handlePlayerAction('block_user', player.id)}
              className="rounded border border-white/15 bg-slate-800/80 px-2 py-1 text-xs text-slate-200 transition-colors hover:bg-slate-700/80"
              title="Block user"
            >
              Block
            </button>
          </div>
        )}
        
        {!isBot && status === 'blocked' && (
          <button
            onClick={() => handlePlayerAction('unblock_user', player.id)}
            className="rounded border border-amber-500/40 bg-amber-950/50 px-2 py-1 text-xs text-amber-100 transition-colors hover:bg-amber-900/60"
            title="Unblock user"
          >
            Unblock
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-2" style={{ maxHeight: 'calc(100vh - 200px)' }}>
      {/* Players Section */}
      {players.length > 0 && (
        <div className="mb-4">
          <h3
            className="mb-2 border-b border-white/10 pb-1 font-semibold text-white"
            style={{ fontSize: fontSizes.sectionTitle }}
          >
            Players ({players.length})
          </h3>
          <div className="space-y-1">
            {players.map(player => renderPlayer(player, false))}
          </div>
        </div>
      )}
      
      {/* Spectators Section */}
      {spectators.length > 0 && (
        <div>
          <h3
            className="mb-2 border-b border-white/10 pb-1 font-semibold text-white"
            style={{ fontSize: fontSizes.sectionTitle }}
          >
            Spectators ({spectators.length})
          </h3>
          <div className="space-y-1">
            {spectators.map(player => renderPlayer(player, true))}
          </div>
        </div>
      )}
      
      {/* Empty state */}
      {players.length === 0 && spectators.length === 0 && (
        <div className="py-8 text-center text-slate-400">
          <div className="text-4xl mb-2">👥</div>
          <div style={{ fontSize: fontSizes.playerName }}>No players online</div>
        </div>
      )}
    </div>
  );
};
