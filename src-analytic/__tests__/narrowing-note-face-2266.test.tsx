/**
 * #2266 (ADR-W-180) — analytic's forced-narrowing note turns from the amber warning to the blue ⓘ strip, as 2-D has it.
 * Operator, 2026-10-16: *"2266 - A"*. Its #1863 twin, the ellipse the givens make a circle, sits in the same channel
 * (ADR-AG-377 item 4) and goes with it. The notes arrive after paint, so a server render of the App never reaches them:
 * the lock renders the page's own `NarrowingNotes` over the real `narrowingNotesOf` / `circleNotesOf`, and a source
 * check says the App mounts it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { useAnalyticStore } from '../store/useAnalyticStore';
import { NarrowingNotes } from '../app/NarrowingNotes';
import { narrowingNotesOf } from '../app/narrowing';
import { circleNotesOf } from '../app/conicMarks';
import { derive } from '../engine/derive';
import { analyticI18n } from '../i18n';
import { stripFormatControls } from '../../shell/bidi';
import { noteFaceFaults, noteMarkup } from '../../shell/__tests__/fixtures/narrowing-note-rows';

vi.mock('../store/useAnalyticStore', async (importOriginal) => {
  const m = await importOriginal<typeof import('../store/useAnalyticStore')>();
  const real = m.useAnalyticStore;
  const live = (sel?: (s: ReturnType<typeof real.getState>) => unknown) => (sel ? sel(real.getState()) : real.getState());
  return { ...m, useAnalyticStore: Object.assign(live, real) };
});

const t = (k: string, o?: Record<string, unknown>) => analyticI18n.getFixedT('he')(k, o) as string;

function page(lines: string[]): string {
  const d = derive(lines, 0);
  return renderToStaticMarkup(
    <NarrowingNotes
      notes={narrowingNotesOf(lines, d)}
      circles={circleNotesOf(lines, d, (ls) => derive(ls, 0))}
      t={t}
      shownLine={(i) => lines[i]}
      isolate={(s) => s}
    />,
  );
}

describe('#2266 — analytic: the forced-narrowing note’s face', () => {
  it.each([
    [['מלבן ABCD', 'מעוין ABCD'], 'ABCD הוא כעת ריבוע'], // the operator's T64
    [['מקבילית ABCD', 'AB = BC'], 'ABCD הוגבל'], // the cause-naming sentence
  ])('%j shows the ⓘ on the blue information strip', (lines, words) => {
    const note = noteMarkup(page(lines), 'analytic-narrowing-note');
    expect(stripFormatControls(note)).toContain(words);
    expect(noteFaceFaults(note, 'analytic')).toEqual([]);
  });

  it('the ellipse the givens make a circle keeps the narrowing note’s face', () => {
    const note = noteMarkup(page(['נתונה אליפסה שמשוואתה x^2/9+y^2/9=1']), 'analytic-conic-circle-note');
    expect(note).toContain('כעת מעגל');
    expect(noteFaceFaults(note, 'analytic')).toEqual([]);
  });

  it('two letters on one dot, on the same strip, through the real App (judged 2026-11-05, q13)', () => {
    useAnalyticStore.getState().restore({ lines: ['N1(1,1)', 'N2(1,1)', 'קטע N1N2'] });
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={analyticI18n}>
        <App />
      </I18nextProvider>,
    );
    const note = noteMarkup(html, 'analytic-converge-note');
    expect(note).toContain('נפלו על אותה נקודה');
    expect(noteFaceFaults(note, 'analytic')).toEqual([]);
  });

  it('the App mounts them', () => {
    expect(readFileSync(join(__dirname, '..', 'App.tsx'), 'utf8')).toMatch(/<NarrowingNotes\b/);
  });
});
