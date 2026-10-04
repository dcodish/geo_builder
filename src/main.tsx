import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './index.css';
import App from './App';

// #910 (ADR-581): the dev step-through panel. `import.meta.env.DEV` is a build-time constant — `false` in a
// production build, so this branch and its lazy import are dropped and the panel is never bundled. In dev
// it mounts only on `?steps`, beside the real app (never a student-facing surface).
const StepPanel = import.meta.env.DEV ? lazy(() => import('./debug/StepPanel')) : null;
const showSteps = StepPanel !== null && new URLSearchParams(window.location.search).has('steps');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    {showSteps && StepPanel && (
      <Suspense fallback={null}>
        <StepPanel />
      </Suspense>
    )}
  </StrictMode>,
);
