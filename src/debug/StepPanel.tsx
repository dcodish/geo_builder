/**
 * #910 ([ADR-581](../../docs/06-decisions.md#adr-581)) — the DEV-ONLY step-through panel.
 *
 * Re-testing a step-5 failure used to mean retyping four steps. Paste the session's utterances (one per
 * line), press Run, and the panel replays them through `replaySession` — the REAL `parse → dryRun →
 * commit → replay` pipeline, no LLM — listing each step's category/outcome. Selecting a step shows the
 * figure AS OF that step ({@link figureAtStep}: re-derived from the facts committed so far, never a
 * retained figure), and "load into the builder" puts exactly those facts into the session so the next
 * line can be typed in the real app.
 *
 * A CONSUMER of `replaySession` only — it has no parse/commit path of its own, so it cannot drift from
 * production. Mounted by `main.tsx` behind `import.meta.env.DEV` + `?steps`, so a production build
 * neither renders nor bundles it (the DEV constant folds to `false` and the lazy import is dropped).
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Figure } from '@/render';
import { replaySession, figureAtStep, seedAtStep, type SessionReport, type StepCategory } from '@/validation/replaySession';
import { useGeoStore } from '@/store/geoStore';
import { deserializeFigure, serializeFigure } from '@/store/figureFile';

const CATEGORY_COLOR: Record<StepCategory, string> = {
  ok: '#2e7d32',
  'ok-amber': '#b26a00',
  deferred: '#1565c0',
  empty: '#6d4c41',
  'coverage-gap': '#c62828',
  edit: '#555',
};

/** The pasted text → the ordered utterance list (one per non-blank line). */
export const linesOf = (text: string): string[] => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

export interface StepPanelProps {
  /** Pre-filled session (tests / a deep link): when given, the panel starts already run. */
  initialText?: string;
  initialSelected?: number;
}

export default function StepPanel({ initialText = '', initialSelected }: StepPanelProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const [text, setText] = useState(initialText);
  // ReplayOpts.satisfyingSeed — exposed, never silently chosen: "what does the app show" (on) vs
  // "what does seed 0 show" (off) are different questions.
  const [satisfyingSeed, setSatisfyingSeed] = useState(true);
  const [report, setReport] = useState<SessionReport | null>(() =>
    initialText ? replaySession(linesOf(initialText)) : null,
  );
  const [selected, setSelected] = useState<number | null>(initialSelected ?? null);
  const fig = useMemo(
    () => (report && selected !== null ? figureAtStep(report, selected, { satisfyingSeed }) : null),
    [report, selected, satisfyingSeed],
  );

  const run = () => {
    setReport(replaySession(linesOf(text), { satisfyingSeed }));
    setSelected(null);
  };
  const loadIntoBuilder = () => {
    if (!report || selected === null) return;
    // Through the save envelope, so the builder receives exactly what a saved file would carry.
    const facts = report.factsAfter[selected];
    const seed = seedAtStep(report, selected, { satisfyingSeed });
    const loaded = deserializeFigure(serializeFigure({ facts, seed }));
    if (loaded.ok) useGeoStore.getState().loadFigure(loaded.file);
  };

  if (!open)
    return (
      <button type="button" style={{ ...shell, padding: '4px 10px' }} onClick={() => setOpen(true)} data-testid="step-panel-open">
        {t('devSteps.title')}
      </button>
    );

  return (
    <aside style={{ ...shell, width: 380, maxHeight: '90vh', overflow: 'auto', padding: 10 }} data-testid="step-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>{t('devSteps.title')}</strong>
        <button type="button" onClick={() => setOpen(false)} aria-label={t('devSteps.close')}>
          ×
        </button>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t('devSteps.placeholder')}
        rows={6}
        style={{ width: '100%', boxSizing: 'border-box', marginTop: 6, border: '1px solid #888', font: 'inherit' }}
      />
      <label style={{ display: 'block', margin: '4px 0' }}>
        <input type="checkbox" checked={satisfyingSeed} onChange={(e) => setSatisfyingSeed(e.target.checked)} />{' '}
        {t('devSteps.satisfyingSeed')}
      </label>
      <button type="button" style={btn} onClick={run}>
        {t('devSteps.run')}
      </button>
      {report && (
        <ol style={{ paddingInlineStart: 22 }} data-testid="dev-step-list">
          {report.steps.map((s, k) => (
            <li
              key={k}
              data-category={s.category}
              onClick={() => setSelected(k)}
              style={{ cursor: 'pointer', background: k === selected ? 'rgba(0,0,0,0.08)' : undefined, padding: 2 }}
            >
              <bdi>{s.utterance}</bdi>{' '}
              <span style={{ color: CATEGORY_COLOR[s.category], fontWeight: 600 }}>{s.category}</span>{' '}
              <code>{s.outcome}</code> {s.committed ? '✓' : '✗'}
              {s.alreadyDefined && <div>{t('devSteps.alreadyDefined', { ids: s.alreadyDefined.join(', ') })}</div>}
              {s.detail && <div style={{ fontSize: 11, opacity: 0.8 }}>{s.detail}</div>}
            </li>
          ))}
        </ol>
      )}
      {fig && selected !== null && (
        <div data-testid="dev-step-figure">
          <div>{t('devSteps.asOf', { n: selected + 1 })}</div>
          <Figure construction={fig.construction} positions={fig.positions} circles={fig.circles} width={356} height={280} />
          <button type="button" style={btn} onClick={loadIntoBuilder}>
            {t('devSteps.load')}
          </button>
        </div>
      )}
    </aside>
  );
}

const shell: CSSProperties = {
  position: 'fixed',
  bottom: 12,
  insetInlineEnd: 12, // the far side from the input box (RTL: left), so the next line can still be typed
  zIndex: 1000,
  background: 'var(--bg, #fff)',
  color: 'var(--fg, #111)',
  border: '1px solid #888',
  borderRadius: 6,
  boxShadow: '0 2px 10px rgba(0,0,0,0.25)',
  fontSize: 13,
};

const btn: CSSProperties = { border: '1px solid #888', borderRadius: 4, padding: '2px 10px', background: '#f3f3f3', color: '#111', cursor: 'pointer' };
