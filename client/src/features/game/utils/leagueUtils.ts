// League utility functions for GameTable component
// These functions handle league game overlay data preparation

import type { GameState, Player, Bot } from "../../types/game";

export interface LeagueOverlayCallbacks {
  toggleReady: (ready: boolean) => void;
  requestStart: () => void;
}

export interface ReadyButtonData {
  shouldShow: boolean;
  isReady: boolean;
  text: string;
  className: string;
  onClick: () => void;
}

export interface StartGameButtonData {
  shouldShow: boolean;
  disabled: boolean;
  className: string;
  onClick: () => void;
}

export interface PlayerStatusData {
  index: number;
  name: string;
  isReady: boolean;
}

/**
 * Get ready button data for non-host players
 */
export const getReadyButtonData = (
  isHost: boolean,
  myIndex: number,
  gameState: GameState,
  leagueReady: boolean[],
  toggleReady: (ready: boolean) => void
): ReadyButtonData => {
  const shouldShow = !isHost && myIndex !== -1 && !!gameState.players[myIndex];
  const isReady = shouldShow ? leagueReady[myIndex] : false;
  
  return {
    shouldShow,
    isReady,
    text: isReady ? 'Ready ✓' : 'Ready',
    className: `px-6 py-2 rounded-lg text-lg font-bold ${isReady ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-600 hover:bg-slate-500'} text-white shadow`,
    onClick: () => toggleReady(!isReady)
  };
};

/**
 * Get start game button data for host
 */
export const getStartGameButtonData = (
  isHost: boolean,
  allHumansReady: boolean,
  requestStart: () => void
): StartGameButtonData => {
  return {
    shouldShow: isHost,
    disabled: !allHumansReady,
    className: `px-6 py-2 rounded-lg text-lg font-bold shadow ${allHumansReady ? 'bg-yellow-500 hover:bg-yellow-600 text-black' : 'bg-slate-700 text-slate-400 cursor-not-allowed'}`,
    onClick: requestStart
  };
};

/**
 * Get player status data for rendering
 */
export const getPlayerStatusData = (
  gameState: GameState,
  leagueReady: boolean[]
): PlayerStatusData[] => {
  return [1, 2, 3].map((idx) => {
    const p = gameState.players[idx];
    const name = p ? ((p as any).username || (p as any).name || 'Player') : 'Player';
    const isReady = !!leagueReady[idx];
    
    return {
      index: idx,
      name,
      isReady
    };
  });
};
