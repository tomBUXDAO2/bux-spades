import React from 'react';
import { AppRegistry } from 'react-native';
import { createRoot } from 'react-dom/client';
import App from './src/App';

// Mobile-specific entry point
const MobileApp = () => {
  return <App />;
};

// Register for React Native
AppRegistry.registerComponent('BuxSpades', () => MobileApp);

// For web, render normally
if (typeof document !== 'undefined') {
  const container = document.getElementById('root');
  if (container) {
    const root = createRoot(container);
    root.render(<MobileApp />);
  }
}

export default MobileApp; 