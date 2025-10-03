// Audio management component for GameTable
// Handles audio initialization and sound effects

import { useEffect } from 'react';

// Preload audio files for better performance
let cardAudio: HTMLAudioElement | null = null;
let bidAudio: HTMLAudioElement | null = null;
let winAudio: HTMLAudioElement | null = null;

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
    
    // Make audio available globally for other components
    (window as any).cardAudio = cardAudio;
    (window as any).bidAudio = bidAudio;
    (window as any).winAudio = winAudio;
    
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

// Audio Manager Hook
export const useAudioManager = () => {
  useEffect(() => {
    initializeAudio();
  }, []);

  return {
    playCardSound,
    playBidSound,
    playWinSound
  };
};
