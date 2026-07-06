import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { I18nextProvider } from 'react-i18next';
import i18n3d from './i18n';
import './index.css';
import App3 from './App3';

document.documentElement.lang = i18n3d.language;
document.documentElement.dir = i18n3d.dir();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n3d}>
      <App3 />
    </I18nextProvider>
  </StrictMode>,
);
