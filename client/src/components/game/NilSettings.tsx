import React from 'react';

interface NilSettingsProps {
  allowNil: boolean;
  allowBlindNil: boolean;
  onAllowNilChange: (enabled: boolean) => void;
  onAllowBlindNilChange: (enabled: boolean) => void;
  gameType: 'REG' | 'WHIZ' | 'MIRROR' | 'GIMMICK';
  isMobile: boolean;
  useLandscapeLayout: boolean;
}

export const NilSettings: React.FC<NilSettingsProps> = ({
  allowNil,
  allowBlindNil,
  onAllowNilChange,
  onAllowBlindNilChange,
  gameType,
  isMobile,
  useLandscapeLayout
}) => {
  const isMirrorGame = gameType === 'MIRROR';
  const isWhizGame = gameType === 'WHIZ';
  const isGimmickGame = gameType === 'GIMMICK';

  if (useLandscapeLayout) {
    return (
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-slate-300 font-semibold text-sm">Nil:</span>
          <div
            className="relative inline-flex items-center w-12 h-6 bg-slate-700 rounded-full cursor-pointer"
            onClick={() => onAllowNilChange(!allowNil)}
            style={{ userSelect: 'none' }}
          >
            <input
              type="checkbox"
              className="sr-only peer"
              checked={allowNil}
              readOnly
            />
            <div
              className={`absolute top-1 left-1 w-4 h-4 bg-indigo-600 rounded-full shadow-md transition-transform duration-200 ${allowNil ? 'translate-x-6' : ''}`}
              style={{ transform: allowNil ? 'translateX(24px)' : 'translateX(0)' }}
            ></div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-300 font-semibold text-sm">Blind Nil:</span>
          <div
            className="relative inline-flex items-center w-12 h-6 bg-slate-700 rounded-full cursor-pointer"
            onClick={() => onAllowBlindNilChange(!allowBlindNil)}
            style={{ userSelect: 'none' }}
          >
            <input
              type="checkbox"
              className="sr-only peer"
              checked={allowBlindNil}
              readOnly
            />
            <div
              className={`absolute top-1 left-1 w-4 h-4 bg-indigo-600 rounded-full shadow-md transition-transform duration-200 ${allowBlindNil ? 'translate-x-6' : ''}`}
              style={{ transform: allowBlindNil ? 'translateX(24px)' : 'translateX(0)' }}
            ></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <label className="block text-slate-300 font-semibold mb-2">
        Nil Settings
      </label>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-slate-300">Allow Nil</span>
          <div
            className="relative inline-flex items-center w-12 h-6 bg-slate-700 rounded-full cursor-pointer"
            onClick={() => onAllowNilChange(!allowNil)}
            style={{ userSelect: 'none' }}
          >
            <input
              type="checkbox"
              className="sr-only peer"
              checked={allowNil}
              readOnly
            />
            <div
              className={`absolute top-1 left-1 w-4 h-4 bg-indigo-600 rounded-full shadow-md transition-transform duration-200 ${allowNil ? 'translate-x-6' : ''}`}
              style={{ transform: allowNil ? 'translateX(24px)' : 'translateX(0)' }}
            ></div>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-300">Allow Blind Nil</span>
          <div
            className="relative inline-flex items-center w-12 h-6 bg-slate-700 rounded-full cursor-pointer"
            onClick={() => onAllowBlindNilChange(!allowBlindNil)}
            style={{ userSelect: 'none' }}
          >
            <input
              type="checkbox"
              className="sr-only peer"
              checked={allowBlindNil}
              readOnly
            />
            <div
              className={`absolute top-1 left-1 w-4 h-4 bg-indigo-600 rounded-full shadow-md transition-transform duration-200 ${allowBlindNil ? 'translate-x-6' : ''}`}
              style={{ transform: allowBlindNil ? 'translateX(24px)' : 'translateX(0)' }}
            ></div>
          </div>
        </div>
      </div>
    </div>
  );
};
