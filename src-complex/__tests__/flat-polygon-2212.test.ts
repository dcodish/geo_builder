/**
 * #2212 (ADR-CX-073) — A POLYGON OVER NUMBERS ON ONE LINE IS REFUSED, BY THE CIRCUMSCRIBED CIRCLE'S OWN
 * FLATNESS TEST: complex adopts ADR-W-115.
 *
 * «z1 = 1 · z2 = 2 · המשולש Oz1z2» drew a flat "triangle", while «המעגל החוסם את המשולש Oz1z2» over the
 * same three numbers was refused (#1895 / #2134): one figure, two verdicts on the same points. The only
 * collinearity verdict lived inside `circumcircle`; the polygon branch of `resolveObjects` never asked.
 * Now ONE predicate, `flatPoints`, is asked by both, and a flat polygon goes through the ADR-CX-069
 * channel (`undrawn` → `unsatisfied` → the gate's existing `incompatible` / `impossible`). No new
 * message. Everything runs through the real `submitLine` + `deriveLines`.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { deriveLines } from '../app/deriveLines';
import { activeLines, hydrateSession, submitLine } from '../app/submit';
import { flatPoints } from '../replay/derive2';
import { useComplexStore } from '../store/useComplexStore';

const store = () => useComplexStore.getState();
beforeEach(() => store().resetSession());

const play = (...lines: string[]): boolean[] => lines.map((l) => submitLine(l));
const derived = (seed = 0) => deriveLines(activeLines(), seed, seed);
const polygons = (seed = 0) => derived(seed).objects.filter((o) => o.kind === 'polygon');
const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const REFUSED = ['incompatible', 'impossible'];

/** The givens are accepted, the object line is refused on the existing channel, nothing is drawn. */
const refusedAfter = (givens: string[], object: string) => {
  expect(play(...givens).every(Boolean), JSON.stringify(givens)).toBe(true);
  expect(submitLine(object), object).toBe(false);
  expect(REFUSED).toContain(store().lastError?.key);
  expect(store().lines).toEqual(givens);
  for (const seed of [0, 1, 2, 3]) expect(polygons(seed)).toEqual([]);
  return store().lastError;
};

describe('#2212 — the report', () => {
  it('«z1 = 1 · z2 = 2 · המשולש Oz1z2» → the triangle is refused exactly as its circle is', () => {
    expect(play('z1 = 1', 'z2 = 2')).toEqual([true, true]);
    expect(submitLine('המשולש Oz1z2')).toBe(false);
    expect(store().lastError).toEqual({ key: 'incompatible', detail: 'z1 = 1' });
    expect(store().lines).toEqual(['z1 = 1', 'z2 = 2']);
    expect(polygons()).toEqual([]);
  });
});

describe('#2212 — every member of the class is refused on the same channel', () => {
  it.each(['המשולש Oz1z2', 'משולש Oz1z2', 'המשולש z1Oz2', 'triangle Oz1z2', 'Oz1z2'])(
    'spelling «%s» over 1 and 2',
    (object) => {
      refusedAfter(['z1 = 1', 'z2 = 2'], object);
    },
  );

  it.each([
    [['z1 = 1', 'z2 = 2', 'z3 = 3'], 'המשולש z1z2z3'],
    [['z1 = 1+i', 'z2 = 2+2i'], 'המשולש Oz1z2'],
    [['z1 = 2cis30', 'z2 = 4cis30'], 'המשולש Oz1z2'],
    [['z1 = 1', 'z2 = -1'], 'המשולש Oz1z2'],
    [['z1 = 5cis(π/7)', 'z2 = 15cis(π/7)'], 'המשולש Oz1z2'],
    [['z1 = 5cis(2π/7)', 'z2 = 15cis(2π/7)'], 'המשולש Oz1z2'],
    [['w = cis(π/7)', 'z1 = 300w', 'z2 = 1000w'], 'המשולש Oz1z2'],
    [['z1 = 1', 'z2 = 1'], 'המשולש Oz1z2'], // coincident corners
    [['z1 = 1'], 'המשולש Oz1z1'], // a repeated corner
    [['z1 = 1', 'z2 = 2', 'z3 = 3'], 'המרובע Oz1z2z3'],
    [['z1 = 1', 'z2 = 2', 'z3 = 3'], 'המצולע Oz1z2z3'],
  ])('%j · «%s»', (givens, object) => {
    refusedAfter(givens, object);
  });

  it('numbers FORCED onto one line: «z2 = 2z1», «z1 ממשי · z2 ממשי», the roots of «z^2 = 4»', () => {
    expect(refusedAfter(['z2 = 2z1'], 'המשולש Oz1z2')).toEqual({ key: 'incompatible', detail: 'z2 = 2z1' });
    store().resetSession();
    refusedAfter(['z1 ממשי', 'z2 ממשי'], 'המשולש Oz1z2');
    store().resetSession();
    expect(refusedAfter(['z^2 = 4'], 'המשולש Oz1z2')).toEqual({ key: 'incompatible', detail: 'z^2 = 4' });
  });
});

describe('#2212 — entry order: the polygon first, the completing line refused naming it', () => {
  it('«המשולש Oz1z2 · z1 = 1 · z2 = 2» → «z2 = 2» is refused, naming the triangle', () => {
    expect(play('המשולש Oz1z2', 'z1 = 1')).toEqual([true, true]);
    expect(submitLine('z2 = 2')).toBe(false);
    expect(store().lastError).toEqual({ key: 'incompatible', detail: 'המשולש Oz1z2' });
    expect(polygons()).toHaveLength(1); // the triangle before the refused line, still a triangle
  });

  it('«המרובע Oz1z2z3 · z1 = 1 · z2 = 2 · z3 = 3» → «z3 = 3» is refused, naming the quadrilateral', () => {
    expect(play('המרובע Oz1z2z3', 'z1 = 1', 'z2 = 2')).toEqual([true, true, true]);
    expect(submitLine('z3 = 3')).toBe(false);
    expect(store().lastError).toEqual({ key: 'incompatible', detail: 'המרובע Oz1z2z3' });
  });
});

describe('#2212 — a triangle and its circumscribed circle get ONE verdict (the B5 lock)', () => {
  it.each([
    [['z1 = 1', 'z2 = 2'], 'Oz1z2'],
    [['z1 = 1', 'z2 = 2', 'z3 = 3'], 'z1z2z3'],
    [['z1 = 1+i', 'z2 = 2+2i'], 'Oz1z2'],
    [['z1 = 5cis(π/7)', 'z2 = 15cis(π/7)'], 'Oz1z2'],
    [['z2 = 2z1'], 'Oz1z2'],
    [['z1 = 1', 'z2 = 1'], 'Oz1z2'],
    [['z1 = 1+i', 'z2 = 2'], 'Oz1z2'], // a real triangle: both drawn
    [['z1 = 1', 'z2 = 2', 'z3 = 3+0.0000001i'], 'z1z2z3'], // the thin typed triangle: both drawn
  ])('%j · %s', (givens, run) => {
    const verdict = (object: string) => {
      store().resetSession();
      play(...givens);
      const ok = submitLine(object);
      return { ok, error: ok ? null : store().lastError };
    };
    expect(verdict(`המשולש ${run}`)).toEqual(verdict(`המעגל החוסם את המשולש ${run}`));
  });

  it('the triangle then its circle: both refused, nothing drawn', () => {
    expect(play('z1 = 1', 'z2 = 2', 'המשולש Oz1z2', 'המעגל החוסם את המשולש Oz1z2')).toEqual([true, true, false, false]);
    expect(derived().objects).toEqual([]);
  });
});

describe('#2212 — the verdict is about shape, not size', () => {
  it.each([1, 10, 100])('«z1 = k(1+i) · z2 = 2k(1+i)» at k = %d → refused', (k) => {
    refusedAfter([`z1 = ${k}+${k}i`, `z2 = ${2 * k}+${2 * k}i`], 'המשולש Oz1z2');
  });
});

describe('#2212 — controls that are still drawn', () => {
  it.each([
    [['z1 = 1', 'z2 = 2', 'z3 = 3+0.0000001i', 'המשולש z1z2z3']], // the #2109 ruling: a thin triangle is drawn
    [['z1 = 1', 'z2 = 2', 'z3 = i', 'המרובע Oz1z2z3']], // three of four on a line is not flat (ADR-602)
    [['z1 = 1+i', 'z2 = 2', 'המשולש Oz1z2']],
    [['z1 = 1+i', 'A = z1', 'z2 = 2', 'המשולש OAz2']],
    [['z^3 = 8', 'המשולש z1z2z3']],
    [['z1 = 1', 'z2 = i', 'המשולש Oz1z2']],
  ])('%j → drawn', (lines) => {
    expect(play(...lines).every(Boolean)).toBe(true);
    expect(derived().unsatisfied).toEqual([]);
    expect(polygons()).toHaveLength(1);
  });

  it.each([[['משולש ABC']], [['A = 0', 'B = 4', 'משולש ABC']]])('%j is drawn non-flat at 24/24 seeds (ADR-CX-052)', (lines) => {
    expect(play(...lines).every(Boolean)).toBe(true);
    for (const seed of SEEDS) {
      const d = derived(seed);
      expect(d.unsatisfied, `seed ${seed}`).toEqual([]);
      expect(d.objects.filter((o) => o.kind === 'polygon'), `seed ${seed}`).toHaveLength(1);
    }
  });
});

describe('#2212 — a saved file holding a flat triangle loads without it', () => {
  it.each(['המעגל החוסם את המשולש Oz1z2', 'המשולש Oz1z2'])('«%s» lands in the load audit’s failed list', (object) => {
    const file = { app: 'complex-builder', version: 1, lines: ['z1 = 1', 'z2 = 2', object], freePos: {}, seed: 0 };
    expect(hydrateSession(file)).toBe(true);
    expect(store().lines).toEqual(['z1 = 1', 'z2 = 2']);
    expect(store().loadAudit?.failed.map((f) => f.line)).toEqual([object]);
  });
});

describe('#2212 — `flatPoints`, the one predicate', () => {
  const c = (re: number, im = 0) => ({ re, im });
  it('flat: collinear, coincident, a single point; not flat: a thin triangle, three of four on a line', () => {
    expect(flatPoints([c(0), c(1), c(2)])).toBe(true);
    expect(flatPoints([c(0), c(1), c(2), c(3)])).toBe(true);
    expect(flatPoints([c(1), c(1), c(1)])).toBe(true);
    expect(flatPoints([c(0), c(1), c(1)])).toBe(true);
    expect(flatPoints([c(1), c(2), c(3, 1e-7)])).toBe(false);
    expect(flatPoints([c(0), c(1), c(2), c(0, 1)])).toBe(false);
  });
  it('scale-free: the same shape gives the same answer at every size', () => {
    for (const k of [1e-3, 1, 1e3, 1e6]) {
      expect(flatPoints([c(0), c(k, k), c(2 * k, 2 * k)])).toBe(true);
      expect(flatPoints([c(k), c(2 * k), c(3 * k, 1e-7 * k)])).toBe(false);
    }
  });
});
