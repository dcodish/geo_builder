import { useTranslation } from 'react-i18next';
import { useConstructionStore } from '@/store';

export function StepHistory() {
  const { t } = useTranslation();
  const steps = useConstructionStore((s) => s.construction.steps);
  const clarification = useConstructionStore((s) => s.clarificationMessage);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <h3 style={{
        fontSize: '13px', fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '0.05em', color: 'var(--color-text-muted)',
      }}>
        {t('steps.title')}
      </h3>
      {steps.length === 0 && !clarification && (
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          {t('steps.empty')}
        </p>
      )}
      {clarification && (
        <div style={{
          padding: '10px', borderRadius: '6px',
          background: '#fffbeb', border: '1px solid #fde68a',
          fontSize: '14px', color: '#92400e',
        }} dir="auto">
          {clarification}
        </div>
      )}
      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {steps.map((step, i) => (
          <li key={step.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <span style={{
              flexShrink: 0, width: '26px', height: '26px', borderRadius: '50%',
              background: step.isError ? '#ef4444' : 'var(--color-primary)', color: 'white',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '12px', fontWeight: 'bold',
            }}>
              {step.isError ? '!' : i + 1}
            </span>
            <span style={{
              fontSize: '14px', lineHeight: 1.5, wordWrap: 'break-word',
              color: step.isError ? '#ef4444' : 'inherit',
              textDecoration: step.isError ? 'line-through' : 'none',
            }} dir="auto">
              {step.naturalLanguageInput}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
