import type { CapacitorConfig } from '@capacitor/cli';

const remoteUrl =
  process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: 'com.seenesthesia.app',
  appName: 'Seenesthesia',
  webDir: 'www',
  server: {
    url: remoteUrl,
    cleartext: false,
    androidScheme: 'https',
  },
};

export default config;
