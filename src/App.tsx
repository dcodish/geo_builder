/**
 * App shell (Phase 3) — the usable build loop, driven by the store.
 *
 * Layout: canvas (engine → renderer) + a sidebar with the step log, undo/redo/
 * clear, and an alternatives toggle. A text input is present but disabled — the
 * parser that turns typed Hebrew/English into commands is Phase 4; until then a
 * row of "quick facts" drives the same store pipeline so the loop (accumulate,
 * stay stable, reject contradictions, undo) is exercisable end to end. i18n is
 * wired with Hebrew default and RTL. Old UI lives in /archive for reference.
 */
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'zustand';
import type { Command, Id, Vec } from '@/engine';
import { evaluate } from '@/engine';
import { Figure } from '@/render';
import { useGeoStore } from '@/store/geoStore';

export default function App() {
  const { t, i18n } = useTranslation();
  const construction = useGeoStore((s) => s.construction);
  const steps = useGeoStore((s) => s.steps);
  const lastError = useGeoStore((s) => s.lastError);
  const execute = useGeoStore((s) => s.execute);
  const cycleAlt = useGeoStore((s) => s.cycleAlt);
  const clear = useGeoStore((s) => s.clear);

  const { undo, redo } = useGeoStore.temporal.getState();
  const canUndo = useStore(useGeoStore.temporal, (t) => t.pastStates.length > 0);
  const canRedo = useStore(useGeoStore.temporal, (t) => t.futureStates.length > 0);

  // Keep the document direction in sync with the active language (RTL for he).
  useEffect(() => {
    document.documentElement.dir = i18n.dir();
    document.documentElement.lang = i18n.language;
  }, [i18n, i18n.language]);

  const positions = useMemo(() => {
    const e = evaluate(construction);
    return e.ok ? e.positions : new Map<Id, Vec>();
  }, [construction]);

  const branchId = construction.objects.find((o) => o.kind === 'intersection')?.id;

  const QUICK: { key: string; run: () => void }[] = [
    { key: 'demo.square', run: () => execute({ type: 'square', ids: ['A', 'B', 'C', 'D'] }, t('demo.square')) },
    { key: 'demo.pointOn', run: () => execute({ type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.4 }, t('demo.pointOn')) },
    { key: 'demo.badAngle', run: () => execute({ type: 'set-angle', vertex: 'A', ray1: 'G', ray2: 'B', value: 37 }, t('demo.badAngle')) },
    {
      key: 'demo.triangle',
      run: () => {
        const tri: Command[] = [
          { type: 'free-point', id: 'A', x: 0, y: 0 },
          { type: 'free-point', id: 'B', x: 6, y: 0 },
          { type: 'point-by-distances', id: 'C', from1: 'A', dist1: 5, from2: 'B', dist2: 5, branch: 0 },
        ];
        tri.forEach((c) => execute(c, t('demo.triangle')));
      },
    },
  ];

  return (
    <div style={page}>
      <header style={header}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{t('app.title')}</h1>
          <p style={{ color: '#64748b', margin: '4px 0 0', fontSize: 13 }}>{t('app.subtitle')}</p>
        </div>
        <button type="button" style={ghost} onClick={() => i18n.changeLanguage(i18n.language === 'he' ? 'en' : 'he')}>
          {t('actions.language')}
        </button>
      </header>

      <div style={main}>
        <Figure construction={construction} positions={positions} width={560} height={560} />

        <aside style={sidebar}>
          {/* Text input — disabled until the Phase-4 parser exists. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <input style={input} placeholder={t('input.placeholder')} disabled />
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{t('input.disabledNote')}</span>
          </div>

          <div>
            <div style={sectionLabel}>{t('demo.heading')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {QUICK.map((q) => (
                <button key={q.key} type="button" style={quick} onClick={q.run}>
                  {t(q.key)}
                </button>
              ))}
            </div>
          </div>

          {lastError && <div style={errorBanner}>⚠ {lastError}</div>}

          <div>
            <div style={sectionLabel}>{t('steps.title')}</div>
            {steps.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>{t('steps.empty')}</p>
            ) : (
              <ol style={stepList}>
                {steps.map((s, i) => (
                  <li key={i} style={stepRow(s.status === 'ok')}>
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                      {s.utterance ?? s.cmd.type}
                    </span>
                    {s.status === 'ok' ? (
                      <span style={{ color: '#16a34a', fontSize: 12 }}>✓</span>
                    ) : (
                      <span style={{ color: '#dc2626', fontSize: 11 }}>✗</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" style={ghost} disabled={!canUndo} onClick={() => undo()}>
              {t('actions.undo')}
            </button>
            <button type="button" style={ghost} disabled={!canRedo} onClick={() => redo()}>
              {t('actions.redo')}
            </button>
            <button type="button" style={ghost} onClick={clear}>
              {t('actions.clear')}
            </button>
          </div>

          {branchId && (
            <button type="button" style={alt} onClick={() => cycleAlt(branchId)}>
              {t('actions.another')}
            </button>
          )}
        </aside>
      </div>
    </div>
  );
}

const page: React.CSSProperties = {
  minHeight: '100vh',
  padding: 24,
  fontFamily: 'system-ui, sans-serif',
  color: '#0f172a',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
};
const header: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' };
const main: React.CSSProperties = { display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' };
const sidebar: React.CSSProperties = { width: 320, display: 'flex', flexDirection: 'column', gap: 16 };
const sectionLabel: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 6 };
const input: React.CSSProperties = {
  padding: '10px 12px',
  fontSize: 14,
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: '#f1f5f9',
  color: '#94a3b8',
};
const stepList: React.CSSProperties = { listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 };
const errorBanner: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid #fecaca',
  background: '#fef2f2',
  color: '#b91c1c',
};
const ghost: React.CSSProperties = {
  padding: '8px 14px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid #cbd5e1',
  background: '#fff',
  cursor: 'pointer',
};
const quick: React.CSSProperties = {
  padding: '8px 12px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid #bfdbfe',
  background: '#eff6ff',
  cursor: 'pointer',
  textAlign: 'start',
};
const alt: React.CSSProperties = {
  padding: '10px 14px',
  fontSize: 14,
  borderRadius: 8,
  border: '1px solid #7c3aed',
  background: '#7c3aed',
  color: '#fff',
  cursor: 'pointer',
};
function stepRow(ok: boolean): React.CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    borderRadius: 6,
    border: `1px solid ${ok ? '#e2e8f0' : '#fecaca'}`,
    background: ok ? '#f8fafc' : '#fef2f2',
  };
}
