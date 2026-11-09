/**
 * #2764 ([ADR-3D-454](../../../docs/06b-decisions-3d.md#adr-3d-454)) — the independent parts of a 3-D figure and the
 * per-part configuration (`components3.ts`), and `resolve3` part by part (`evaluate.ts`).
 */
import { describe, expect, it } from 'vitest';
import { applyCommand3 } from '../apply';
import { canonicalSeed3, cleanSeed3, NAMELESS_FIELDS3, partsOf3, sameSeed3, seedKey3, seedNumber3, seedOfPart3, seedPartsOf3 } from '../components3';
import { firstSatisfyingSeed3, freeDofCount3, resolve3 } from '../evaluate';
import { emptyConstruction3, type Construction3 } from '../types';
import { parse3 } from '../../parser/parse3';

function build(...lines: string[]): Construction3 {
  let c = emptyConstruction3();
  for (const line of lines) {
    const p = parse3(line);
    if (!p.ok) throw new Error(`parse: ${line}`);
    for (const cmd of p.commands) {
      const r = applyCommand3(c, cmd);
      if (!r.ok) throw new Error(`apply: ${line}: ${JSON.stringify(r.error)}`);
      c = r.next;
    }
  }
  return c;
}

const NINE = ['מרובע ABCD', 'טרפז EFGH', 'טרפז שווה שוקיים IJKL', 'טרפז ישר זווית MNOP', 'מקבילית QRST', 'מלבן UVWX', 'מעוין A1B1C1D1', 'ריבוע E1F1G1H1', 'דלתון I1J1K1L1'];

describe('#2764 partsOf3 — which statements share an unknown', () => {
  it('nine separate shapes are nine parts, keyed by their solids, in the order stated', () => {
    const parts = partsOf3(build(...NINE));
    expect(parts.length).toBe(9);
    expect(parts[0].key).toBe('solid-polygon4-ABCD');
    expect(parts.map((p) => p.construction.solids.length)).toEqual(Array(9).fill(1));
    // each part keeps its solid's index in the whole (layout, similarity)
    expect(parts.map((p) => p.construction.partOf?.solidIndex[0])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('a later line that links two squares makes them one part («AB ∥ EF»)', () => {
    expect(partsOf3(build('ריבוע ABCD', 'ריבוע EFGH')).length).toBe(2);
    expect(partsOf3(build('ריבוע ABCD', 'ריבוע EFGH', 'AB ∥ EF')).length).toBe(1);
  });

  it('a point defined from a shape joins it; a figure with a coordinate keeps the whole figure one part', () => {
    expect(partsOf3(build('ריבוע ABCD', 'ריבוע EFGH', 'M אמצע AE')).length).toBe(1);
    const parts = partsOf3(build('ריבוע ABCD', 'ריבוע EFGH', 'M אמצע AB'));
    expect(parts.length).toBe(2);
    expect(parts[0].construction.points.has('M')).toBe(true);
    expect(partsOf3(build('ריבוע ABCD', 'ריבוע EFGH', 'P(1,2,3)')).length).toBe(1);
  });

  it('a circle through a ring joins that ring only', () => {
    const parts = partsOf3(build('מרובע ABCD', 'מעגל חוסם את ABCD', 'מרובע EFGH', 'מעגל חוסם את EFGH'));
    expect(parts.length).toBe(2);
    expect(parts.map((p) => p.construction.circles3.length)).toEqual([1, 1]);
  });

  it('TOTALITY: every Construction3 field is split by its type (array, map, set) or listed as holding no name', () => {
    const c = build('ריבוע ABCD', 'ריבוע EFGH');
    const record = { ...c, param: undefined } as unknown as Record<string, unknown>;
    for (const field of Object.keys(record)) {
      const v = record[field];
      const split = Array.isArray(v) || v instanceof Map || v instanceof Set;
      expect(split || NAMELESS_FIELDS3.includes(field), `field ${field} is neither split nor listed`).toBe(true);
    }
  });
});

describe('#2764 resolve3 part by part', () => {
  it('a figure of ONE part takes the old path: the same object at the plain seed and at its own entry', () => {
    const c = build('קובייה ABCDA\'B\'C\'D\'', 'M אמצע AB');
    expect(partsOf3(c).length).toBe(1);
    for (const s of [0, 1, 2, 3, 4, 5]) expect(resolve3(c, { seed: s, parts: { 'solid-other': 9 } })).toBe(resolve3(c, s));
  });

  it('a part resolved inside the whole is drawn exactly as the same part alone at the same seed', () => {
    const whole = build('מרובע ABCD', 'מעגל חוסם את ABCD', 'מעוין EFGH');
    const alone = build('מרובע ABCD', 'מעגל חוסם את ABCD');
    for (const s of [0, 1, 2, 3]) {
      const w = resolve3(whole, s).positions;
      const a = resolve3(alone, s).positions;
      for (const id of ['A', 'B', 'C', 'D']) expect(w.get(id)).toEqual(a.get(id));
    }
  });

  it('the freedom cue counts the same whether the figure is resolved part by part or as one system', () => {
    for (const lines of [NINE.slice(0, 4), ['טרפז ABCD', 'דלתון EFGH'], ['מרובע ABCD', 'מעגל חוסם את ABCD', 'מעוין EFGH']]) {
      const c = build(...lines);
      expect(partsOf3(c).length).toBeGreaterThan(1);
      // `partOf` set on the whole marks it as already a part: the old one-system path
      const asOne: Construction3 = { ...c, partOf: { solidIndex: c.solids.map((_s, i) => i) } };
      for (const s of [0, 1]) expect(freeDofCount3(c, resolve3(c, s)), lines.join(' · ')).toBe(freeDofCount3(asOne, resolve3(asOne, s)));
    }
  });

  it('each part sits at its own entry: moving one entry moves that part only', () => {
    const c = build('ריבוע ABCD', 'מלבן EFGH');
    const r0 = resolve3(c, 0);
    const r1 = resolve3(c, { seed: 0, parts: { 'solid-polygon4-EFGH': 5 } });
    for (const id of ['A', 'B', 'C', 'D']) expect(r1.positions.get(id)).toEqual(r0.positions.get(id));
    expect(r1.positions.get('G')).not.toEqual(r0.positions.get('G'));
  });

  it('the search walks each part from its own entry; a part already drawn as itself keeps it', () => {
    const c = build(...NINE);
    const found = firstSatisfyingSeed3(c, 0);
    expect(found).not.toBeNull();
    // the first part (a general quadrilateral) is good at 0, so it stays there
    expect(seedOfPart3(found!, 'solid-polygon4-ABCD')).toBe(0);
    // searching again from what was found moves nothing
    expect(sameSeed3(firstSatisfyingSeed3(c, found!)!, found!)).toBe(true);
  });
});

describe('#2764 Seed3 — the per-part configuration', () => {
  it('canonical form: entries equal to the base dropped, none left is the plain number', () => {
    expect(canonicalSeed3(3, { a: 3 })).toBe(3);
    expect(canonicalSeed3(3, { b: 5, a: 3 })).toEqual({ seed: 3, parts: { b: 5 } });
    expect(seedKey3({ seed: 3, parts: { a: 3 } })).toBe('3');
    expect(seedKey3({ seed: 0, parts: { y: 2, x: 1 } })).toBe(seedKey3({ seed: 0, parts: { x: 1, y: 2 } }));
    expect(sameSeed3(4, { seed: 4, parts: {} })).toBe(true);
    expect(seedNumber3({ seed: 7, parts: { a: 1 } })).toBe(7);
    expect(seedOfPart3({ seed: 7, parts: { a: 1 } }, 'a')).toBe(1);
    expect(seedOfPart3({ seed: 7, parts: { a: 1 } }, 'b')).toBe(7);
  });

  it('read from a file: a number loads as is, a malformed part entry is dropped, a bad base is refused', () => {
    expect(cleanSeed3(7)).toBe(7);
    expect(cleanSeed3(7, { a: 2, b: 'x', c: 1.5, '': 4 })).toEqual({ seed: 7, parts: { a: 2 } });
    expect(cleanSeed3(7, [1, 2])).toBe(7);
    expect(cleanSeed3('7')).toBeNull();
    expect(cleanSeed3(Number.NaN)).toBeNull();
    expect(seedPartsOf3(7)).toBeUndefined();
    expect(seedPartsOf3({ seed: 7, parts: { a: 2 } })).toEqual({ a: 2 });
  });

  it('when two parts join, the joined part takes the entry of the earliest key', () => {
    const c = build('ריבוע ABCD', 'ריבוע EFGH', 'AB ∥ EF');
    const seed = { seed: 0, parts: { 'solid-polygon4-ABCD': 4, 'solid-polygon4-EFGH': 9 } };
    expect(resolve3(c, seed)).toBe(resolve3(c, 4));
  });
});
