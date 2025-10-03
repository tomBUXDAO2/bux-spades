import React from 'react';

interface SpecialRulesSettingsProps {
  specialRule: 'screamer' | 'assassin' | '';
  onSpecialRuleChange: (rule: 'screamer' | 'assassin' | '') => void;
  isMobile: boolean;
  useLandscapeLayout: boolean;
}

export const SpecialRulesSettings: React.FC<SpecialRulesSettingsProps> = ({
  specialRule,
  onSpecialRuleChange,
  isMobile,
  useLandscapeLayout
}) => {
  const specialRules = [
    { value: '', label: 'None' },
    { value: 'screamer', label: 'Screamer' },
    { value: 'assassin', label: 'Assassin' }
  ];

  if (useLandscapeLayout) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-slate-300 font-semibold text-sm">Rules:</span>
        <select
          value={specialRule}
          onChange={(e) => onSpecialRuleChange(e.target.value as 'screamer' | 'assassin' | '')}
          className="bg-slate-700 text-white rounded px-2 py-1 text-sm"
        >
          {specialRules.map(rule => (
            <option key={rule.value} value={rule.value}>
              {rule.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <label className="block text-slate-300 font-semibold mb-2">
        Special Rules
      </label>
      <div className="flex gap-2">
        {specialRules.map(rule => (
          <button
            key={rule.value}
            onClick={() => onSpecialRuleChange(rule.value as 'screamer' | 'assassin' | '')}
            className={`px-3 py-2 rounded-md transition-colors ${
              specialRule === rule.value
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            }`}
          >
            {rule.label}
          </button>
        ))}
      </div>
    </div>
  );
};
