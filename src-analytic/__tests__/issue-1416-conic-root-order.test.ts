/**
 * #1416 ([ADR-AG-236](../../docs/06c-decisions-analytic.md#adr-ag-236)) — TWO CONICS HAVE A ROOT ORDER, so
 * «הראשונה» / «השנייה» of a conic pair SELECT a crossing.
 *
 * Measured at the base (c098af9b), seeds 0–2:
 *
 *   «P נקודת החיתוך הראשונה של המעגל I עם המעגל II»  →  (4.609, −1.937)
 *   «P נקודת החיתוך השנייה של המעגל I עם המעגל II»   →  (4.609, −1.937)   — the same point: the word chose nothing
 *   «המעגל I חותך את המעגל II בנקודות A ו-B»          →  `unsatisfiable` at every seed (`meetsTwice` said no conic pair meets twice)
 *   a second «הראשונה» (Q after P)                    →  `faults: []`, or, when caught, a refusal about «הישרים»
 *
 * The order is the reading direction (left to right, bottom to top for one above the other) — the order a
 * straight with no points of its own already takes. Expected positions are read from `conicsMeet`, never
 * written as coordinates, so the lock is about the ORDER and the selection, not about one figure's numbers.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { conicsMeet } from '../engine/crossing-order';
import { decideSubmit } from '../app/submit';
import { errorText, type Translate } from '../app/errorText';
import { analyticI18n } from '../i18n';
import type { NumCurve } from '../engine/types';
import type { InputError } from '../store/useAnalyticStore';

type P = { x: number; y: number };
const NTH = ['הראשונה', 'השנייה'] as const;
const near = (p: P | undefined, q: P) => p !== undefined && Math.hypot(p.x - q.x, p.y - q.y) < 1e-4;
const pt = (lines: string[], id: string, seed = 0) => derive(lines, seed).figure.points.find((p) => p.id === id);
const he = analyticI18n.getFixedT('he') as unknown as Translate;

const TWO_CIRCLES = ['מעגל I: x^2+y^2=25', 'מעגל II: (x-4)^2+(y-1)^2=9'];
/** The two crossings stand side by side here: the radical line is horizontal. */
const STACKED = ['מעגל I: x^2+y^2=25', 'מעגל II: x^2+(y-6)^2=16'];
const CIRCLE_ELLIPSE = ['מעגל I: x^2+y^2=16', 'x^2/25+y^2/9=1'];
const CIRCLE_PARABOLA = ['מעגל I: (x-2)^2+y^2=9', 'y^2=4x'];

function rootsOf(lines: string[]): P[] {
  const curves = derive(lines, 0).figure.curves.map((c) => c.curve).filter((c): c is NumCurve => c.kind !== 'line');
  expect(curves).toHaveLength(2);
  return conicsMeet(curves[0], curves[1]).roots;
}

describe('#1416 — «הראשונה» / «השנייה» of two conics name their crossing', () => {
  it.each([
    ['two circles (the reported pair)', TWO_CIRCLES, 'המעגל I עם המעגל II'],
    ['two circles side by side', STACKED, 'המעגל I עם המעגל II'],
    ['a circle and an ellipse (four crossings)', CIRCLE_ELLIPSE, 'המעגל I עם האליפסה x^2/25+y^2/9=1'],
    ['a circle and a parabola', CIRCLE_PARABOLA, 'המעגל I עם הפרבולה y^2=4x'],
  ])('%s: each ordinal lands on its own root, at every seed', (_name, base, ops) => {
    const roots = rootsOf(base);
    expect(roots.length).toBeGreaterThanOrEqual(2);
    for (const nth of [0, 1] as const) {
      for (const seed of [0, 1, 2, 3]) {
        const lines = [...base, `P נקודת החיתוך ${NTH[nth]} של ${ops}`];
        expect(derive(lines, seed).faults).toEqual([]);
        expect(near(pt(lines, 'P', seed), roots[nth]), `${NTH[nth]} seed ${seed}`).toBe(true);
      }
    }
    // The two ordinals are two different points — the measured defect was one point for both.
    expect(near(roots[0], roots[1])).toBe(false);
  });

  it('the order is the reading direction: left to right, and bottom to top when one stands above the other', () => {
    for (const base of [TWO_CIRCLES, STACKED, CIRCLE_ELLIPSE, CIRCLE_PARABOLA]) {
      const roots = rootsOf(base);
      for (let i = 1; i < roots.length; i += 1) {
        const [p, q] = [roots[i - 1], roots[i]];
        if (Math.abs(p.x - q.x) > 1e-6) expect(p.x).toBeLessThan(q.x);
        else expect(p.y).toBeLessThan(q.y);
      }
    }
    // Two circles one above the other: their radical line is VERTICAL, so it is walked bottom to top.
    const vertical = conicsMeet({ kind: 'circle', cx: 0, cy: 0, r: 5 }, { kind: 'circle', cx: 6, cy: 0, r: 5 }).roots;
    expect(vertical).toHaveLength(2);
    expect(vertical[0].y).toBeLessThan(vertical[1].y);
    // Swapping the operands does not change the order — it belongs to the plane, not to the words.
    const swapped = conicsMeet({ kind: 'circle', cx: 6, cy: 0, r: 5 }, { kind: 'circle', cx: 0, cy: 0, r: 5 }).roots;
    expect(near(swapped[0], vertical[0]) && near(swapped[1], vertical[1])).toBe(true);
  });

  it('a tangency is one point, and concentric circles meet nowhere', () => {
    const touch = conicsMeet({ kind: 'circle', cx: 0, cy: 0, r: 3 }, { kind: 'circle', cx: 5, cy: 0, r: 2 });
    expect(touch.touching).toBe(true);
    expect(touch.roots).toHaveLength(1);
    expect(conicsMeet({ kind: 'circle', cx: 0, cy: 0, r: 3 }, { kind: 'circle', cx: 0, cy: 0, r: 2 }).roots).toEqual([]);
  });

  it('«המעגל I חותך את המעגל II בנקודות A ו-B» builds, A and B on the two crossings (was unsatisfiable at every seed)', () => {
    const roots = rootsOf(TWO_CIRCLES);
    for (const s of ['המעגל I חותך את המעגל II בנקודות A ו-B', 'A ו-B נקודות החיתוך של המעגל I עם המעגל II']) {
      for (const seed of [0, 1]) {
        const lines = [...TWO_CIRCLES, s];
        const d = derive(lines, seed);
        expect(d.faults, `${s} seed ${seed}`).toEqual([]);
        const a = pt(lines, 'A', seed);
        const b = pt(lines, 'B', seed);
        // Which letter takes which root cycles with the configuration (#1539); together they are the two roots.
        expect((near(a, roots[0]) && near(b, roots[1])) || (near(a, roots[1]) && near(b, roots[0]))).toBe(true);
      }
    }
  });
});

describe('#1416 — the duplicate-ordinal refusal names its operands, never «הישרים»', () => {
  const after = [...TWO_CIRCLES, 'P נקודת החיתוך הראשונה של המעגל I עם המעגל II'];

  it('a second «הראשונה» is refused naming P and the two circles; «השנייה» is recorded', () => {
    const v = decideSubmit('Q נקודת החיתוך הראשונה של המעגל I עם המעגל II', after, 0);
    expect(v.kind).toBe('refused');
    const error = (v as { error: InputError }).error;
    expect(error).toMatchObject({ key: 'crossing-already-named', holder: 'P', operands: ['המעגל I', 'המעגל II'] });
    const text = errorText(error, he).replace(/[⁦-⁩]/g, '');
    expect(text).toContain('המעגל I');
    expect(text).toContain('המעגל II');
    expect(text).not.toContain('הישרים');

    expect(decideSubmit('Q נקודת החיתוך השנייה של המעגל I עם המעגל II', after, 0).kind).toBe('record');
  });

  it('two straights sharing a letter keep their own refusal (#1175) — the wording for straights is still right there', () => {
    const v = decideSubmit('P נקודת החיתוך של הישר AB עם הישר BC', ['משולש ABC'], 0) as { kind: string; error?: InputError };
    expect(v.kind).toBe('refused');
    expect(v.error).toMatchObject({ key: 'crossing-already-named', holder: 'B' });
  });
});
