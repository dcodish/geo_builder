import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useConstructionStore } from '@/store';
import { detectTheorems } from '@/engine/theorems/engine';
import type { TheoremMatch } from '@/engine/theorems/types';

export function TheoremPanel() {
  const { t, i18n } = useTranslation();
  const construction = useConstructionStore((s) => s.construction);
  const lang = i18n.language as 'en' | 'he';

  const theorems = useMemo(
    () => detectTheorems(construction),
    [construction],
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <h3 style={{
        fontSize: '13px', fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.05em', color: 'var(--color-text-muted)',
      }}>
        {t('theorems.title')}
      </h3>
      {theorems.length === 0 ? (
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          {t('theorems.empty')}
        </p>
      ) : (
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {theorems.map((th) => (
            <TheoremCard key={th.theoremId} match={th} lang={lang} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TheoremCard({ match, lang }: { match: TheoremMatch; lang: 'en' | 'he' }) {
  const { t } = useTranslation();
  const isDefinite = match.confidence === 'definite';

  return (
    <li style={{
      padding: '12px', borderRadius: '8px',
      border: '1px solid var(--color-border)', background: 'white',
      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
    }}>
      <div style={{ marginBottom: '6px' }}>
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
          fontSize: '11px', fontWeight: 600,
          background: isDefinite ? '#dcfce7' : '#fef3c7',
          color: isDefinite ? '#15803d' : '#b45309',
        }}>
          {isDefinite ? t('theorems.confidence.definite') : t('theorems.confidence.possible')}
        </span>
      </div>
      <p style={{
        fontSize: '14px', lineHeight: 1.6, color: 'var(--color-text)',
        wordWrap: 'break-word', overflowWrap: 'break-word',
      }} dir="auto">
        {match.statement[lang] || match.statement.en}
      </p>
    </li>
  );
}
