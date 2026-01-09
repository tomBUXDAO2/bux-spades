// Audio management component for GameTable
// Handles audio initialization and sound effects

import { useEffect } from 'react';

// Cache initialised audio elements and context so the browser keeps autoplay permissions
let cardAudio: HTMLAudioElement | null = null;
let bidAudio: HTMLAudioElement | null = null;
let winAudio: HTMLAudioElement | null = null;
let cheeringAudio: HTMLAudioElement | null = null;
let positiveAudio: HTMLAudioElement | null = null;
let negativeAudio: HTMLAudioElement | null = null;
let kissAudio: HTMLAudioElement | null = null;
let fartAudio: HTMLAudioElement | null = null;
let pukeAudio: HTMLAudioElement | null = null;
let grrrAudio: HTMLAudioElement | null = null;
let audioContext: AudioContext | null = null;
let audioInitialized = false;

type EmojiSoundHandlers =
  | 'positive'
  | 'negative'
  | 'kiss'
  | 'fart'
  | 'puke'
  | 'grrr';

const EMOJI_SOUND_MAP: Record<string, EmojiSoundHandlers> = {
  '🤣': 'positive',
  '😎': 'positive',
  '🥳': 'positive',
  '🤪': 'positive',
  '👍': 'positive',
  '🍀': 'positive',
  '😭': 'negative',
  '👎': 'negative',
  '🤦': 'negative',
  '🥰': 'kiss',
  '❤️': 'kiss',
  '💩': 'fart',
  '🤮': 'puke',
  '😬': 'grrr',
  '🤬': 'grrr',
  '🖕': 'grrr',
  '🐢': 'grrr',
  '🛍️': 'grrr'
};

const audioDebugLog = (label: string, payload?: Record<string, unknown>) => {
  const debugPayload = {
    initialized: audioInitialized,
    hasContext: !!audioContext,
    ...payload
  };
  console.log(`[AUDIO DEBUG] ${label}`, debugPayload);
  (window as any).__lastAudioDebug = debugPayload;
};

const ensureAudioInitialized = () => {
  if (!audioInitialized) {
    audioDebugLog('ensureAudioInitialized() -> bootstrapping');
    initializeAudio();
  }
};

const createAudioElement = (src: string, volume: number) => {
  try {
    const audio = new Audio(src);
    audio.volume = volume;
    audio.preload = 'auto';
    audio.load();
    return audio;
  } catch (error) {
    console.log('[AUDIO] Failed to create audio element:', src, error);
    return null;
  }
};

const playWithFallback = (
  audioGetter: () => HTMLAudioElement | null,
  src: string,
  volume: number,
  label: string
) => {
  const primary = audioGetter();
  const attemptPlayback = (element: HTMLAudioElement | null, isFallback = false) => {
    if (!element) {
      audioDebugLog(`${label} ${isFallback ? 'fallback' : 'primary'} missing element`);
      return;
    }

    element.currentTime = 0;
    element.play()
      .then(() => {
        audioDebugLog(`${label} ${isFallback ? 'fallback ' : ''}success`);
        if (isFallback) {
          // reset fallback element so future plays reuse preloaded audio
          element.pause();
          element.currentTime = 0;
        }
      })
      .catch(err => {
        audioDebugLog(`${label} ${isFallback ? 'fallback ' : ''}rejected`, { error: err?.message || err });
        console.log(`${label} audio play failed:`, err);
        if (!isFallback) {
          // Try a throwaway element as a last resort
          const throwaway = createAudioElement(src, volume);
          attemptPlayback(throwaway, true);
        }
      });
  };

  attemptPlayback(primary, false);
};

// Initialize audio context and preload sounds
const initializeAudio = () => {
  if (audioInitialized) return;

  // Attempt to create (but do not depend on) an AudioContext to satisfy autoplay policies
  try {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextCtor) {
      try {
        audioContext = new AudioContextCtor();
      } catch (error) {
        console.log('[AUDIO] AudioContext init failed (continuing without it):', error);
        audioContext = null;
      }
    }
  } catch (error) {
    console.log('[AUDIO] Unexpected AudioContext error (continuing):', error);
    audioContext = null;
  }

  cardAudio = createAudioElement('/sounds/card.wav', 0.3);
  bidAudio = createAudioElement('/sounds/bid.mp3', 0.5);
  winAudio = createAudioElement('/sounds/win.mp3', 0.5);
  cheeringAudio = createAudioElement('/sounds/cheering.mp3', 0.6);
  positiveAudio = createAudioElement('/sounds/positive.mp3', 0.4);
  negativeAudio = createAudioElement('/sounds/negative.mp3', 0.4);
  kissAudio = createAudioElement('/sounds/kiss.mp3', 0.4);
  fartAudio = createAudioElement('/sounds/fart.mp3', 0.4);
  pukeAudio = createAudioElement('/sounds/puke.mp3', 0.4);
  grrrAudio = createAudioElement('/sounds/grrrr.mp3', 0.4);

  // Make audio available globally for other components (soundUtils)
  (window as any).cardAudio = cardAudio;
  (window as any).bidAudio = bidAudio;
  (window as any).winAudio = winAudio;
  (window as any).cheeringAudio = cheeringAudio;
  (window as any).positiveAudio = positiveAudio;
  (window as any).negativeAudio = negativeAudio;
  (window as any).kissAudio = kissAudio;
  (window as any).fartAudio = fartAudio;
  (window as any).pukeAudio = pukeAudio;
  (window as any).grrrAudio = grrrAudio;

  audioInitialized = true;
  audioDebugLog('initializeAudio() complete', {
    hasCard: !!cardAudio,
    hasBid: !!bidAudio,
    hasWin: !!winAudio
  });
};

// Helper function to check if sound is enabled
const isSoundEnabled = (): boolean => {
  const userData = localStorage.getItem('userData');
  if (userData) {
    try {
      const parsed = JSON.parse(userData);
      return parsed.soundEnabled !== false; // Default to true
    } catch (error) {
      return true; // Default to true if parsing fails
    }
  }
  return true; // Default to true if no userData
};

// Sound utility for dealing cards
export const playCardSound = () => {
  try {
    ensureAudioInitialized();
    if (!isSoundEnabled()) return;
    
    const getAudio = () => cardAudio || (cardAudio = createAudioElement('/sounds/card.wav', 0.3));
    audioDebugLog('playCardSound()', { hasElement: !!cardAudio, currentTime: cardAudio?.currentTime });
    playWithFallback(getAudio, '/sounds/card.wav', 0.3, 'playCardSound()');
  } catch (error) {
    console.log('Card audio not supported or failed to load:', error);
  }
};

// Sound utility for bid
export const playBidSound = () => {
  try {
    ensureAudioInitialized();
    if (!isSoundEnabled()) return;
    
    const getAudio = () => bidAudio || (bidAudio = createAudioElement('/sounds/bid.mp3', 0.5));
    audioDebugLog('playBidSound()', { hasElement: !!bidAudio, currentTime: bidAudio?.currentTime });
    playWithFallback(getAudio, '/sounds/bid.mp3', 0.5, 'playBidSound()');
  } catch (error) {
    console.log('Bid audio not supported or failed to load:', error);
  }
};

// Sound utility for win
export const playWinSound = () => {
  try {
    ensureAudioInitialized();
    if (!isSoundEnabled()) return;
    
    const getAudio = () => winAudio || (winAudio = createAudioElement('/sounds/win.mp3', 0.5));
    audioDebugLog('playWinSound()', { hasElement: !!winAudio, currentTime: winAudio?.currentTime });
    playWithFallback(getAudio, '/sounds/win.mp3', 0.5, 'playWinSound()');
  } catch (error) {
    console.log('Win audio not supported or failed to load:', error);
  }
};

// Sound utility for cheering (winner celebration)
export const playCheeringSound = () => {
  try {
    ensureAudioInitialized();
    if (!isSoundEnabled()) return;
    
    const getAudio = () => cheeringAudio || (cheeringAudio = createAudioElement('/sounds/cheering.mp3', 0.6));
    playWithFallback(getAudio, '/sounds/cheering.mp3', 0.6, 'playCheeringSound()');
  } catch (error) {
    console.log('Cheering audio not supported or failed to load:', error);
  }
};

// Sound utilities for emoji reactions
export const playPositiveSound = () => {
  try {
    ensureAudioInitialized();
    if (!isSoundEnabled()) return;
    
    const getAudio = () => positiveAudio || (positiveAudio = createAudioElement('/sounds/positive.mp3', 0.4));
    playWithFallback(getAudio, '/sounds/positive.mp3', 0.4, 'playPositiveSound()');
  } catch (error) {
    console.log('Positive audio not supported or failed to load:', error);
  }
};

export const playNegativeSound = () => {
  try {
    ensureAudioInitialized();
    if (!isSoundEnabled()) return;
    
    const getAudio = () => negativeAudio || (negativeAudio = createAudioElement('/sounds/negative.mp3', 0.4));
    playWithFallback(getAudio, '/sounds/negative.mp3', 0.4, 'playNegativeSound()');
  } catch (error) {
    console.log('Negative audio not supported or failed to load:', error);
  }
};

export const playKissSound = () => {
  try {
    ensureAudioInitialized();
    if (!isSoundEnabled()) return;
    
    const getAudio = () => kissAudio || (kissAudio = createAudioElement('/sounds/kiss.mp3', 0.4));
    playWithFallback(getAudio, '/sounds/kiss.mp3', 0.4, 'playKissSound()');
  } catch (error) {
    console.log('Kiss audio not supported or failed to load:', error);
  }
};

export const playFartSound = () => {
  try {
    ensureAudioInitialized();
    if (!isSoundEnabled()) return;
    
    const getAudio = () => fartAudio || (fartAudio = createAudioElement('/sounds/fart.mp3', 0.4));
    playWithFallback(getAudio, '/sounds/fart.mp3', 0.4, 'playFartSound()');
  } catch (error) {
    console.log('Fart audio not supported or failed to load:', error);
  }
};

export const playPukeSound = () => {
  try {
    ensureAudioInitialized();
    if (!isSoundEnabled()) return;
    
    const getAudio = () => pukeAudio || (pukeAudio = createAudioElement('/sounds/puke.mp3', 0.4));
    playWithFallback(getAudio, '/sounds/puke.mp3', 0.4, 'playPukeSound()');
  } catch (error) {
    console.log('Puke audio not supported or failed to load:', error);
  }
};

export const playGrrrSound = () => {
  try {
    ensureAudioInitialized();
    if (!isSoundEnabled()) return;
    
    const getAudio = () => grrrAudio || (grrrAudio = createAudioElement('/sounds/grrrr.mp3', 0.4));
    playWithFallback(getAudio, '/sounds/grrrr.mp3', 0.4, 'playGrrrSound()');
  } catch (error) {
    console.log('Grrr audio not supported or failed to load:', error);
  }
};

export const playEmojiSound = (emoji: string) => {
  const soundType = EMOJI_SOUND_MAP[emoji];
  if (!soundType) return;

  switch (soundType) {
    case 'positive':
      playPositiveSound();
      break;
    case 'negative':
      playNegativeSound();
      break;
    case 'kiss':
      playKissSound();
      break;
    case 'fart':
      playFartSound();
      break;
    case 'puke':
      playPukeSound();
      break;
    case 'grrr':
      playGrrrSound();
      break;
  }
};

export const playCardDealingSound = () => {
  try {
    ensureAudioInitialized();
    if (!isSoundEnabled()) return;

    // Play card.wav 13 times (one for each card) with staggered timing
    for (let i = 0; i < 13; i++) {
      setTimeout(() => {
        const tempAudio = createAudioElement('/sounds/card.wav', 0.3);
        if (!tempAudio) return;
        tempAudio.play().catch(err => console.log('Card dealing audio play failed:', err));
      }, i * 100); // 100ms delay between each card sound
    }
  } catch (error) {
    console.log('Card dealing audio not supported or failed to load:', error);
  }
};

// Audio Manager Hook
export const useAudioManager = () => {
  useEffect(() => {
    initializeAudio();
    
    // Unlock audio on first user interaction (required by browsers)
    const unlockAudio = () => {
      try {
        if (audioContext && audioContext.state === 'suspended') {
          audioContext.resume().catch(() => {});
        }

        const silentAudio = cardAudio || createAudioElement('/sounds/card.wav', 0);
        if (silentAudio) {
          const originalVolume = silentAudio.volume;
          silentAudio.volume = 0;
          silentAudio.play().then(() => {
            silentAudio.pause();
            silentAudio.currentTime = 0;
            silentAudio.volume = originalVolume;
            console.log('[AUDIO] Audio unlocked by user interaction');
          }).catch(() => {
            // Audio unlock failed, but this is normal if already unlocked
          });
        }

        // Remove listener after first unlock
        document.removeEventListener('click', unlockAudio);
        document.removeEventListener('pointerdown', unlockAudio);
        document.removeEventListener('touchstart', unlockAudio);
        document.removeEventListener('keydown', unlockAudio);
      } catch (error) {
        console.log('[AUDIO] Audio unlock failed:', error);
      }
    };
    
    // Add listeners for various user interactions
    document.addEventListener('click', unlockAudio, { once: false });
    document.addEventListener('pointerdown', unlockAudio, { once: false });
    document.addEventListener('touchstart', unlockAudio, { once: false });
    document.addEventListener('keydown', unlockAudio, { once: false });
    
    return () => {
      document.removeEventListener('click', unlockAudio);
      document.removeEventListener('pointerdown', unlockAudio);
      document.removeEventListener('touchstart', unlockAudio);
      document.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  return {
    playCardSound,
    playBidSound,
    playWinSound,
    playCheeringSound,
    playPositiveSound,
    playNegativeSound,
    playKissSound,
    playFartSound,
    playPukeSound,
    playGrrrSound,
    playEmojiSound,
    playCardDealingSound
  };
};
