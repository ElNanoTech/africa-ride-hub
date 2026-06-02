import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.017fc5255a164ead82a4cd0a37c0f243',
  appName: 'dam-africa-connect',
  webDir: 'dist',
  server: {
    url: 'https://017fc525-5a16-4ead-82a4-cd0a37c0f243.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scheme: 'DAMFlotte',
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
};

export default config;
