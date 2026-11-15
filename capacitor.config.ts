import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lantern.focus',
  appName: 'Lantern',
  webDir: 'dist',
  backgroundColor: '#14110F',
  plugins: {
    // Ember, to match --ember in tokens.css. The small icon is android/app/src/main/res/drawable/ic_stat_lantern.xml.
    LocalNotifications: { iconColor: '#FF7A3D', smallIcon: 'ic_stat_lantern' },
  },
};

export default config;
