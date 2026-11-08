import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { App } from './App';
import { complexI18n } from './i18n';
import { CrashBoundary } from '../shell/frame/CrashBoundary';
import { devCrashMode } from '../shell/session/crash';
import { crashSessionCx } from './app/sessionPersistCx';
import { logCrashComplex } from './debug/sessionLogComplex';
import './styles.css';

// A builder opens EMPTY — no session is restored from browser storage (#919, ADR-W-046; operator ruling
// 2026-09-06: "clean canvas always", one rule for every tool). Durable work is an explicit save to a file.

// #1507 (ADR-W-193): an error while drawing costs a notice and «שחזור», never the construction. The
// boundary sits inside the i18n provider (its notice reads the suite's keys) and around the whole app.
// `devCrash` is DEV ONLY: `import.meta.env.DEV` is a build-time false in production, so the ?crash
// trigger is never rendered there.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={complexI18n}>
      <CrashBoundary session={crashSessionCx} onCrash={logCrashComplex} devCrash={import.meta.env.DEV ? devCrashMode(window.location.search) : null}>
        <App />
      </CrashBoundary>
    </I18nextProvider>
  </StrictMode>,
);
