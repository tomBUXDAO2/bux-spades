import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Detect standalone mode and add class to body
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                    (window.navigator as any).standalone === true ||
                    document.referrer.includes('android-app://');

if (isStandalone) {
  document.body.classList.add('pwa-standalone');
  // Ensure full screen for both iOS and Android
  document.documentElement.style.height = '100%';
  document.documentElement.style.overflow = 'hidden';
  document.body.style.height = '100%';
  document.body.style.overflow = 'hidden';
  
  // Android Chrome: Hide address bar by scrolling to top
  if (/android/i.test(navigator.userAgent)) {
    window.scrollTo(0, 1);
    setTimeout(() => window.scrollTo(0, 0), 100);
  }
}

// Register service worker for PWA functionality
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
      })
      .catch((registrationError) => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
); 