import React from 'react';
import { IoInformationCircleOutline } from "react-icons/io5";
import type { GameState } from '@/types/game';

// Utility function for formatting coins
const formatCoins = (amount: number): string => {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toFixed(1)}M`;
  } else if (amount >= 1000) {
    return `${(amount / 1000).toFixed(0)}k`;
  }
  return amount.toString();
};

interface TableDetailsModalProps {
  isOpen: boolean;
  gameState: GameState;
}

export default function TableDetailsModal({ isOpen, gameState }: TableDetailsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed left-4 top-20 w-64 bg-gray-900/95 border border-gray-700 rounded-lg shadow-xl p-4 z-[999999] text-sm text-white">
      <div className="font-bold mb-2 flex items-center gap-2">
        <IoInformationCircleOutline className="inline-block h-4 w-4 text-blue-400" />
        Table Details
      </div>
      {/* GameTile-style info header */}
      <div className="flex items-center gap-2 text-sm mb-2">
        {/* Game type brick */}
        {(() => {
          const format = (gameState as any).format || 'REGULAR';
          const gimmickVariant = (gameState as any).gimmickVariant;
          let color = 'bg-green-600';
          let label = 'REGULAR';
          if (format === 'WHIZ') {
            color = 'bg-blue-600';
            label = 'WHIZ';
          } else if (format === 'MIRROR') {
            color = 'bg-red-600';
            label = 'MIRROR';
          } else if (format === 'GIMMICK' || gimmickVariant) {
            color = 'bg-orange-500';
            if (gimmickVariant === 'BID4NIL' || gimmickVariant === '4 OR NIL') label = '4 OR NIL';
            else if (gimmickVariant === 'BID3' || gimmickVariant === 'BID 3') label = 'BID 3';
            else if (gimmickVariant === 'BIDHEARTS' || gimmickVariant === 'BID HEARTS') label = 'BID ♡s';
            else if (gimmickVariant === 'SUICIDE') label = 'SUICIDE';
            else if (gimmickVariant === 'CRAZY_ACES' || gimmickVariant === 'CRAZY ACES') label = 'CRAZY As';
            else if (gimmickVariant === 'JOKER' || gimmickVariant === 'JOKER_WHIZ') label = 'JOKER';
            else label = 'UNKNOWN'; // Never show GIMMICK
          }
          return <span className={`inline whitespace-nowrap ${color} text-white font-bold text-xs px-2 py-0.5 rounded mr-2`}>{label}</span>;
        })()}
        {/* Points */}
        <span className="text-slate-300 font-medium">{(gameState as any).minPoints}/{(gameState as any).maxPoints}</span>
        {/* Nil and bn (blind nil) with inline check/cross */}
        {(gameState as any).nilAllowed && <span className="text-slate-300 ml-2">nil <span className="align-middle">☑️</span></span>}
        {!(gameState as any).nilAllowed && <span className="text-slate-300 ml-2">nil <span className="align-middle">❌</span></span>}
        <span className="text-slate-300 ml-2">bn <span className="align-middle">{(gameState as any).blindNilAllowed ? '☑️' : '❌'}</span></span>
      </div>
      {/* Line 2: Buy-in, game mode, and special bricks */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-yellow-500 text-lg font-bold">{((gameState as any).buyIn ?? 100000) / 1000}k</span>
        <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9 9a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
        </svg>
        <span className="ml-2 text-xs font-bold text-slate-200 uppercase">{(gameState as any).mode || 'PARTNERS'}</span>
        {/* Special bricks */}
        {(() => {
          const specialRule1 = gameState.specialRules?.specialRule1 || (gameState as any).rules?.specialRules?.specialRule1;
          const specialRule2 = gameState.specialRules?.specialRule2 || (gameState as any).rules?.specialRules?.specialRule2;
          const bricks = [];
          
          // Special Rule 1
          if (specialRule1 === 'SCREAMER') {
            bricks.push(<span key="screamer" className="inline whitespace-nowrap bg-blue-600 text-white font-bold text-xs px-2 py-0.5 rounded ml-2">SCREAMER</span>);
          } else if (specialRule1 === 'ASSASSIN') {
            bricks.push(<span key="assassin" className="inline whitespace-nowrap bg-red-600 text-white font-bold text-xs px-2 py-0.5 rounded ml-2">ASSASSIN</span>);
          } else if (specialRule1 === 'SECRET_ASSASSIN') {
            bricks.push(<span key="secret-assassin" className="inline whitespace-nowrap bg-purple-600 text-white font-bold text-xs px-2 py-0.5 rounded ml-2">SECRET</span>);
          }
          
          // Special Rule 2
          if (specialRule2 === 'LOWBALL') {
            bricks.push(<span key="lowball" className="inline whitespace-nowrap bg-green-600 text-white font-bold text-xs px-2 py-0.5 rounded ml-2">LOWBALL</span>);
          } else if (specialRule2 === 'HIGHBALL') {
            bricks.push(<span key="highball" className="inline whitespace-nowrap bg-yellow-600 text-white font-bold text-xs px-2 py-0.5 rounded ml-2">HIGHBALL</span>);
          }
          
          // Backward compatibility with old format
          if (gameState.specialRules?.assassin || (gameState as any).specialRules?.assassin) {
            if (!bricks.some(brick => brick.key === 'assassin')) {
              bricks.push(<span key="assassin" className="inline whitespace-nowrap bg-red-600 text-white font-bold text-xs px-2 py-0.5 rounded ml-2">ASSASSIN</span>);
            }
          }
          if (gameState.specialRules?.screamer || (gameState as any).specialRules?.screamer) {
            if (!bricks.some(brick => brick.key === 'screamer')) {
              bricks.push(<span key="screamer" className="inline whitespace-nowrap bg-blue-600 text-white font-bold text-xs px-2 py-0.5 rounded ml-2">SCREAMER</span>);
            }
          }
          
          return bricks;
        })()}
      </div>
      {/* Prize info */}
      <div className="mt-2 pt-2 border-t border-gray-700">
        <div className="text-sm">
          <span className="text-gray-400">Prize:</span>
          <span className="font-bold text-yellow-400 ml-2">
            {(() => {
              const buyIn = (gameState as any).rules?.coinAmount || 100000;
              const prizePot = buyIn * 4 * 0.9;
              // Check gameMode for Partners vs Solo, not gameType
              const isPartnersMode = gameState.gameMode === 'PARTNERS' || !gameState.gameMode;
              if (isPartnersMode) {
                return `${formatCoins(prizePot / 2)} each`;
              } else {
                // Solo mode: 2nd place gets their stake back, 1st place gets the remainder
                const secondPlacePrize = buyIn; // Exactly their stake back
                const firstPlacePrize = prizePot - secondPlacePrize; // Remainder after 2nd place gets their stake
                return `1st: ${formatCoins(firstPlacePrize)}, 2nd: ${formatCoins(secondPlacePrize)}`;
              }
            })()}
          </span>
        </div>
        {/* League indicator */}
        {(gameState as any).league && (
          <div className="text-sm mt-1">
            <span className="text-yellow-400">⭐ LEAGUE GAME</span>
          </div>
        )}
      </div>
    </div>
  );
}
