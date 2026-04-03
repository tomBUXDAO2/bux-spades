import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.buxspades.app',
  appName: 'Bux Spades',
  webDir: 'dist',
  server: {
    // Allow cleartext (HTTP) in development; remove for production
    androidScheme: 'https',
  },
  ios: {
    contentInset: 'automatic',
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
