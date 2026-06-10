import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { useConstructionStore } from '@/store';
import { GeometryCanvas } from '../canvas/GeometryCanvas';
import { NaturalLanguageInput } from '../input/NaturalLanguageInput';
import { StepHistory } from '../input/StepHistory';
import { TheoremPanel } from '../theorems/TheoremPanel';

export function AppLayout() {
  const { t, i18n } = useTranslation();
  const reset = useConstructionStore((s) => s.reset);

  useEffect(() => {
    const dir = i18n.dir();
    document.documentElement.dir = dir;
    document.documentElement.lang = i18n.language;
  }, [i18n, i18n.language]);

  function toggleLanguage() {
    const next = i18n.language === 'he' ? 'en' : 'he';
    i18n.changeLanguage(next);
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <header style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
        background: 'white',
        borderBottom: '1px solid var(--color-border)',
      }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 'bold' }}>{t('app.title')}</h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)' }}>{t('app.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={reset}
            style={{
              padding: '6px 14px', fontSize: '14px', borderRadius: '6px',
              border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer',
            }}
          >
            {t('actions.clear')}
          </button>
          <button
            onClick={toggleLanguage}
            style={{
              padding: '6px 14px', fontSize: '14px', borderRadius: '6px',
              border: '1px solid var(--color-border)', background: 'white', cursor: 'pointer', fontWeight: 500,
            }}
          >
            {t('actions.language')}
          </button>
        </div>
      </header>

      {/* Middle row: sidebars + canvas */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {/* Left sidebar: Theorems */}
        <aside style={{
          width: '300px', flexShrink: 0,
          padding: '16px', overflowY: 'auto', overflowX: 'hidden',
          borderInlineEnd: '1px solid var(--color-border)',
          background: 'var(--color-surface-dim)',
        }}>
          <TheoremPanel />
        </aside>

        {/* Center: Canvas */}
        <main style={{ flex: 1, minWidth: 0, padding: '12px' }}>
          <GeometryCanvas />
        </main>

        {/* Right sidebar: Steps */}
        <aside style={{
          width: '260px', flexShrink: 0,
          padding: '16px', overflowY: 'auto', overflowX: 'hidden',
          borderInlineStart: '1px solid var(--color-border)',
          background: 'var(--color-surface-dim)',
        }}>
          <StepHistory />
        </aside>
      </div>

      {/* Input bar — fixed at bottom */}
      <div style={{
        flexShrink: 0,
        padding: '14px 20px',
        background: 'white',
        borderTop: '3px solid var(--color-primary)',
        boxShadow: '0 -4px 12px rgba(0,0,0,0.08)',
      }}>
        <NaturalLanguageInput />
      </div>
    </div>
  );
}
