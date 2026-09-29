/**
 * #1526 ([ADR-AG-181](../../docs/06c-decisions-analytic.md#adr-ag-181)) — A FREE POINT IS NEVER OPENED ON TOP
 * OF ANOTHER POINT UNLESS THE GIVENS FORCE IT.
 *
 * Operator, 2026-09-29: *"Y נמצאת על הישר y=x places Y at (0,0) on top of V which should never happen unless
 * its a must"*. Measured before: seed 0 drew Y at (−0.018, −0.018), 0.025 from V(0,0) on a frame of 4 — the
 * display's separation preference (#1273) measured "on top" with the crossing IDENTITY tolerance (a millionth
 * of the span), so a point that was merely near passed. The class is every rider whose carrier passes through
 * a drawn point: measured raw-stacked and SHOWN before the fix — the line (2/24), a circle rider (3/24), a
 * parabola rider (2/24), a rider of `y=0` / the x-axis (1/24 each); after, 0 everywhere.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { drawableAt, evaluate, isKnowledge, stackedPairs, VISIBLE_FRACTION } from '../engine/evaluate';
import { anotherConfiguration } from '../app/another';

const HIS = ['V(0,0)', 'X(4,0)', 'Y נמצאת על הישר y=x'];
const pt = (f: { points: { id: string; x: number; y: number }[] }, id: string) => f.points.find((p) => p.id === id)!;
const SEEDS = Array.from({ length: 24 }, (_, i) => i);

describe('#1526 — the reported figure', () => {
  it('the raw sample at seed 0 stacks Y on V — the baseline the preference must walk past', () => {
    const c = derive(HIS, 0).construction;
    const raw = evaluate(c, 0);
    expect(stackedPairs(raw)).toEqual([['V', 'Y']]);
  });

  it('what is SHOWN keeps Y visibly apart from V at every one of 24 seeds, and every figure is whole', () => {
    for (const seed of SEEDS) {
      const d = derive(HIS, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      expect(stackedPairs(d.figure), `seed ${seed}`).toEqual([]);
      const y = pt(d.figure, 'Y');
      // Geometric, independent of the ruler: at least a hundredth of the frame of 4 (pre-fix seed 0: 0.025).
      expect(Math.hypot(y.x, y.y), `seed ${seed}: |VY|`).toBeGreaterThan(4 * VISIBLE_FRACTION);
      expect(Math.abs(y.x - y.y), `seed ${seed}: Y on y=x`).toBeLessThan(1e-6);
    }
  });

  it('«הציגו תצורה אחרת» still moves Y along the line', () => {
    const next = anotherConfiguration(HIS, 0);
    expect(next.found).toBe(true);
    const a = pt(derive(HIS, 0).figure, 'Y');
    const b = pt(derive(HIS, next.seed).figure, 'Y');
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(1e-3);
    const xs = new Set(SEEDS.map((s) => pt(derive(HIS, s).figure, 'Y').x.toFixed(3)));
    expect(xs.size).toBeGreaterThanOrEqual(20);
  });

  it('a preference, not a filter: the honesty gates still admit the stacked sample and still call Y free', () => {
    const c = derive(HIS, 0).construction;
    expect(stackedPairs(drawableAt(c, 0)), 'the knowledge-gate mode is untouched').toEqual([['V', 'Y']]);
    expect(isKnowledge(c, (f) => pt(f, 'Y').x).known).toBe(false);
  });
});

describe('#1526 — "unless it is a must": a coincidence the givens FORCE still builds', () => {
  it('Y on y=x with x_Y = 0 is V itself — drawn there, green, at every seed', () => {
    const lines = ['V(0,0)', 'X(4,0)', 'Y נמצאת על הישר y=x', 'שיעור ה-x של Y הוא 0'];
    for (const seed of [0, 1, 7]) {
      const d = derive(lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      expect(d.figure.unsatisfied).toEqual([]);
      const y = pt(d.figure, 'Y');
      expect(Math.hypot(y.x, y.y)).toBeLessThan(1e-6);
      expect(stackedPairs(d.figure)).toEqual([['V', 'Y']]);
    }
  });
});

describe('#1526 — the class: every rider whose carrier passes through a drawn point', () => {
  const CLASS: Array<[string, string[]]> = [
    ['circle rider', ['A(5,0)', 'משוואת המעגל x^2+y^2=25', 'P נמצאת על המעגל x^2+y^2=25']],
    ['parabola rider', ['A(0,0)', 'B(4,0)', 'משוואת הפרבולה y^2=4x', 'P נמצאת על הפרבולה y^2=4x']],
    ['line rider', ['A(0,0)', 'B(4,0)', 'P נמצאת על הישר y=0']],
    ['axis rider', ['A(0,0)', 'B(4,0)', 'P נמצאת על ציר ה-x']],
    ['segment rider', ['A(0,0)', 'B(4,0)', 'P נמצאת על הקטע AB']],
    ['free point', ['A(0,0)', 'B(4,4)', 'נקודה Z']],
  ];
  for (const [name, lines] of CLASS) {
    it(`${name}: never SHOWN stacked over 24 seeds, and always whole`, () => {
      for (const seed of SEEDS) {
        const d = derive(lines, seed);
        expect(d.faults, `${name} seed ${seed}`).toEqual([]);
        expect(stackedPairs(d.figure), `${name} seed ${seed}`).toEqual([]);
      }
    });
  }

  it('the circle rider really does sample onto A — the sweep is exercising the preference, not passing vacuously', () => {
    const c = derive(CLASS[0][1], 0).construction;
    expect(SEEDS.filter((s) => stackedPairs(evaluate(c, s)).length > 0).length).toBeGreaterThan(0);
  });
});

describe('#1526 — the ruler is the drawn frame', () => {
  it('two points alone are judged against the frame, not against their own spread', () => {
    const f = { points: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 0.001, y: 0 }], curves: [] };
    expect(stackedPairs(f as never)).toEqual([['A', 'B']]);
  });

  it('scale-free: the same picture at 1000× is judged the same', () => {
    const small = { points: [{ id: 'A', x: 0, y: 0 }, { id: 'B', x: 4, y: 0 }, { id: 'C', x: 0.02, y: 0 }], curves: [] };
    const big = { points: small.points.map((p) => ({ ...p, x: p.x * 1000 })), curves: [] };
    expect(stackedPairs(small as never)).toEqual([['A', 'C']]);
    expect(stackedPairs(big as never)).toEqual([['A', 'C']]);
  });
});
