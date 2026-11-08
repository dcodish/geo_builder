import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './index.css';
import App from './App';
import { CrashBoundary } from '../shell/frame/CrashBoundary';
import { devCrashMode } from '../shell/session/crash';
import { geoCrashSession } from './store/sessionPersist';
import { logCrash } from './debug/sessionLog';

// #910 (ADR-581): the dev step-through panel. `import.meta.env.DEV` is a build-time constant — `false` in a
// production build, so this branch and its lazy import are dropped and the panel is never bundled. In dev
// it mounts only on `?steps`, beside the real app (never a student-facing surface).
const StepPanel = import.meta.env.DEV ? lazy(() => import('./debug/StepPanel')) : null;
const showSteps = StepPanel !== null && new URLSearchParams(window.location.search).has('steps');

// #1507 (ADR-W-195): an error while drawing costs a notice and «שחזור», never the construction. The
// boundary goes around the whole app; its notice reads the suite's keys through the instance `./i18n` registers.
// `devCrash` is DEV ONLY: `import.meta.env.DEV` is a build-time false in production, so the ?crash
// trigger is never rendered there.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CrashBoundary session={geoCrashSession} onCrash={logCrash} devCrash={import.meta.env.DEV ? devCrashMode(window.location.search) : null}>
      <App />
    </CrashBoundary>
    {showSteps && StepPanel && (
      <Suspense fallback={null}>
        <StepPanel />
      </Suspense>
    )}
  </StrictMode>,
);
