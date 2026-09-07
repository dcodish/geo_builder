import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { App } from './App';
import { complexI18n } from './i18n';
import './styles.css';

// A builder opens EMPTY — no session is restored from browser storage (#919, ADR-W-046; operator ruling
// 2026-09-06: "clean canvas always", one rule for every tool). Durable work is an explicit save to a file.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={complexI18n}>
      <App />
    </I18nextProvider>
  </StrictMode>,
);
