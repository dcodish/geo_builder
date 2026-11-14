import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import i18n3d from './i18n';
import './index.css';
import App3 from './App3';
import { CrashBoundary } from '../shell/frame/CrashBoundary';
import { devCrashMode } from '../shell/session/crash';
import { crashSession3 } from './store/sessionPersist3';
import { logCrash3 } from './debug/sessionLog3';
import { startWork3 } from './app/offPage3';

document.documentElement.lang = i18n3d.language;
document.documentElement.dir = i18n3d.dir();
// #2890 (ADR-3D-493): 3-D's worker starts with the page, so its chunk downloads beside the page's own
startWork3();

// #1507 (ADR-W-195): an error while drawing costs a notice and «שחזור», never the construction. The
// boundary sits inside the i18n provider (its notice reads the suite's keys) and around the whole app.
// `devCrash` is DEV ONLY: `import.meta.env.DEV` is a build-time false in production, so the ?crash
// trigger is never rendered there.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n3d}>
      <CrashBoundary session={crashSession3} onCrash={logCrash3} devCrash={import.meta.env.DEV ? devCrashMode(window.location.search) : null}>
        <App3 />
      </CrashBoundary>
    </I18nextProvider>
  </StrictMode>,
);
