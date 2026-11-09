/**
 * #2266 (ADR-W-180) — 3-D's forced-narrowing note gains the ⓘ and the suite's blue information strip, as 2-D has them.
 * Operator, 2026-10-16: *"2266 - A"*. The real App3, server-rendered over the real submit decision's figure.
 */
import type { Seed3 } from '../engine/components3';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import App3 from '../App3';
import i18n3d from '../i18n';
import { decideDeterministic3 } from '../app/decideDeterministic3';
import { useGeo3, type Fact3 } from '../store/store3';
import { stripFormatControls } from '../../shell/bidi';
import { noteFaceFaults, noteMarkup } from '../../shell/__tests__/fixtures/narrowing-note-rows';

vi.mock('../store/store3', async (importOriginal) => {
  const m = await importOriginal<typeof import('../store/store3')>();
  const real = m.useGeo3;
  const live = (sel?: (s: ReturnType<typeof real.getState>) => unknown) => (sel ? sel(real.getState()) : real.getState());
  return { ...m, useGeo3: Object.assign(live, real) };
});

/** The real App3 over the figure the real submit decision records for `lines`. */
function page(lines: readonly string[]): string {
  let n = 0;
  let st: { facts: Fact3[]; seed: Seed3 } = { facts: [], seed: 0 };
  for (const line of lines) {
    const v = decideDeterministic3(st, line, () => `f${++n}`);
    if (v.kind !== 'record') throw new Error(`did not record: ${line}`);
    st = { facts: v.facts, seed: v.seed };
  }
  useGeo3.setState(st);
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n3d}>
      <App3 />
    </I18nextProvider>,
  );
}

describe('#2266 — 3-D: the forced-narrowing note’s face', () => {
  it.each([
    [['מלבן ABCD', 'מעוין ABCD'], 'ABCD הוא כעת ריבוע'], // the operator's T64
    [['מקבילית ABCD', 'AB = BC'], 'ABCD הוגבל'], // the cause-naming sentence
  ])('%j shows the ⓘ on the blue information strip', (lines, words) => {
    const note = noteMarkup(page(lines), 'narrowed-note');
    expect(stripFormatControls(note)).toContain(words);
    expect(noteFaceFaults(note, '3d')).toEqual([]);
  });

  it('the right pyramid over a plain «מרובע» takes the same face, its words unchanged (judged 2026-11-05, q14)', () => {
    const note = noteMarkup(page(['פירמידה ישרה SABCD שבסיסה מרובע']), 'base-constrained-note');
    expect(note).toContain('כדי שהפירמידה תהיה ישרה');
    expect(stripFormatControls(note)).toContain('(ABCD)'); // the base ring, never the apex (judged 2026-11-05, q16)
    expect(noteFaceFaults(note, '3d')).toEqual([]);
  });

  it('two letters on one dot, on the shared strip (judged 2026-11-05, q13)', () => {
    const note = noteMarkup(page(['A(0,0,0)', 'B(2,0,0)', 'M אמצע AB', 'N(1,0,0)']), 'converge-note');
    expect(note).toContain('נפלו על אותה נקודה');
    expect(noteFaceFaults(note, '3d')).toEqual([]);
  });
});
