import { useState, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import type { GameRules } from '../../types/game';

// Remove unused imports
// import React, { useState, Fragment } from 'react';

// Remove unused state variables
// const [gamePlayOption, setGamePlayOption] = useState<GamePlayOption>('REG');

interface CreateGameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateGame: (rules: GameRules) => void;
}

export default function CreateGameModal({ isOpen, onClose, onCreateGame }: CreateGameModalProps) {
  const [rules, setRules] = useState<GameRules>({
    gameType: 'REGULAR',
    allowNil: true,
    allowBlindNil: true,
    minPoints: 500,
    maxPoints: 2500,
    coinAmount: 100000,
    specialRules: {
      screamer: false,
      assassin: false
    }
  });

  const handleCreateGame = () => {
    onCreateGame(rules);
    onClose();
  };

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-70" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-gray-800 p-6 text-left align-middle shadow-xl transition-all border border-white/20">
                <Dialog.Title
                  as="h3"
                  className="text-2xl font-bold leading-6 text-white text-center mb-4"
                >
                  Create New Game
                </Dialog.Title>
                
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Game Type
                    </label>
                    <select
                      className="w-full bg-gray-700 text-white rounded-md p-2"
                      value={rules.gameType}
                      onChange={(e) => setRules({ ...rules, gameType: e.target.value as any })}
                    >
                      <option value="REGULAR">Regular</option>
                      <option value="WHIZ">Whiz</option>
                      <option value="MIRROR">Mirror</option>
                      <option value="BID_THREE">Bid Three</option>
                      <option value="SUICIDE">Suicide</option>
                    </select>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-300">
                      Allow Nil Bids
                    </label>
                    <button
                      type="button"
                      className={`${
                        rules.allowNil ? 'bg-blue-600' : 'bg-gray-600'
                      } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                      onClick={() => setRules({ ...rules, allowNil: !rules.allowNil })}
                    >
                      <span
                        className={`${
                          rules.allowNil ? 'translate-x-5' : 'translate-x-0'
                        } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                      />
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-300">
                      Allow Blind Nil
                    </label>
                    <button
                      type="button"
                      className={`${
                        rules.allowBlindNil ? 'bg-blue-600' : 'bg-gray-600'
                      } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2`}
                      onClick={() => setRules({ ...rules, allowBlindNil: !rules.allowBlindNil })}
                    >
                      <span
                        className={`${
                          rules.allowBlindNil ? 'translate-x-5' : 'translate-x-0'
                        } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                      />
                    </button>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Minimum Points
                    </label>
                    <input
                      type="number"
                      className="w-full bg-gray-700 text-white rounded-md p-2"
                      value={rules.minPoints}
                      onChange={(e) => setRules({ ...rules, minPoints: parseInt(e.target.value) })}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Maximum Points
                    </label>
                    <input
                      type="number"
                      className="w-full bg-gray-700 text-white rounded-md p-2"
                      value={rules.maxPoints}
                      onChange={(e) => setRules({ ...rules, maxPoints: parseInt(e.target.value) })}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-1">
                      Coin Amount
                    </label>
                    <input
                      type="number"
                      className="w-full bg-gray-700 text-white rounded-md p-2"
                      value={rules.coinAmount}
                      onChange={(e) => setRules({ ...rules, coinAmount: parseInt(e.target.value) })}
                    />
                  </div>

                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-medium text-gray-300">
                      Screamer
                    </label>
                    <button
                      type="button"
                      className={`${
                        rules.specialRules?.screamer ? 'bg-red-600' : 'bg-gray-600'
                      } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2`}
                      onClick={() => setRules({ 
                        ...rules, 
                        specialRules: { 
                          screamer: !rules.specialRules?.screamer,
                          assassin: false // Disable assassin when screamer is enabled
                        } 
                      })}
                    >
                      <span
                        className={`${
                          rules.specialRules?.screamer ? 'translate-x-5' : 'translate-x-0'
                        } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                      />
                    </button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-300">
                      Assassin
                    </label>
                    <button
                      type="button"
                      className={`${
                        rules.specialRules?.assassin ? 'bg-purple-600' : 'bg-gray-600'
                      } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2`}
                      onClick={() => setRules({ 
                        ...rules, 
                        specialRules: { 
                          assassin: !rules.specialRules?.assassin,
                          screamer: false // Disable screamer when assassin is enabled
                        } 
                      })}
                    >
                      <span
                        className={`${
                          rules.specialRules?.assassin ? 'translate-x-5' : 'translate-x-0'
                        } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                      />
                    </button>
                  </div>
                </div>

                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                    onClick={handleCreateGame}
                  >
                    Create Game
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
} 