// Audio management component for GameTable
// Handles audio initialization and sound effects

import { useEffect } from 'react';

// Preload audio files for better performance
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

// Initialize audio context and preload sounds
const initializeAudio = () => {
  try {
    // Create audio context to unlock audio (needed for browser autoplay policies)
    new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Preload audio files
    cardAudio = new Audio('/sounds/card.wav');
    cardAudio.volume = 0.3;
    cardAudio.preload = 'auto';
    
    bidAudio = new Audio('/sounds/bid.mp3');
    bidAudio.volume = 0.5;
    bidAudio.preload = 'auto';
    
    winAudio = new Audio('/sounds/win.mp3');
    winAudio.volume = 0.5;
    winAudio.preload = 'auto';
    
    cheeringAudio = new Audio('/sounds/cheering.mp3');
    cheeringAudio.volume = 0.6;
    cheeringAudio.preload = 'auto';
    
    positiveAudio = new Audio('/sounds/positive.mp3');
    positiveAudio.volume = 0.4;
    positiveAudio.preload = 'auto';
    
    negativeAudio = new Audio('/sounds/negative.mp3');
    negativeAudio.volume = 0.4;
    negativeAudio.preload = 'auto';
    
    kissAudio = new Audio('/sounds/kiss.mp3');
    kissAudio.volume = 0.4;
    kissAudio.preload = 'auto';
    
    fartAudio = new Audio('/sounds/fart.mp3');
    fartAudio.volume = 0.4;
    fartAudio.preload = 'auto';
    
    pukeAudio = new Audio('/sounds/puke.mp3');
    pukeAudio.volume = 0.4;
    pukeAudio.preload = 'auto';
    
    grrrAudio = new Audio('/sounds/grrrr.mp3');
    grrrAudio.volume = 0.4;
    grrrAudio.preload = 'auto';
    
    // Make audio available globally for other components
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
    
  } catch (error) {
    console.log('Audio initialization failed:', error);
  }
};

// Sound utility for dealing cards
export const playCardSound = () => {
  try {
    if (cardAudio) {
      cardAudio.currentTime = 0;
      cardAudio.play().catch(err => console.log('Card audio play failed:', err));
    } else {
      // Fallback if preloaded audio is not available
      const audio = new Audio('/sounds/card.wav');
      audio.volume = 0.3;
      audio.play().catch(err => console.log('Card audio play failed:', err));
    }
  } catch (error) {
    console.log('Card audio not supported or failed to load:', error);
  }
};

// Sound utility for bid
export const playBidSound = () => {
  try {
    if (bidAudio) {
      bidAudio.currentTime = 0;
      bidAudio.play().catch(err => console.log('Bid audio play failed:', err));
    } else {
      // Fallback if preloaded audio is not available
      const audio = new Audio('/sounds/bid.mp3');
      audio.volume = 0.5;
      audio.play().catch(err => console.log('Bid audio play failed:', err));
    }
  } catch (error) {
    console.log('Bid audio not supported or failed to load:', error);
  }
};

// Sound utility for win
export const playWinSound = () => {
  try {
    if (winAudio) {
      winAudio.currentTime = 0;
      winAudio.play().catch(err => console.log('Win audio play failed:', err));
    } else {
      // Fallback if preloaded audio is not available
      const audio = new Audio('/sounds/win.mp3');
      audio.volume = 0.5;
      audio.play().catch(err => console.log('Win audio play failed:', err));
    }
  } catch (error) {
    console.log('Win audio not supported or failed to load:', error);
  }
};

// Sound utility for cheering (winner celebration)
export const playCheeringSound = () => {
  try {
    if (cheeringAudio) {
      cheeringAudio.currentTime = 0;
      cheeringAudio.play().catch(err => console.log('Cheering audio play failed:', err));
    } else {
      // Fallback if preloaded audio is not available
      const audio = new Audio('/sounds/cheering.mp3');
      audio.volume = 0.6;
      audio.play().catch(err => console.log('Cheering audio play failed:', err));
    }
  } catch (error) {
    console.log('Cheering audio not supported or failed to load:', error);
  }
};

// Sound utilities for emoji reactions
export const playPositiveSound = () => {
  try {
    if (positiveAudio) {
      positiveAudio.currentTime = 0;
      positiveAudio.play().catch(err => console.log('Positive audio play failed:', err));
    } else {
      const audio = new Audio('/sounds/positive.mp3');
      audio.volume = 0.4;
      audio.play().catch(err => console.log('Positive audio play failed:', err));
    }
  } catch (error) {
    console.log('Positive audio not supported or failed to load:', error);
  }
};

export const playNegativeSound = () => {
  try {
    if (negativeAudio) {
      negativeAudio.currentTime = 0;
      negativeAudio.play().catch(err => console.log('Negative audio play failed:', err));
    } else {
      const audio = new Audio('/sounds/negative.mp3');
      audio.volume = 0.4;
      audio.play().catch(err => console.log('Negative audio play failed:', err));
    }
  } catch (error) {
    console.log('Negative audio not supported or failed to load:', error);
  }
};

export const playKissSound = () => {
  try {
    if (kissAudio) {
      kissAudio.currentTime = 0;
      kissAudio.play().catch(err => console.log('Kiss audio play failed:', err));
    } else {
      const audio = new Audio('/sounds/kiss.mp3');
      audio.volume = 0.4;
      audio.play().catch(err => console.log('Kiss audio play failed:', err));
    }
  } catch (error) {
    console.log('Kiss audio not supported or failed to load:', error);
  }
};

export const playFartSound = () => {
  try {
    if (fartAudio) {
      fartAudio.currentTime = 0;
      fartAudio.play().catch(err => console.log('Fart audio play failed:', err));
    } else {
      const audio = new Audio('/sounds/fart.mp3');
      audio.volume = 0.4;
      audio.play().catch(err => console.log('Fart audio play failed:', err));
    }
  } catch (error) {
    console.log('Fart audio not supported or failed to load:', error);
  }
};

export const playPukeSound = () => {
  try {
    if (pukeAudio) {
      pukeAudio.currentTime = 0;
      pukeAudio.play().catch(err => console.log('Puke audio play failed:', err));
    } else {
      const audio = new Audio('/sounds/puke.mp3');
      audio.volume = 0.4;
      audio.play().catch(err => console.log('Puke audio play failed:', err));
    }
  } catch (error) {
    console.log('Puke audio not supported or failed to load:', error);
  }
};

export const playGrrrSound = () => {
  try {
    if (grrrAudio) {
      grrrAudio.currentTime = 0;
      grrrAudio.play().catch(err => console.log('Grrr audio play failed:', err));
    } else {
      const audio = new Audio('/sounds/grrrr.mp3');
      audio.volume = 0.4;
      audio.play().catch(err => console.log('Grrr audio play failed:', err));
    }
  } catch (error) {
    console.log('Grrr audio not supported or failed to load:', error);
  }
};

// Audio Manager Hook
export const useAudioManager = () => {
  useEffect(() => {
    initializeAudio();
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
    playGrrrSound
  };
};
