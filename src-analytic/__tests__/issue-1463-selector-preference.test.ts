/**
 * THE SELECTORS STEER THE SOLVE (#1463, ADR-AG-159).
 *
 * Found on the operator's kite (prod session j73pikxb): adding a circle through A, B, D removed a
 * configuration — «הציגו תצורה אחרת» went from two kites to one, and with B(7,7) stated seeds 16–29 refused
 * «D על המעגל» as unsatisfiable. The plan read it as the circle's sample deciding the basin; measured, the
 * cause was one level down: B and D share their incidences (on the diagonal's line, 6 from A), the descent
 * sent both to the same root, and `distinct` only REJECTED that afterwards. A seed walk was the only
 * repair, and with the circle it found one configuration in the whole window.
 *
 * The same class held for two crossings of one pair (`crossing-distinct`, #1113): collapsed at 19 of 24 raw
 * seeds. Both now deflate the collapse out of the equations and take the other root.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { distinctConfigSeeds, drawableAt, evaluate, type Figure } from '../engine/evaluate';
import { solvePreferring } from '../engine/solve';

const KITE = ['דלתון ABCD', 'AB=AD', 'CB=CD', 'A(1,7)', 'משוואת הקטע BD היא y=x', 'נקודה C נמצאת על הישר y=-2x+17', 'AB=6'];
const CIRCLE = ['נתון מעגל O', 'A על המעגל', 'B על המעגל', 'D על המעגל'];

const whole = (f: Figure) => f.selectorsOk && f.unsatisfied.length === 0;
const wholeSeeds = (lines: string[]) => {
  const c = derive(lines, 0).construction;
  let n = 0;
  for (let seed = 0; seed < 24; seed += 1) if (whole(evaluate(c, seed))) n += 1;
  return n;
};
const at = (f: Figure, id: string) => {
  const p = f.points.find((q) => q.id === id);
  return p ? [Number(p.x.toFixed(3)), Number(p.y.toFixed(3))] : null;
};
/** B's position in each distinct configuration «הציגו תצורה אחרת» offers. */
const configsOfB = (lines: string[]) => {
  const c = derive(lines, 0).construction;
  return distinctConfigSeeds(c).map((s) => JSON.stringify(at(drawableAt(c, s), 'B')));
};

describe('#1463 — the operator’s kite keeps both drawings when the circle is added', () => {
  it('both configurations are reachable, before and after the circle', () => {
    const want = [JSON.stringify([1, 1]), JSON.stringify([7, 7])].sort();
    expect([...new Set(configsOfB(KITE))].sort()).toEqual(want);
    // One configuration before the fix: the circle collapsed «show another» to B(1,1).
    expect([...new Set(configsOfB([...KITE, ...CIRCLE]))].sort()).toEqual(want);
  });

  it('in either entry order — the circle stated first', () => {
    const lines = ['נתון מעגל O', 'דלתון ABCD', 'AB=AD', 'CB=CD', 'A(1,7)', 'משוואת הקטע BD היא y=x', 'A על המעגל', 'B על המעגל', 'D על המעגל', 'נקודה C נמצאת על הישר y=-2x+17', 'AB=6'];
    expect([...new Set(configsOfB(lines))].sort()).toEqual([JSON.stringify([1, 1]), JSON.stringify([7, 7])].sort());
  });

  it('the circle is the one through A, B and D in every configuration', () => {
    const c = derive([...KITE, ...CIRCLE], 0).construction;
    for (const s of distinctConfigSeeds(c)) {
      const f = drawableAt(c, s);
      expect(at(f, 'O')).toEqual([4, 4]);
      expect(f.env.r_O).toBeCloseTo(Math.sqrt(18), 6);
    }
  });

  it('with B(7,7) stated the figure is whole wherever it is drawn — no seed refuses «D על המעגל»', () => {
    const d = derive([...KITE, 'B(7,7)', ...CIRCLE], 0);
    expect(d.faults).toEqual([]);
    for (let seed = 0; seed < 24; seed += 1) {
      const f = drawableAt(d.construction, seed);
      expect(whole(f), `seed ${seed}`).toBe(true);
      expect(at(f, 'D'), `seed ${seed}`).toEqual([1, 1]);
    }
  });

  it('and with D(1,1) stated instead — the mirrored slot', () => {
    const d = derive([...KITE, 'D(1,1)', ...CIRCLE], 0);
    expect(d.faults).toEqual([]);
    for (let seed = 0; seed < 24; seed += 1) expect(at(drawableAt(d.construction, seed), 'B'), `seed ${seed}`).toEqual([7, 7]);
  });
});

describe('#1463 — the class: two points sharing their incidences take different roots', () => {
  it('the kite noun alone: B and D no longer collapse in the raw solve (16/24 before)', () => {
    expect(wholeSeeds(['דלתון ABCD'])).toBe(24);
  });

  it('the operator’s kite, raw (6/24 before)', () => {
    // Not 24: what remains is C sliding to infinity along its line — the equal-length residual's
    // asymptotic zero, a separate basin (filed with ADR-AG-159). Every such seed draws its fallback.
    expect(wholeSeeds(KITE)).toBeGreaterThanOrEqual(12);
  });

  it('two crossings of one pair (crossing-distinct): 5/24 raw before', () => {
    expect(
      wholeSeeds([
        'משוואת הישר AB היא y=2x',
        'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9',
        'P נקודת החיתוך של הישר AB עם המעגל I',
        'Q נקודת החיתוך של הישר AB עם המעגל I',
      ]),
    ).toBe(24);
  });

  it('the kite with a circle through three vertices is whole far more often raw (1/24 before)', () => {
    // Not 24: the remaining failures are a separate basin (C sliding to infinity along its line), and
    // each of them draws the fallback — the figure this seed drew before.
    expect(wholeSeeds([...KITE, ...CIRCLE])).toBeGreaterThanOrEqual(8);
  });
});

describe('#1463 — solvePreferring: a preference, never a refusal', () => {
  // x² = 1 has two roots; the judge prefers the negative one.
  const residuals = (x: number[]) => [x[0] * x[0] - 1];

  it('takes a later start the judge accepts over the first converged one', () => {
    const r = solvePreferring([[2], [-2]], residuals, 60, () => true, (x) => x[0] < 0, () => []);
    expect(r.ok).toBe(true);
    expect(r.values[0]).toBeCloseTo(-1, 6);
  });

  it('tries the targeted restart before the remaining starts', () => {
    const tried: number[] = [];
    const r = solvePreferring(
      [[2], [3]],
      (x) => {
        tried.push(x[0]);
        return residuals(x);
      },
      60,
      () => true,
      (x) => x[0] < 0,
      () => [[-0.5]],
    );
    expect(r.values[0]).toBeCloseTo(-1, 6);
    expect(tried).toContain(-0.5);
  });

  it('with nothing preferred, returns exactly the first converged solution — today’s answer', () => {
    const r = solvePreferring([[2], [3]], residuals, 60, () => true, () => false, () => [[0.5]]);
    expect(r.ok).toBe(true);
    expect(r.values[0]).toBeCloseTo(1, 6);
  });
});
