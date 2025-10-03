// Game status overlay components for GameTable
// Handles status messages, buttons, and game state displays

import React from 'react';
import type { GameState, Player, Bot } from '../../types/game';
import BlindNilModal from '@/features/game/components/BlindNilModal';
import BiddingInterface from '@/features/game/components/BiddingInterface';
import { countSpades } from '@/features/game/utils/gameUtils';
import { abbreviateBotName } from '../../../utils/botUtils';

interface GameStatusOverlayProps {
  gameState: GameState;
  currentPlayerId: string;
  sanitizedPlayers: (Player | Bot | null)[];
  scaleFactor: number;
  isLeague: boolean;
  isStarting: boolean;
  dealingComplete: boolean;
  cardsRevealed: boolean;
  showBlindNilModal: boolean;
  isBlindNil: boolean;
  blindNilDismissed: boolean;
  myPlayerIndex: number;
  currentPlayer: Player | Bot | null;
  isPlayer: (p: Player | Bot | null) => p is Player;
  isBot: (p: Player | Bot | null) => p is Bot;
  showLeaveConfirmation?: boolean;
  showTrickHistory?: boolean;
  onStartGame: () => void;
  onBid: (bid: number) => void;
  onBlindNil: () => void;
  onRegularBid: () => void;
}

// Start game button for non-league games
export const StartGameButton: React.FC<{
  gameState: GameState;
  currentPlayerId: string;
  sanitizedPlayers: (Player | Bot | null)[];
  scaleFactor: number;
  isLeague: boolean;
  isStarting: boolean;
  hideStartButton?: boolean;
  showLeaveConfirmation?: boolean;
  showTrickHistory?: boolean;
  onStartGame: () => void;
}> = ({ gameState, currentPlayerId, sanitizedPlayers, scaleFactor, isLeague, isStarting, hideStartButton, showLeaveConfirmation, showTrickHistory, onStartGame }) => {
  if (gameState.status !== "WAITING") return null;
  
  // Hide start button when leave confirmation modal or trick history modal is open
  if (showLeaveConfirmation || showTrickHistory) return null;
  
  if (!isLeague && sanitizedPlayers.length >= 1 && sanitizedPlayers[0]?.id === currentPlayerId && !isStarting && !hideStartButton) {
    return (
      <button
        onClick={onStartGame}
        className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-black font-bold rounded-lg shadow-lg transform hover:scale-105 transition-all pointer-events-auto relative z-[100010]"
        style={{ fontSize: `${Math.floor(16 * scaleFactor)}px` }}
      >
        Start Game
      </button>
    );
  }
  
  return null;
};

// Waiting for players message
export const WaitingForPlayersMessage: React.FC<{
  gameState: GameState;
  sanitizedPlayers: (Player | Bot | null)[];
  currentPlayerId: string;
  scaleFactor: number;
  isLeague: boolean;
}> = ({ gameState, sanitizedPlayers, currentPlayerId, scaleFactor, isLeague }) => {
  if (gameState.status !== "WAITING") return null;
  
  if (!isLeague && sanitizedPlayers.length < 4) {
    return (
      <div className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-center pointer-events-auto"
           style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}>
        <div className="font-bold">Waiting for Players</div>
        <div className="text-sm mt-1">{sanitizedPlayers.length}/4 joined</div>
      </div>
    );
  }
  
  if (!isLeague && sanitizedPlayers[0]?.id !== currentPlayerId) {
    return (
      <div className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-center pointer-events-auto"
           style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}>
        <div className="font-bold">Waiting for Host</div>
        <div className="text-sm mt-1">Only {sanitizedPlayers[0]?.username || 'Unknown'} can start</div>
      </div>
    );
  }
  
  return null;
};

// Bidding interface overlay
export const BiddingOverlay: React.FC<{
  gameState: GameState;
  currentPlayerId: string;
  dealingComplete: boolean;
  cardsRevealed: boolean;
  showBlindNilModal: boolean;
  isBlindNil: boolean;
  blindNilDismissed: boolean;
  myPlayerIndex: number;
  sanitizedPlayers: (Player | Bot | null)[];
  onBid: (bid: number) => void;
  onBlindNil: () => void;
  onRegularBid: () => void;
}> = ({
  gameState,
  currentPlayerId,
  dealingComplete,
  cardsRevealed,
  showBlindNilModal,
  isBlindNil,
  blindNilDismissed,
  myPlayerIndex,
  sanitizedPlayers,
  onBid,
  onBlindNil,
  onRegularBid
}) => {
  if (gameState.status !== "BIDDING" || gameState.currentPlayer !== currentPlayerId || !dealingComplete || myPlayerIndex === -1) {
    return null;
  }

  // Determine game type, including all gimmick games
  let gameType = (gameState as any).rules?.bidType || (gameState as any).rules?.gameType;
  const forcedBid = (gameState as any).forcedBid;
  const gimmickType = (gameState as any).rules?.gimmickType;
  
  // Handle gimmick games
  if (forcedBid === 'SUICIDE') {
    gameType = 'SUICIDE';
  } else if (forcedBid === 'BID4NIL') {
    gameType = '4 OR NIL';
  } else if (forcedBid === 'BID3') {
    gameType = 'BID 3';
  } else if (forcedBid === 'BIDHEARTS') {
    gameType = 'BID HEARTS';
  } else if (forcedBid === 'CRAZY ACES') {
    gameType = 'CRAZY ACES';
  } else if (gimmickType === 'SUICIDE') {
    gameType = 'SUICIDE';
  } else if (gimmickType === 'BID4NIL') {
    gameType = '4 OR NIL';
  } else if (gimmickType === 'BID3') {
    gameType = 'BID 3';
  } else if (gimmickType === 'BIDHEARTS') {
    gameType = 'BID HEARTS';
  } else if (gimmickType === 'CRAZY ACES') {
    gameType = 'CRAZY ACES';
  }
  
  // Fallback to REGULAR if no gameType is determined
  if (!gameType) {
    gameType = 'REGULAR';
  }
  
  // Get the current player's hand from gameState.hands array
  const currentPlayerIndex = sanitizedPlayers.findIndex(p => p && p.id === currentPlayerId);
  const currentPlayerHand = (gameState as any).hands && (gameState as any).hands[currentPlayerIndex];
  
  // Calculate if player has Ace of Spades for Whiz games
  const hasAceSpades = Array.isArray(currentPlayerHand) ? currentPlayerHand.some((card: any) => (card.suit === 'SPADES') && card.rank === 'A') : false;
  
  // Calculate number of hearts for BID HEARTS games
  const countHearts = (hand: any[] | undefined): number => {
    if (!hand || !Array.isArray(hand)) return 0;
    return Array.isArray(hand) ? hand.filter(card => { const s = (card.suit as unknown as string).toUpperCase(); return s === 'HEARTS' || s === 'H' || s === '♥'; }).length : 0;
  };
  const numHearts = currentPlayerHand ? countHearts(currentPlayerHand) : 0;
  
  // Get partner bid for Suicide games
  let partnerBid: number | undefined;
  if ((gameState as any).forcedBid === 'SUICIDE' && (gameState as any).bidding && (gameState as any).bidding.bids) {
    const partnerIndex = (currentPlayerIndex + 2) % 4;
    partnerBid = (gameState as any).bidding.bids[partnerIndex];
  }

  return (
    <>
      {/* Blind Nil Modal */}
      <BlindNilModal
        isOpen={showBlindNilModal}
        onBlindNil={onBlindNil}
        onRegularBid={onRegularBid}
      />
      
      {/* Bidding Interface */}
      {!showBlindNilModal && (cardsRevealed || (gameState.status === "BIDDING" && gameState.currentPlayer === currentPlayerId && dealingComplete)) && (
        <BiddingInterface
          onBid={onBid}
          gameType={gameType}
          numSpades={currentPlayerHand ? countSpades(currentPlayerHand) : 0}
          numHearts={numHearts}
          playerId={currentPlayerId}
          currentPlayerTurn={gameState.currentPlayer}
          allowNil={gameState.rules?.allowNil}
          hasAceSpades={hasAceSpades}
          gimmickType={(gameState as any).rules?.gimmickType}
          partnerBid={partnerBid}
          partnerBidValue={partnerBid}
          currentPlayerHand={currentPlayerHand}
        />
      )}
    </>
  );
};

// Dealing cards message
export const DealingCardsMessage: React.FC<{
  gameState: GameState;
  dealingComplete: boolean;
  scaleFactor: number;
}> = ({ gameState, dealingComplete, scaleFactor }) => {
  if (gameState.status !== "BIDDING" || dealingComplete) return null;
  
  // Only show dealing banner if no bids yet
  const hasBids = (gameState as any).bidding?.bids?.some((b: any) => b != null);
  if (hasBids) return null;
  
  return (
    <div className="px-4 py-2 bg-gray-700 text-white rounded-lg text-center animate-pulse pointer-events-auto"
         style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}>
      <div className="font-bold">Dealing Cards...</div>
      <div className="text-sm mt-1">Please wait while cards are being dealt</div>
    </div>
  );
};

// Waiting for player message during bidding
export const WaitingForPlayerBiddingMessage: React.FC<{
  gameState: GameState;
  currentPlayerId: string;
  sanitizedPlayers: (Player | Bot | null)[];
  scaleFactor: number;
  isPlayer: (p: Player | Bot | null) => p is Player;
  isBot: (p: Player | Bot | null) => p is Bot;
}> = ({ gameState, currentPlayerId, sanitizedPlayers, scaleFactor, isPlayer, isBot }) => {
  if (gameState.status !== "BIDDING" || gameState.currentPlayer === currentPlayerId) return null;
  
  const waitingPlayer = sanitizedPlayers.find((p): p is Player | Bot => !!p && p.id === gameState.currentPlayer) || null;
  const waitingName = isPlayer(waitingPlayer) 
    ? (waitingPlayer.username || waitingPlayer.name) 
    : isBot(waitingPlayer) 
      ? abbreviateBotName(waitingPlayer.username) 
      : (gameState.currentPlayer ? `Player ${gameState.currentPlayer}` : undefined);
  
  if (!waitingName) return null;
  
  return (
    <div className="px-4 py-2 bg-gray-700 text-white rounded-lg text-center animate-pulse pointer-events-auto"
         style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}>
      <div className="font-bold">Waiting for {waitingName}</div>
    </div>
  );
};

// Forced bid messages
export const ForcedBidMessage: React.FC<{
  gameState: GameState;
  scaleFactor: number;
}> = ({ gameState, scaleFactor }) => {
  if (gameState.status !== "BIDDING") return null;
  
  const forcedBid = (gameState as any)?.forcedBid;
  const safeRules = (gameState as any)?.rules || {};
  const gameType = safeRules.bidType || (gameState as any)?.gameType;
  
  if (forcedBid === "BIDHEARTS") {
    return (
      <div className="px-4 py-2 bg-orange-600/80 text-white rounded-lg text-center animate-pulse pointer-events-auto"
           style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}>
        <div className="font-bold">BIDDING HEARTS</div>
        <div className="text-sm mt-1">All players must bid their number of hearts</div>
      </div>
    );
  } else if (forcedBid === "BID3") {
    return (
      <div className="px-4 py-2 bg-yellow-600/80 text-white rounded-lg text-center animate-pulse pointer-events-auto"
           style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}>
        <div className="font-bold">BIDDING 3</div>
        <div className="text-sm mt-1">All players must bid exactly 3</div>
      </div>
    );
  } else if (forcedBid === "CRAZY ACES") {
    return (
      <div className="px-4 py-2 bg-purple-600/80 text-white rounded-lg text-center animate-pulse pointer-events-auto"
           style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}>
        <div className="font-bold">CRAZY ACES</div>
        <div className="text-sm mt-1">All players must bid 3 for each ace they hold</div>
      </div>
    );
  } else if (gameType === "MIRROR") {
    return (
      <div className="px-4 py-2 bg-purple-600/80 text-white rounded-lg text-center animate-pulse pointer-events-auto"
           style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}>
        <div className="font-bold">BIDDING SPADES</div>
        <div className="text-sm mt-1">All players must bid their number of spades</div>
      </div>
    );
  }
  
  return null;
};

// Waiting for player message during playing
export const WaitingForPlayerPlayingMessage: React.FC<{
  gameState: GameState;
  currentPlayerId: string;
  currentTrick: Card[];
  sanitizedPlayers: (Player | Bot | null)[];
  scaleFactor: number;
  isPlayer: (p: Player | Bot | null) => p is Player;
  isBot: (p: Player | Bot | null) => p is Bot;
}> = ({ gameState, currentPlayerId, currentTrick, sanitizedPlayers, scaleFactor, isPlayer, isBot }) => {
  if (gameState.status !== "PLAYING" || currentTrick?.length !== 0 || gameState.currentPlayer === currentPlayerId) return null;
  
  const waitingPlayer = sanitizedPlayers.find((p): p is Player | Bot => !!p && p.id === gameState.currentPlayer) || null;
  const waitingName = isPlayer(waitingPlayer) 
    ? (waitingPlayer.username || waitingPlayer.name) 
    : isBot(waitingPlayer) 
      ? abbreviateBotName(waitingPlayer.username) 
      : "Unknown";
  
  return (
    <div className="px-4 py-2 bg-gray-700/70 text-white rounded-lg text-center pointer-events-auto"
         style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}>
      <div className="text-sm">Waiting for {waitingName} to play</div>
    </div>
  );
};

// Main game status overlay component
export const GameStatusOverlay: React.FC<GameStatusOverlayProps> = (props) => {
  const {
    gameState,
    currentPlayerId,
    sanitizedPlayers,
    scaleFactor,
    isLeague,
    isStarting,
    dealingComplete,
    cardsRevealed,
    showBlindNilModal,
    isBlindNil,
    blindNilDismissed,
    myPlayerIndex,
    currentPlayer,
    isPlayer,
    isBot,
    showLeaveConfirmation,
    showTrickHistory,
    onStartGame,
    onBid,
    onBlindNil,
    onRegularBid
  } = props;

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      {gameState.status === "WAITING" ? (
        <>
          <StartGameButton
            gameState={gameState}
            currentPlayerId={currentPlayerId}
            sanitizedPlayers={sanitizedPlayers}
            scaleFactor={scaleFactor}
            isLeague={isLeague}
            isStarting={isStarting}
            hideStartButton={(gameState as any)?.ui?.showBotWarning === true}
            showLeaveConfirmation={showLeaveConfirmation}
            showTrickHistory={showTrickHistory}
            onStartGame={onStartGame}
          />
          {/** Hide the waiting panel whenever the Start button is available to the host */}
          {!(
            !isLeague &&
            sanitizedPlayers.length >= 1 &&
            sanitizedPlayers[0]?.id === currentPlayerId
          ) && (
            <WaitingForPlayersMessage
              gameState={gameState}
              sanitizedPlayers={sanitizedPlayers}
              currentPlayerId={currentPlayerId}
              scaleFactor={scaleFactor}
              isLeague={isLeague}
            />
          )}
        </>
      ) : gameState.status === "BIDDING" && gameState.currentPlayer === currentPlayerId && dealingComplete && myPlayerIndex !== -1 ? (
        <BiddingOverlay
          gameState={gameState}
          currentPlayerId={currentPlayerId}
          dealingComplete={dealingComplete}
          cardsRevealed={cardsRevealed}
          showBlindNilModal={showBlindNilModal}
          isBlindNil={isBlindNil}
          blindNilDismissed={blindNilDismissed}
          myPlayerIndex={myPlayerIndex}
          sanitizedPlayers={sanitizedPlayers}
          onBid={onBid}
          onBlindNil={onBlindNil}
          onRegularBid={onRegularBid}
        />
      ) : (
        <>
          <WaitingForPlayerBiddingMessage
            gameState={gameState}
            currentPlayerId={currentPlayerId}
            sanitizedPlayers={sanitizedPlayers}
            scaleFactor={scaleFactor}
            isPlayer={isPlayer}
            isBot={isBot}
          />
          <ForcedBidMessage
            gameState={gameState}
            scaleFactor={scaleFactor}
          />
          <WaitingForPlayerPlayingMessage
            gameState={gameState}
            currentPlayerId={currentPlayerId}
            currentTrick={(gameState as any)?.play?.currentTrick || []}
            sanitizedPlayers={sanitizedPlayers}
            scaleFactor={scaleFactor}
            isPlayer={isPlayer}
            isBot={isBot}
          />
        </>
      )}
    </div>
  );
};
