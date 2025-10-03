import React from 'react';
import { IoExitOutline, IoInformationCircleOutline } from "react-icons/io5";

interface GameTableHeaderProps {
  scaleFactor: number;
  infoRef: React.RefObject<HTMLDivElement>;
  onLeaveTable: () => void;
  onToggleGameInfo: () => void;
  onShowTrickHistory: () => void;
}

const GameTableHeader: React.FC<GameTableHeaderProps> = ({
  scaleFactor,
  infoRef,
  onLeaveTable,
  onToggleGameInfo,
  onShowTrickHistory
}) => {
  return (
    <div className="absolute top-4 left-4 z-[100001] flex items-center gap-2">
      <button
        onClick={onLeaveTable}
        className="p-2 bg-gray-800/90 text-white rounded-full hover:bg-gray-700 transition shadow-lg"
        style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}
      >
        <IoExitOutline className="h-5 w-5" />
      </button>
      <div className="relative" ref={infoRef}>
        <button
          onClick={onToggleGameInfo}
          className="p-2 bg-gray-800/90 text-white rounded-full hover:bg-gray-700 transition shadow-lg"
          style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}
        >
          <IoInformationCircleOutline className="h-5 w-5" />
        </button>
      </div>
      <button
        onClick={onShowTrickHistory}
        className="p-2 bg-gray-800/90 text-white rounded-full hover:bg-gray-700 transition shadow-lg"
        style={{ fontSize: `${Math.floor(14 * scaleFactor)}px` }}
        title="View Trick History"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </button>
    </div>
  );
};

export default GameTableHeader;
