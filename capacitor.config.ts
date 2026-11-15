import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lantern.focus',
  appName: 'Lantern',
  webDir: 'dist',
  backgroundColor: '#14110F',
  plugins: {
    // Ember, to match --ember in tokens.css. The small status-bar icon is added with the Android platform in P7.
    LocalNotifications: { iconColor: '#FF7A3D' },
  },
};

export default config;
