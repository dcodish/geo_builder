/**
 * #1268 ([ADR-AG-157](../../docs/06c-decisions-analytic.md#adr-ag-157)) — «הראשונה» AND «השנייה» NAME
 * THEIR ROOT.
 *
 * #1113's ruling was *the sentence names the root*. Measured at the base, the ordinal chose nothing:
 *
 *   «P נקודת החיתוך השנייה של הישר CA עם המעגל x^2+y^2=16»   →  the same point as «… הראשונה …», seeds 0–2
 *   the chord A(-5,1)·B(5,1): click the RIGHT ring               →  «… הראשונה …» committed, P on the LEFT
 *   a triangle side («הצלע CA»)                                  →  its ring offered no ordinal at all
 *
 * Every expected position here is read from `conicMeet` — the order the rings and the selector share —
 * never written out as a coordinate, so the lock is about the ORDER and not about one figure's numbers.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { crossingsOf, offersOf } from '../engine/crossings';
import { conicMeet, walkOfCoefficients, walkThrough } from '../engine/crossing-order';
import { anotherConfiguration } from '../app/another';
import { parseLine } from '../parser/parseAnalytic';
import type { NumCurve } from '../engine/types';

type P = { x: number; y: number };
const CIRCLE = 'x^2+y^2=16';
const CHORD = ['A(-5,1)', 'B(5,1)', CIRCLE, 'הקטע AB'];
const TRIANGLE = ['A(0,0)', 'B(6,0)', 'C(3,5)', 'משולש ABC', CIRCLE];
const NTH = ['הראשונה', 'השנייה'] as const;
const cross = (name: string, nth: 0 | 1 | null, straight: string) =>
  `${name} נקודת החיתוך${nth === null ? '' : ` ${NTH[nth]}`} של ${straight} עם המעגל ${CIRCLE}`;

const pt = (lines: string[], id: string, seed = 0) => derive(lines, seed).figure.points.find((p) => p.id === id);
const near = (p: P | undefined, q: P) => p !== undefined && Math.hypot(p.x - q.x, p.y - q.y) < 1e-4;

/** The circle as the figure resolved it. */
function circleOf(lines: string[]): NumCurve {
  const cu = derive(lines, 0).figure.curves.find((c) => c.curve.kind === 'circle');
  if (!cu) throw new Error('no circle');
  return cu.curve;
}
/** The pair's crossings in the canonical order, for a straight through two placed points, walked from→to. */
function rootsThrough(lines: string[], from: string, to: string): P[] {
  const f = derive(lines, 0).figure;
  const a = f.points.find((p) => p.id === from)!;
  const b = f.points.find((p) => p.id === to)!;
  return conicMeet(walkThrough(a, b)!, circleOf(lines)).roots;
}

describe('#1268 — one ordinal, no second point: the word picks the root', () => {
  it('on a SEGMENT that meets the circle twice (the chord): «השנייה» and «הראשונה» land on their own roots, at every seed', () => {
    const roots = rootsThrough(CHORD, 'A', 'B');
    expect(roots).toHaveLength(2);
    for (const nth of [0, 1] as const) {
      for (const seed of [0, 1, 2, 3]) {
        const p = pt([...CHORD, cross('P', nth, 'הקטע AB')], 'P', seed);
        expect(near(p, roots[nth])).toBe(true);
      }
    }
  });

  it('the same on an unbounded line through two points that name no drawn piece', () => {
    const lines = ['A(-5,1)', 'B(5,1)', CIRCLE];
    const roots = rootsThrough(lines, 'A', 'B');
    for (const nth of [0, 1] as const) expect(near(pt([...lines, cross('P', nth, 'הישר AB')], 'P'), roots[nth])).toBe(true);
  });

  it('the letters carry the direction: «הראשונה של הישר BA» is «השנייה של הישר AB»', () => {
    const ab = pt([...CHORD, cross('P', 1, 'הישר AB')], 'P');
    const ba = pt([...CHORD, cross('P', 0, 'הישר BA')], 'P');
    expect(ab).toBeDefined();
    expect(near(ba, ab!)).toBe(true);
  });

  it('a line given by its EQUATION is walked left to right, and a vertical one bottom to top', () => {
    for (const eq of ['y=1', 'x=1']) {
      const lines = [CIRCLE, `נתון הישר ${eq}`];
      const cu = derive(lines, 0).figure.curves.find((c) => c.curve.kind === 'line')!.curve as Extract<NumCurve, { kind: 'line' }>;
      const roots = conicMeet(walkOfCoefficients(cu.a, cu.b, cu.c)!, circleOf(lines)).roots;
      expect(roots).toHaveLength(2);
      // The reading direction, stated once in crossing-order.ts: left→right, or bottom→top when vertical.
      if (eq === 'y=1') expect(roots[0].x).toBeLessThan(roots[1].x);
      else expect(roots[0].y).toBeLessThan(roots[1].y);
      for (const nth of [0, 1] as const) {
        expect(near(pt([...lines, cross('P', nth, `הישר ${eq}`)], 'P'), roots[nth])).toBe(true);
      }
    }
  });
});

describe('#1268 — a triangle SIDE: the order is the line’s, the extent is the side’s', () => {
  it('the side’s ring OFFERS its ordinal, numbered over the whole line (it used to offer none)', () => {
    const d = derive(TRIANGLE, 0);
    const roots = rootsThrough(TRIANGLE, 'C', 'A');
    const ring = crossingsOf(d.figure, d.construction).find((k) => k.first === 'הצלע CA');
    expect(ring).toBeDefined();
    expect(ring!.nth).toBeDefined();
    expect(near(ring, roots[ring!.nth!])).toBe(true);
  });

  it('«הראשונה של הצלע CA» lands on that root, at every seed', () => {
    const roots = rootsThrough(TRIANGLE, 'C', 'A');
    for (const seed of [0, 1, 2]) expect(near(pt([...TRIANGLE, cross('P', 0, 'הצלע CA')], 'P', seed), roots[0])).toBe(true);
  });

  it('REFUSED: «השנייה של הצלע CA» names the crossing beyond the side — and only that sentence is blamed', () => {
    const line = cross('P', 1, 'הצלע CA');
    const d = derive([...TRIANGLE, line], 0);
    expect(d.faults).toHaveLength(1);
    expect(d.faults[0].code).toBe('unsatisfiable');
    expect(d.faults[0].detail).toBe(line);
  });
});

describe('#1268 — the pair, and «הציגו תצורה אחרת»', () => {
  it('#1113’s pair: «הראשונה» and «השנייה» named together are the two roots, EACH the one it names', () => {
    const roots = rootsThrough(CHORD, 'A', 'B');
    const lines = [...CHORD, cross('P', 0, 'הקטע AB'), cross('Q', 1, 'הקטע AB')];
    expect(derive(lines, 0).faults).toEqual([]);
    expect(near(pt(lines, 'P'), roots[0])).toBe(true);
    expect(near(pt(lines, 'Q'), roots[1])).toBe(true);
  });

  it('a sentence WITHOUT an ordinal still takes the root its sibling left', () => {
    const roots = rootsThrough(CHORD, 'A', 'B');
    const lines = [...CHORD, cross('P', 1, 'הקטע AB'), cross('Q', null, 'הקטע AB')];
    expect(near(pt(lines, 'P'), roots[1])).toBe(true);
    expect(near(pt(lines, 'Q'), roots[0])).toBe(true);
  });

  it('REFUSED: the same ordinal twice names a point that already has a name', () => {
    const second = cross('Q', 0, 'הקטע AB');
    const d = derive([...CHORD, cross('P', 0, 'הקטע AB'), second], 0);
    expect(d.faults).toHaveLength(1);
    expect(d.faults[0].detail).toBe(second);
    expect(d.faults[0].code).toBe('crossing-already-named');
  });

  it('cycling configurations never swaps an ordinal-named crossing', () => {
    // A free point K gives the figure other configurations to cycle through; P's sentence named its root.
    const lines = [...CHORD, 'נקודה K', cross('P', 1, 'הקטע AB')];
    const roots = rootsThrough(CHORD, 'A', 'B');
    let seed = 0;
    let moved = 0;
    for (let press = 0; press < 6; press += 1) {
      const next = anotherConfiguration(lines, seed);
      if (next.found) moved += 1;
      seed = next.seed;
      expect(near(pt(lines, 'P', seed), roots[1])).toBe(true);
    }
    // The walk really did move the figure — otherwise the assertion above checked nothing.
    expect(moved).toBeGreaterThan(0);
  });
});

describe('#1268 — the click path: the ring you click is the root you get, and the word says which', () => {
  it('the operator’s chord: both rings offered with their own word; clicking the RIGHT ring puts P on the right', () => {
    const d0 = derive(CHORD, 0);
    const offers = offersOf(d0.figure, d0.construction);
    const rings = offers.filter((o) => o.sentence.includes('נקודת החיתוך'));
    expect(rings).toHaveLength(2);
    const right = rings.reduce((a, b) => (b.x > a.x ? b : a));
    const left = rings.find((r) => r !== right)!;
    // The ring on the second root in canonical order (A→B, left to right) says «השנייה».
    expect(right.sentence).toContain('השנייה');
    expect(left.sentence).toContain('הראשונה');

    const once = [...CHORD, right.sentence];
    const d1 = derive(once, 0);
    expect(d1.faults).toEqual([]);
    expect(near(d1.figure.points.find((p) => p.id === 'P'), right)).toBe(true);

    // The remaining ring is NOT re-numbered once one is taken: it still says «הראשונה», and its click
    // lands where it was offered.
    const rest = offersOf(d1.figure, d1.construction).filter((o) => o.sentence.includes('נקודת החיתוך'));
    expect(rest).toHaveLength(1);
    expect(rest[0].sentence).toContain('הראשונה');
    const twice = [...once, rest[0].sentence];
    const d2 = derive(twice, 0);
    expect(d2.faults).toEqual([]);
    expect(near(d2.figure.points.find((p) => p.id === 'Q'), left)).toBe(true);
    // …and the first click's point has not moved.
    expect(near(d2.figure.points.find((p) => p.id === 'P'), right)).toBe(true);
  });
});

describe('#1268 — the grammar', () => {
  const sel = (line: string) => {
    const r = parseLine(line);
    if (!r.ok) throw new Error(`did not parse: ${line}`);
    return r.facts.find((f) => f.t === 'selector');
  };
  it('an ordinal lowers to crossing-nth, in both spellings', () => {
    expect(sel(cross('P', 0, 'הקטע AB'))).toMatchObject({ sel: { kind: 'crossing-nth', nth: 0 } });
    expect(sel(cross('P', 1, 'הקטע AB'))).toMatchObject({ sel: { kind: 'crossing-nth', nth: 1 } });
    expect(sel(`P נקודת החיתוך השניה של הקטע AB עם המעגל ${CIRCLE}`)).toMatchObject({ sel: { kind: 'crossing-nth', nth: 1 } });
  });
  it('no ordinal, or «האחרת», keeps crossing-distinct', () => {
    expect(sel(cross('P', null, 'הקטע AB'))).toMatchObject({ sel: { kind: 'crossing-distinct' } });
    expect(sel(`P נקודת החיתוך האחרת של הקטע AB עם המעגל ${CIRCLE}`)).toMatchObject({ sel: { kind: 'crossing-distinct' } });
  });
});
