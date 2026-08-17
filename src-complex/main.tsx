import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import { App } from './App';
import { bootSession } from './app/session';
import { complexI18n } from './i18n';
import './styles.css';

// Which engine owns the session, and the session already open — read BEFORE the first paint, so the
// restored figure IS the first paint rather than something that arrives after it (app/session.ts).
bootSession();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={complexI18n}>
      <App />
    </I18nextProvider>
  </StrictMode>,
);
