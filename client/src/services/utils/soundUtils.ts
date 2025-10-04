// Sound utility functions that respect user preferences
export const playCardSound = () => {
  try {
    // Check if sound is enabled (default to true if not set)
    const userData = localStorage.getItem('userData');
    let soundEnabled = true;
    
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        soundEnabled = parsed.soundEnabled !== false; // Default to true
      } catch (error) {
        console.log('Failed to parse user data for sound preference:', error);
      }
    }
    
    if (!soundEnabled) return;
    
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
