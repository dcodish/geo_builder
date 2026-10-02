/**
 * #1512 ([ADR-AG-185](../../docs/06c-decisions-analytic.md#adr-ag-185)) — BOTH CROSSINGS NAMED IN ONE
 * SENTENCE: «הישר l1 חותך את המעגל I בנקודות A ו-B» / «A ו-B נקודות החיתוך של הישר l1 עם המעגל I».
 *
 * Measured at the base: both spellings `not-handled`. The operator's ruling, 2026-09-29, option (a):
 * A takes the FIRST root of #1268's canonical order (`crossing-order.ts`), B the second.
 *
 * **Amended by the operator's ruling of 2026-10-01 (#1539, ADR-AG-197):** «הציגו תצורה אחרת» *"should always
 * swap if there are more than 1 option"* — the stated order is the FIRST drawing (configuration 0), and the
 * press reaches the swapped assignment. The three sweep locks below that asserted "never cycled" now assert
 * the ruling: configuration 0 in the stated order, both assignments reachable, always the pair's two roots.
 *
 * Every expected position is read from `conicMeet` over the figure's OWN resolved curves — the order the
 * rings and the selector share — never written out as a coordinate, so the lock is about the ORDER.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { conicMeet, walkOfCoefficients, walkThrough } from '../engine/crossing-order';
import { anotherConfiguration } from '../app/another';
import { parseLine } from '../parser/parseAnalytic';
import type { NumCurve } from '../engine/types';

type P = { x: number; y: number };
const CIRCLE = 'נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9';
const L1 = 'נתון הישר l1: y=x+1';
const VERB = 'הישר l1 חותך את המעגל I בנקודות A ו-B';
const NOUN = 'A ו-B נקודות החיתוך של הישר l1 עם המעגל I';

const near = (p: P | undefined, q: P) => p !== undefined && Math.hypot(p.x - q.x, p.y - q.y) < 1e-4;
const pt = (d: ReturnType<typeof derive>, id: string) => d.figure.points.find((p) => p.id === id);

/** The pair's roots in the canonical order, read off the figure the derivation drew at this seed. */
function canonicalRoots(d: ReturnType<typeof derive>, through?: [string, string]): P[] {
  const curves = d.figure.curves.map((c) => c.curve as NumCurve);
  const conic = curves.find((c) => c.kind !== 'line')!;
  if (through) {
    const w = walkThrough(pt(d, through[0])!, pt(d, through[1])!)!;
    return conicMeet(w, conic).roots;
  }
  const line = curves.find((c) => c.kind === 'line') as Extract<NumCurve, { kind: 'line' }>;
  return conicMeet(walkOfCoefficients(line.a, line.b, line.c)!, conic).roots;
}

describe('#1512 — both spellings build, A on the first canonical root and B on the second', () => {
  it.each([
    [VERB],
    [NOUN],
    ['הנקודות A ו-B הן נקודות החיתוך של הישר l1 והמעגל I'],
    ['הישר l1 והמעגל I נחתכים בנקודות A ו-B'],
    ['line l1 cuts circle I at points A and B'],
    ['A and B are the intersection points of line l1 and circle I'],
  ])('«%s»', (line) => {
    const d = derive([CIRCLE, L1, line], 0);
    expect(d.faults).toEqual([]);
    const roots = canonicalRoots(d);
    expect(roots).toHaveLength(2);
    expect(near(pt(d, 'A'), roots[0])).toBe(true);
    expect(near(pt(d, 'B'), roots[1])).toBe(true);
  });

  it('lowers to the two ordinal sentences it abbreviates: two declares, four incidences, two `crossing-nth`', () => {
    const r = parseLine(VERB);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.facts.filter((f) => f.t === 'declare').map((f) => (f as { id: string }).id)).toEqual(['A', 'B']);
    expect(r.facts.filter((f) => f.t === 'constraint')).toHaveLength(4);
    const nth = r.facts.flatMap((f) => (f.t === 'selector' && f.sel.kind === 'crossing-nth' ? [f.sel] : []));
    expect(nth.map((s) => [s.id, s.nth, s.both])).toEqual([['A', 0, true], ['B', 1, true]]);
    expect(r.facts.every((f) => f.src === VERB)).toBe(true);
  });
});

describe('#1512 — the 12-seed sweep and «הציגו תצורה אחרת»', () => {
  // A circle whose centre is a free parameter and a free point K: the figure really has other configurations.
  const FREE = ['נתון מעגל I שמשוואתו (x-a)^2+(y-4)^2=9', L1, 'נקודה K'];

  it('at every one of 12 seeds A and B are the pair\'s two roots; seed 0 takes the stated order, and both assignments occur (both spellings)', () => {
    for (const line of [VERB, NOUN]) {
      const centres = new Set<string>();
      const orders = new Set<string>();
      for (let seed = 0; seed < 12; seed += 1) {
        const d = derive([...FREE, line], seed);
        expect(d.faults).toEqual([]);
        const roots = canonicalRoots(d);
        expect(roots).toHaveLength(2);
        const stated = near(pt(d, 'A'), roots[0]) && near(pt(d, 'B'), roots[1]);
        const swapped = near(pt(d, 'A'), roots[1]) && near(pt(d, 'B'), roots[0]);
        expect(stated || swapped, `seed ${seed}`).toBe(true);
        if (seed === 0) expect(stated, 'configuration 0 is the stated order').toBe(true);
        orders.add(stated ? 'stated' : 'swapped');
        const c = d.figure.curves.find((cu) => cu.curve.kind === 'circle')!.curve as Extract<NumCurve, { kind: 'circle' }>;
        centres.add(c.cx.toFixed(3));
      }
      // The sweep really moved the figure — otherwise the order was checked on one configuration.
      expect(centres.size).toBeGreaterThan(1);
      expect(orders.size, 'the swap is reachable (ruling 2026-10-01)').toBe(2);
    }
  });

  it('a line through two points is walked in the order its letters are written — «הישר DC» swaps the roots', () => {
    const base = ['C(-5,1)', 'D(5,2)', 'נתון מעגל I שמשוואתו x^2+y^2=16'];
    const cd = derive([...base, 'הישר CD חותך את המעגל I בנקודות P ו-Q'], 0);
    const dc = derive([...base, 'הישר DC חותך את המעגל I בנקודות P ו-Q'], 0);
    expect(cd.faults).toEqual([]);
    expect(dc.faults).toEqual([]);
    const roots = canonicalRoots(cd, ['C', 'D']);
    expect(near(pt(cd, 'P'), roots[0])).toBe(true);
    expect(near(pt(cd, 'Q'), roots[1])).toBe(true);
    expect(near(pt(dc, 'P'), roots[1])).toBe(true);
    expect(near(pt(dc, 'Q'), roots[0])).toBe(true);
  });

  it('pressing «הציגו תצורה אחרת» reaches the swapped assignment, and every press keeps A and B on the two roots', () => {
    const lines = [...FREE, VERB];
    let seed = 0;
    let moved = 0;
    let swaps = 0;
    for (let press = 0; press < 6; press += 1) {
      const next = anotherConfiguration(lines, seed);
      if (next.found) moved += 1;
      seed = next.seed;
      const d = derive(lines, seed);
      const roots = canonicalRoots(d);
      const stated = near(pt(d, 'A'), roots[0]) && near(pt(d, 'B'), roots[1]);
      const swapped = near(pt(d, 'A'), roots[1]) && near(pt(d, 'B'), roots[0]);
      expect(stated || swapped).toBe(true);
      if (swapped) swaps += 1;
    }
    expect(moved).toBeGreaterThan(0);
    expect(swaps).toBeGreaterThan(0);
  });

  it('a figure with no freedom swaps the letters on the press — its only other configuration (ruling 2026-10-01)', () => {
    const lines = [CIRCLE, L1, VERB];
    const d0 = derive(lines, 0);
    const next = anotherConfiguration(lines, 0);
    expect(next.found).toBe(true);
    const d1 = derive(lines, next.seed);
    expect(d1.faults).toEqual([]);
    expect(near(pt(d1, 'A'), pt(d0, 'B')!)).toBe(true);
    expect(near(pt(d1, 'B'), pt(d0, 'A')!)).toBe(true);
  });
});

describe('#1512 — renaming swaps the LETTER, never the point', () => {
  const d0 = derive([CIRCLE, L1, VERB], 0);
  const roots = canonicalRoots(d0);

  it('editing the row to «…בנקודות C ו-B» puts C where A was; B stays', () => {
    const d = derive([CIRCLE, L1, 'הישר l1 חותך את המעגל I בנקודות C ו-B'], 0);
    expect(d.faults).toEqual([]);
    expect(pt(d, 'A')).toBeUndefined();
    expect(near(pt(d, 'C'), roots[0])).toBe(true);
    expect(near(pt(d, 'B'), roots[1])).toBe(true);
  });

  it('«…בנקודות B ו-A» is the other assignment: the two positions are the same two points', () => {
    const d = derive([CIRCLE, L1, 'הישר l1 חותך את המעגל I בנקודות B ו-A'], 0);
    expect(d.faults).toEqual([]);
    expect(near(pt(d, 'B'), roots[0])).toBe(true);
    expect(near(pt(d, 'A'), roots[1])).toBe(true);
  });
});

describe('#1512 — REFUSED: a pair that does not meet in two points, naming the sentence', () => {
  it.each([
    ['a tangent line (y=7 touches the circle at one point)', [CIRCLE, 'נתון הישר l1: y=7', VERB]],
    ['a line that misses the circle (y=9)', [CIRCLE, 'נתון הישר l1: y=9', VERB]],
    ['two straight lines, which meet once', ['נתון הישר l1: y=x', 'נתון הישר l2: y=-x+2', 'הישר l1 חותך את הישר l2 בנקודות A ו-B']],
  ])('%s', (_label, lines) => {
    const d = derive(lines as string[], 0);
    const mine = d.faults.filter((f) => f.index === lines.length - 1);
    expect(mine.map((f) => f.code)).toEqual(['unsatisfiable']);
    expect(mine[0].detail).toBe(lines[lines.length - 1]);
  });

  it('one letter twice is refused by the grammar, never a point named twice', () => {
    const r = parseLine('הישר l1 חותך את המעגל I בנקודות A ו-A');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('repeated-vertex');
  });

  it('a free radius never draws the two letters on one point — the tangent sample is walked past, at 12 seeds', () => {
    const lines = ['נתון מעגל I שמשוואתו x^2+y^2=r^2', 'נתון הישר l1: y=2', VERB];
    for (let seed = 0; seed < 12; seed += 1) {
      const d = derive(lines, seed);
      expect(d.faults).toEqual([]);
      const a = pt(d, 'A')!;
      const b = pt(d, 'B')!;
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.1);
    }
  });

  it('neighbour: a SINGLE ordinal at a tangency still builds (ADR-AG-157 unchanged — it states one point)', () => {
    const d = derive([CIRCLE, 'נתון הישר l1: y=7', 'A נקודת החיתוך הראשונה של הישר l1 עם המעגל I'], 0);
    expect(d.faults).toEqual([]);
  });
});
