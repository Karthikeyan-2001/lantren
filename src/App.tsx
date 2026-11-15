import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { useEffect } from 'react';
import { Navigate, Route, useLocation } from 'react-router-dom';

import { useLantern } from './data/store';
import { useFocus, useFocusLifecycle } from './focus/useFocus';
import { CapturePage } from './pages/Capture';
import { FocusPage } from './pages/Focus';
import { LibraryPage } from './pages/Library';
import { ProgressPage } from './pages/Progress';
import { ReviewPage } from './pages/Review';
import { SettingsPage } from './pages/Settings';
import { StyleGuidePage } from './pages/StyleGuide';
import { TodayPage } from './pages/Today';
import { TracksPage } from './pages/Tracks';
import { useReminderSync } from './reminders/useReminders';
import { Nav } from './ui/Nav';

/* Ionic: structure only. No Ionic palettes, typography or component themes. */
import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';

/* Self-hosted fonts, so the app looks right in airplane mode. */
import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/fraunces/full-italic.css';
import '@fontsource-variable/source-sans-3/index.css';
import '@fontsource/dm-mono/latin-300.css';
import '@fontsource/dm-mono/latin-400.css';
import '@fontsource/dm-mono/latin-500.css';

import './theme/tokens.css';
import './theme/base.css';
import './ui/ui.css';

// One mode on every platform and no stock page transitions or ripples: the look is Lantern's own.
setupIonicReact({ mode: 'md', animated: false, rippleEffect: false });

function useStartup() {
  useEffect(() => {
    void useLantern.getState().load();
    // Ask the browser not to evict our data under storage pressure. Silently ignored where unsupported.
    void navigator.storage?.persist?.().catch(() => false);
  }, []);
}

/** Lives inside the router so a tapped reminder can open its review. Draws nothing. */
function Reminders() {
  useReminderSync();
  return null;
}

/** The navigation steps aside while a focus session or its break fills the Focus screen. */
function AppNav() {
  const { pathname } = useLocation();
  const phase = useFocus((s) => s.phase);
  return <Nav hidden={pathname.startsWith('/focus') && phase !== 'idle'} />;
}

const App: React.FC = () => {
  useStartup();
  useFocusLifecycle();
  return (
    <IonApp>
      <IonReactRouter>
        <IonRouterOutlet>
          <Route path="/today" element={<TodayPage />} />
          <Route path="/focus" element={<FocusPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/capture" element={<CapturePage />} />
          <Route path="/review/:reviewId" element={<ReviewPage />} />
          <Route path="/progress" element={<ProgressPage />} />
          <Route path="/tracks" element={<TracksPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/styleguide" element={<StyleGuidePage />} />
          <Route path="/" element={<Navigate to="/today" replace />} />
        </IonRouterOutlet>
        <AppNav />
        <Reminders />
      </IonReactRouter>
      <div className="ln-grain" aria-hidden="true" />
    </IonApp>
  );
};

export default App;
