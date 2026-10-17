/**
 * #2269 (ADR-CX-080) — A DETERMINED NUMBER WITH NO EXACT FORM READS «≈ …», NEVER ITS BARE NAME.
 *
 * «z1 = 15cis(π/7) + 1» drew the point and printed only «z₁» — in the panel and on the canvas — because
 * stage 5d gave a typed number a reading only when the EXACT carriers knew it or its definition closed to
 * a Gaussian rational. A non-table angle plus a rational is neither, yet the givens fix it completely.
 * The operator's ruling (2026-09-27, #1436/#1460): exact form when exact, otherwise ≈ decimal. The
 * determinacy test is the ask lane's own (`knowledgeOf` over every configuration), so the panel prints a
 * number exactly when «|z1|» would answer one. Everything runs through the real `submitLine` + `deriveLines`.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { askRowsOf } from '../app/askLane';
import { deriveLines } from '../app/deriveLines';
import { activeLines, submitLine } from '../app/submit';
import { v2Labels } from '../replay/scene2';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();
beforeEach(() => store().resetSession());

const build = (lines: string[], seed = 0) => {
  store().resetSession();
  expect(lines.map((l) => submitLine(l))).toEqual(lines.map(() => true));
  return deriveLines(activeLines(), seed, seed);
};
const point = (d: ReturnType<typeof deriveLines>, display: string) => d.points.find((p) => p.display === display)!;

describe('#2269 — the report: «z1 = 15cis(π/7) + 1»', () => {
  it('the panel reads it ≈ in both views, and the canvas shows the same reading (typed, no parameter)', () => {
    const d = build(['z1 = 15cis(π/7) + 1']);
    const p = point(d, 'z₁');
    expect(p.readingCart).toBe('z₁ ≈ 14.51+6.51i');
    expect(p.reading).toBe('z₁ ≈ 15.91·cis24.15°');
    expect(v2Labels(d, 'cart')).toEqual(['z₁ ≈ 14.51+6.51i']);
    expect(v2Labels(d, 'polar')).toEqual(['z₁ ≈ 15.91·cis24.15°']);
    expect(p.canvasCart).toBe('z₁ ≈ 14.51+6.51i');
    expect(p.canvas).toBe('z₁ ≈ 15.91·cis24.15°');
  });

  it('the reading is the same in every configuration the student can cycle to', () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) expect(point(build(['z1 = 15cis(π/7) + 1'], seed), 'z₁').readingCart).toBe('z₁ ≈ 14.51+6.51i');
  });
});

describe('#2269 — class: every determined number with no exact form reads ≈, panel and canvas', () => {
  it.each([
    ['z1 = 5cis(π/7) + 1', 'z₁ ≈ 5.5+2.17i', 'z₁ ≈ 5.92·cis21.51°'], // the twin
    ['z1 = cis20 + 2', 'z₁ ≈ 2.94+0.34i', 'z₁ ≈ 2.96·cis6.64°'],
    ['z1 = 2cis(π/9) - i', 'z₁ ≈ 1.88-0.32i', 'z₁ ≈ 1.91·cis350.46°'],
  ])('%s → %s / %s', (line, cart, polar) => {
    const d = build([line]);
    const p = point(d, 'z₁');
    expect([p.readingCart, p.reading, p.canvasCart, p.canvas]).toEqual([cart, polar, cart, polar]);
    expect(v2Labels(d, 'cart')).toEqual([cart]);
    expect(v2Labels(d, 'polar')).toEqual([polar]);
  });

  it('a number COMPUTED from it reads ≈ in the panel and keeps its bare name on the canvas (ADR-CX-065)', () => {
    const d = build(['z1 = 15cis(π/7) + 1', 'z1 = 2z2']);
    const p = point(d, 'z₂');
    expect(p.readingCart).toBe('z₂ ≈ 7.26+3.25i');
    expect(v2Labels(d, 'cart')).toContain('z₂ ≈ 7.26+3.25i');
    expect([p.canvas, p.canvasCart]).toEqual(['z₂', 'z₂']);
  });

  it('no fraction ever stands in for a non-Gaussian value (the #2134 lock)', () => {
    for (const line of ['z1 = 15cis(π/7) + 1', 'z1 = 5cis(π/7) + 1', 'z1 = cis20 + 2']) {
      const p = point(build([line]), 'z₁');
      for (const s of [p.reading, p.readingCart, p.canvas, p.canvasCart]) expect(s, line).not.toMatch(/\//);
    }
  });
});

describe('#2269 — controls: what is not determined, or is exact, is unchanged', () => {
  it('a free parameter keeps the bare name and no panel row (the no-guess ruling)', () => {
    const d = build(['z1 = cis(π/7) + a']);
    expect(point(d, 'z₁').reading).toBe('z₁');
    expect(point(d, 'z₁').readingCart).toBe('z₁');
    expect(v2Labels(d, 'cart')).toEqual([]);
  });

  it('the exact literal still reads in exact form (#2134)', () => {
    expect(point(build(['z1 = 15cis(π/7)']), 'z₁').reading).toBe('z₁ = 15·cis180/7°');
  });

  it('a Gaussian-rational literal still reads exactly', () => {
    expect(point(build(['z1 = 3+4i']), 'z₁').readingCart).toBe('z₁ = 3+4i');
  });

  it.each([
    [['z1 = 15cis(π/7) + 1']],
    [['z1 = 15cis(π/7) + 1', 'w = a + i']],
    [['z1 = cis(π/7) + a']],
    [['z1 = 15cis(π/7) + 1', 'z1 = 2z2']],
  ])('%j · the panel prints z₁ exactly when the ask «|z1|» answers (one determinacy predicate)', (lines) => {
    const d = deriveLines(lines, 0, 0, ['|z1|']);
    const answered = askRowsOf(['|z1|'], d.knowledge)[0].row!.value !== null;
    expect(v2Labels(d, 'cart').some((r) => r.startsWith('z₁ '))).toBe(answered);
  });
});
