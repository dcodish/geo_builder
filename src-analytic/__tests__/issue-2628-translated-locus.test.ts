/**
 * #2628 (ADR-AG-380) — A LOCUS OUTSIDE THE NAMED FAMILY IS DRAWN, NOT NAMED.
 *
 * חורף 2024: «המקום הגיאומטרי של C» answered nothing and drew nothing, though the walk traced C exactly (x = 2 + y²/4).
 * 02c R87: *"The trace draws whenever the point has one free DOF; the kind is named when invariant"*. Operator, sr-26
 * (ADR-W-175, 2026-11-02): inputs and answers share one curve family, and an answer outside it draws the curve without
 * naming it, until #2664 widens the family. The row's text is the session's (`chose-2628-unnamed-locus`, ADR-W-174).
 *
 * Every case runs the real `ask(derive(…))` the page runs, at seeds 0–3, with the page's own locale wiring.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ask, type Answer, type LocusKindWord } from '../app/ask';
import { derive } from '../engine/derive';
import { analyticI18n } from '../i18n';

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
type T = (k: string, o?: Record<string, unknown>) => string;
/** App.tsx's `locusKind`, verbatim: the singular key, or the counted key with a counted fallback. */
const kindWordFor = (lng: 'he' | 'en'): LocusKindWord => {
  const t = analyticI18n.getFixedT(lng) as unknown as T;
  return (kind, count = 1) =>
    count <= 1 ? t(`locus.${kind}`) : t(`locus.${kind}.${count}`, { defaultValue: `${count} × ${t(`locus.${kind}`)}` });
};
const Q = { he: (p: string) => `המקום הגיאומטרי של ${p}`, en: (p: string) => `locus of ${p}` };
const asked = (lines: readonly string[], p: string, seed: number, lng: 'he' | 'en'): Answer =>
  // #2673 (ADR-AG-381): the locus is reached by its chip only — `'chip'`, the chip's entry point.
  ask(derive(lines, seed), Q[lng](p), fmt, kindWordFor(lng), 'chip');

const UNNAMED = { he: 'עקומה (הכלי עדיין לא מזהה את סוגה)', en: 'a curve (the tool cannot name its kind yet)' };

const FIX = path.join(__dirname, 'fixtures');
const fixture = (name: string): string[] => JSON.parse(readFileSync(path.join(FIX, `${name}.analytic.json`), 'utf8')).lines;

/** Each case: the lines, the point, and the curve the drawn trace must lie on (residual ≈ 0, scaled by the gradient). */
const UNNAMED_CASES: Array<[string, readonly string[], string, (x: number, y: number) => number]> = [
  // The reported sentence: C traces x = 2 + y²/4 (a translated parabola).
  ['חורף 2024, C', fixture('exam-2024w-locus-1138'), 'C', (x, y) => y * y - 4 * x + 8],
  ['חורף 2024 with a parameter, C', fixture('exam-2024w-locus-param-1138'), 'C', () => 0],
  // The midpoint of A(4,2) and a point on y² = 4x: (2y − 2)² = 4(2x − 4).
  ['a translated parabola (midpoint)', ['נתונה פרבולה I שמשוואתה y^2=4x', 'P על הפרבולה I', 'A(4,2)', 'M אמצע AP'], 'M',
    (x, y) => (2 * y - 2) ** 2 - 4 * (2 * x - 4)],
  // The midpoint of A(4,2) and a point on x²/16 + y²/9 = 1.
  ['a translated ellipse (midpoint)', ['נתונה אליפסה I שמשוואתה x^2/16+y^2/9=1', 'P על האליפסה I', 'A(4,2)', 'M אמצע AP'], 'M',
    (x, y) => (2 * x - 4) ** 2 / 16 + (2 * y - 2) ** 2 / 9 - 1],
  // Foci (2,0), (6,0), sum 10: centre (4,0), a = 5, c = 2, b² = 21.
  ['PA + PB = 10 (a translated ellipse)', ['A(2,0)', 'B(6,0)', 'נקודה P', 'PA + PB = 10'], 'P',
    (x, y) => (x - 4) ** 2 / 25 + y ** 2 / 21 - 1],
  // Stream K, round #2665: focus (0,2), directrix y = −2 → x² = 8y (a parabola on the y-axis).
  ['a parabola on the y-axis (focus-directrix)', ['A(0,2)', 'l: y = -2', 'נקודה X', 'XA = d_{Xl}'], 'X', (x, y) => x * x - 8 * y],
  // Focus (2,0), directrix x = 8 → y² = −12(x − 5) (a translated parabola).
  ['a translated parabola (focus-directrix)', ['A(2,0)', 'l: x = 8', 'נקודה X', 'XA = d_{Xl}'], 'X', (x, y) => y * y + 12 * (x - 5)],
  // A hyperbola branch: PA − PB = 2, foci (2,0), (6,0) → (x − 4)² − y²/3 = 1.
  ['a hyperbola (PA − PB = 2)', ['A(2,0)', 'B(6,0)', 'נקודה P', 'PA - PB = 2'], 'P', (x, y) => (x - 4) ** 2 - (y * y) / 3 - 1],
];

const SEEDS = [0, 1, 2, 3];

describe('#2628 — a locus whose family the tool does not name is DRAWN, and the row says so', () => {
  it.each(UNNAMED_CASES.flatMap(([n, lines, p, f]) => SEEDS.map((seed) => [n, seed, lines, p, f] as const)))(
    '%s, seed %i',
    (_n, seed, lines, p, f) => {
      for (const lng of ['he', 'en'] as const) {
        const a = asked(lines, p, seed, lng);
        expect(a.value).toBe(UNNAMED[lng]);
        expect(a.locus).toBeDefined();
        const comps = a.locus!.components;
        expect(comps.length).toBe(1);
        // A single component carries no label of its own: the canvas reads the row, as for every single-curve locus.
        expect(comps[0].label).toBeUndefined();
        const pts = comps[0].points;
        expect(pts.length).toBeGreaterThan(20);
        // The drawing IS the set: every drawn point lies on the true curve (relative to the curve's own scale).
        for (const q of pts) expect(Math.abs(f(q.x, q.y))).toBeLessThan(1e-3 * (1 + q.x * q.x + q.y * q.y));
      }
    },
  );

  it('no equation is printed and no family is named (sr-26: one family for inputs and answers until #2664)', () => {
    const a = asked(fixture('exam-2024w-locus-1138'), 'C', 0, 'he');
    expect(a.value).not.toMatch(/פרבולה|=|²/);
  });

  it('the two-curve row has its own text in both languages (a union with any unnamed component is unnamed whole)', () => {
    expect(kindWordFor('he')('unnamed', 2)).toBe('שתי עקומות (הכלי עדיין לא מזהה את סוגן)');
    expect(kindWordFor('en')('unnamed', 2)).toBe('two curves (the tool cannot name their kind yet)');
  });
});

describe('#2628 — what is named today reads exactly as before', () => {
  const NAMED: Array<[string, readonly string[], string, string]> = [
    ['חורף 2024, M', fixture('exam-2024w-locus-1138'), 'M', 'פרבולה · y² = 8x'],
    ['חורף 2024, B', fixture('exam-2024w-locus-1138'), 'B', 'ישר · x + 2 = 0'],
    ['a translated circle (the control)', ['נתון מעגל I שמשוואתו x^2+y^2=4', 'P על המעגל I', 'A(4,2)', 'M אמצע AP'], 'M',
      'מעגל · (x − 2)² + (y − 1)² = 1²'],
  ];
  it.each(NAMED.flatMap(([n, lines, p, v]) => SEEDS.map((seed) => [n, seed, lines, p, v] as const)))(
    '%s, seed %i',
    (_n, seed, lines, p, v) => {
      const a = asked(lines, p, seed, 'he');
      expect(a.value).toBe(v);
      expect(a.locus?.components.length).toBe(1);
    },
  );

  it('a point with no locus still answers nothing (a determined figure draws nothing)', () => {
    const a = asked(['A(0,0)', 'B(4,0)', 'C(0,3)'], 'C', 0, 'he');
    expect(a.locus).toBeUndefined();
  });

  it.each(SEEDS)('a point the walk does not move draws nothing, though the figure is free (A(a,0), seed %i)', (seed) => {
    // The walk moves B and C with `a` held, so A's "trace" is one position: not a curve, named or unnamed.
    const a = asked(fixture('exam-2024w-locus-param-1138'), 'A', seed, 'he');
    expect(a.locus).toBeUndefined();
    expect(a.value).not.toBe(UNNAMED.he);
  });
});

describe('#2628 — the INPUT gate is untouched (02c R174)', () => {
  it('a translated parabola stated as a given is still refused', () => {
    const d = derive(['נתונה פרבולה I שמשוואתה y^2=4x-8'], 0);
    expect(d.faults.length).toBeGreaterThan(0);
  });
});
