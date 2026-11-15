import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { useEffect } from 'react';
import { Navigate, Route } from 'react-router-dom';

import { useLantern } from './data/store';
import { CapturePage } from './pages/Capture';
import { LibraryPage } from './pages/Library';
import { FocusPage } from './pages/Placeholders';
import { StyleGuidePage } from './pages/StyleGuide';
import { TodayPage } from './pages/Today';
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

const App: React.FC = () => {
  useStartup();
  return (
    <IonApp>
      <IonReactRouter>
        <IonRouterOutlet>
          <Route path="/today" element={<TodayPage />} />
          <Route path="/focus" element={<FocusPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/capture" element={<CapturePage />} />
          <Route path="/styleguide" element={<StyleGuidePage />} />
          <Route path="/" element={<Navigate to="/today" replace />} />
        </IonRouterOutlet>
        <Nav />
      </IonReactRouter>
      <div className="ln-grain" aria-hidden="true" />
    </IonApp>
  );
};

export default App;
