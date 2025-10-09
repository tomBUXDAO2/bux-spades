// Sound utility functions that respect user preferences

// Helper function to check if sound is enabled
const isSoundEnabled = (): boolean => {
  const userData = localStorage.getItem('userData');
  if (userData) {
    try {
      const parsed = JSON.parse(userData);
      const soundEnabled = parsed.soundEnabled !== false; // Default to true
      console.log(`[SOUND CHECK] User: ${parsed.username}, soundEnabled field: ${parsed.soundEnabled}, result: ${soundEnabled}`);
      if (!soundEnabled) {
        console.log(`[SOUND] Sound muted for user ${parsed.username}`);
      }
      return soundEnabled;
    } catch (error) {
      console.log('[SOUND CHECK] Failed to parse user data for sound preference:', error);
      return true; // Default to true if parsing fails
    }
  }
  console.log('[SOUND CHECK] No userData found, defaulting to true');
  return true; // Default to true if no userData
};
export const playCardSound = () => {
  try {
    if (!isSoundEnabled()) return;
    
    if ((window as any).cardAudio) {
      (window as any).cardAudio.currentTime = 0;
      (window as any).cardAudio.play().catch((err: any) => console.log('Card audio play failed:', err));
    } else {
      const audio = new Audio('/sounds/card.wav');
      audio.volume = 0.3;
      audio.play().catch((err: any) => console.log('Card audio play failed:', err));
    }
  } catch (error) {
    console.log('Card audio not supported or failed to load:', error);
  }
};

export const playBidSound = () => {
  try {
    if (!isSoundEnabled()) return;
    
    if ((window as any).bidAudio) {
      (window as any).bidAudio.currentTime = 0;
      (window as any).bidAudio.play().catch((err: any) => console.log('Bid audio play failed:', err));
    } else {
      const audio = new Audio('/sounds/bid.mp3');
      audio.volume = 0.5;
      audio.play().catch((err: any) => console.log('Bid audio play failed:', err));
    }
  } catch (error) {
    console.log('Bid audio not supported or failed to load:', error);
  }
};

export const playWinSound = () => {
  try {
    if (!isSoundEnabled()) return;
    
    if ((window as any).winAudio) {
      (window as any).winAudio.currentTime = 0;
      (window as any).winAudio.play().catch((err: any) => console.log('Win audio play failed:', err));
    } else {
      const audio = new Audio('/sounds/win.mp3');
      audio.volume = 0.5;
      audio.play().catch((err: any) => console.log('Win audio play failed:', err));
    }
  } catch (error) {
    console.log('Win audio not supported or failed to load:', error);
  }
};

export const playCheeringSound = () => {
  try {
    if (!isSoundEnabled()) return;
    
    if ((window as any).cheeringAudio) {
      (window as any).cheeringAudio.currentTime = 0;
      (window as any).cheeringAudio.play().catch((err: any) => console.log('Cheering audio play failed:', err));
    } else {
      const audio = new Audio('/sounds/cheering.mp3');
      audio.volume = 0.6;
      audio.play().catch((err: any) => console.log('Cheering audio play failed:', err));
    }
  } catch (error) {
    console.log('Cheering audio not supported or failed to load:', error);
  }
};

// Emoji-to-sound mapping - only includes emojis from EMOJI_OPTIONS in PlayerProfileDropdown
const EMOJI_SOUND_MAP: Record<string, string> = {
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

// Individual emoji sound functions
export const playPositiveSound = () => {
  try {
    if (!isSoundEnabled()) return;
    
    if ((window as any).positiveAudio) {
      (window as any).positiveAudio.currentTime = 0;
      (window as any).positiveAudio.play().catch((err: any) => console.log('Positive audio play failed:', err));
    } else {
      const audio = new Audio('/sounds/positive.mp3');
      audio.volume = 0.4;
      audio.play().catch((err: any) => console.log('Positive audio play failed:', err));
    }
  } catch (error) {
    console.log('Positive audio not supported or failed to load:', error);
  }
};

export const playNegativeSound = () => {
  try {
    if (!isSoundEnabled()) return;
    
    if ((window as any).negativeAudio) {
      (window as any).negativeAudio.currentTime = 0;
      (window as any).negativeAudio.play().catch((err: any) => console.log('Negative audio play failed:', err));
    } else {
      const audio = new Audio('/sounds/negative.mp3');
      audio.volume = 0.4;
      audio.play().catch((err: any) => console.log('Negative audio play failed:', err));
    }
  } catch (error) {
    console.log('Negative audio not supported or failed to load:', error);
  }
};

export const playKissSound = () => {
  try {
    if (!isSoundEnabled()) return;
    
    if ((window as any).kissAudio) {
      (window as any).kissAudio.currentTime = 0;
      (window as any).kissAudio.play().catch((err: any) => console.log('Kiss audio play failed:', err));
    } else {
      const audio = new Audio('/sounds/kiss.mp3');
      audio.volume = 0.4;
      audio.play().catch((err: any) => console.log('Kiss audio play failed:', err));
    }
  } catch (error) {
    console.log('Kiss audio not supported or failed to load:', error);
  }
};

export const playFartSound = () => {
  try {
    if (!isSoundEnabled()) return;
    
    if ((window as any).fartAudio) {
      (window as any).fartAudio.currentTime = 0;
      (window as any).fartAudio.play().catch((err: any) => console.log('Fart audio play failed:', err));
    } else {
      const audio = new Audio('/sounds/fart.mp3');
      audio.volume = 0.4;
      audio.play().catch((err: any) => console.log('Fart audio play failed:', err));
    }
  } catch (error) {
    console.log('Fart audio not supported or failed to load:', error);
  }
};

export const playPukeSound = () => {
  try {
    if (!isSoundEnabled()) return;
    
    if ((window as any).pukeAudio) {
      (window as any).pukeAudio.currentTime = 0;
      (window as any).pukeAudio.play().catch((err: any) => console.log('Puke audio play failed:', err));
    } else {
      const audio = new Audio('/sounds/puke.mp3');
      audio.volume = 0.4;
      audio.play().catch((err: any) => console.log('Puke audio play failed:', err));
    }
  } catch (error) {
    console.log('Puke audio not supported or failed to load:', error);
  }
};

export const playGrrrSound = () => {
  try {
    if (!isSoundEnabled()) return;
    
    if ((window as any).grrrAudio) {
      (window as any).grrrAudio.currentTime = 0;
      (window as any).grrrAudio.play().catch((err: any) => console.log('Grrr audio play failed:', err));
    } else {
      const audio = new Audio('/sounds/grrrr.mp3');
      audio.volume = 0.4;
      audio.play().catch((err: any) => console.log('Grrr audio play failed:', err));
    }
  } catch (error) {
    console.log('Grrr audio not supported or failed to load:', error);
  }
};

// Main function to play emoji sound based on emoji type
export const playEmojiSound = (emoji: string) => {
  const soundType = EMOJI_SOUND_MAP[emoji];
  if (!soundType || soundType === '') return; // No sound for unmapped emojis or empty string
  
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

// Play card dealing sound effect (13 times in quick succession)
export const playCardDealingSound = () => {
  try {
    const userData = localStorage.getItem('userData');
    let soundEnabled = true;
    
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        soundEnabled = parsed.soundEnabled !== false;
      } catch (error) {
        console.log('Failed to parse user data for sound preference:', error);
      }
    }
    
    if (!soundEnabled) return;
    
        // Play card.wav 7 times with slightly longer intervals (150ms apart)
        for (let i = 0; i < 7; i++) {
          setTimeout(() => {
            try {
              const audio = new Audio('/sounds/card.wav');
              audio.volume = 0.3;
              audio.play().catch((err: any) => console.log('Card dealing audio play failed:', err));
            } catch (error) {
              console.log('Card dealing audio not supported:', error);
            }
          }, i * 150); // 150ms between each card sound
        }
  } catch (error) {
    console.log('Card dealing audio not supported or failed to load:', error);
  }
};
