import { describe, it, expect } from 'vitest';
import { parse } from '@/parser/parse';

/**
 * ADR-228 — three related size-given features:
 *   A. `O_1` / `O_{1}` point-label subscripts normalise to the glued `O1` (a letter + glued digits is the
 *      only point-token form; the underscore silently truncated the label to `O`).
 *   B. a CIRCLE sized by its circumference (`שהיקפו 6π` ⇒ r = C/2π = 3) or area (`ששטחו 9π` ⇒ r = √(A/π) = 3)
 *      — a circle's size IS its radius, so both reduce to the numeric-radius path.
 *   C. a POLYGON perimeter (`היקף ABC = 20`) / perimeter ratio as a first-class constraint (sibling of area).
 *
 * The Hebrew word היקף is BOTH a circle's circumference and a polygon's perimeter — the two are told apart by
 * whether the utterance names a circle (circle → radius; polygon → `set-perimeter`).
 */
const cmds = (u: string) => {
  const r = parse(u, { circles: [] as string[] });
  return r.ok ? r.commands : null;
};

describe('point-label subscript O_1 → O1 (ADR-228 A)', () => {
  it('circle O_1 keeps its subscript AND reads the circumference', () => {
    expect(cmds('מעגל O_1 שהיקפו 6π')).toEqual([{ type: 'circle', id: 'circle-O1', center: 'O1', radius: 3 }]);
  });
  it('O_{1} braces form normalises too', () => {
    expect(cmds('circle O_{1} radius 5')).toEqual([{ type: 'circle', id: 'circle-O1', center: 'O1', radius: 5 }]);
  });
  it('a segment A_1 B_2 keeps both subscripts', () => {
    expect(cmds('A_1 B_2')).toEqual([{ type: 'segment', a: 'A1', b: 'B2' }]);
  });
  it('the area marker S_{ABC} is NOT touched (uppercase letters, not digits)', () => {
    expect(cmds('S_{ABC} = 13')).toEqual([{ type: 'measure-area', ids: ['A', 'B', 'C'], expr: { value: 13 } }]);
  });
});

describe('circle sized by circumference / area (ADR-228 B)', () => {
  const r3 = [{ type: 'circle', id: 'circle-O', center: 'O', radius: 3 }];
  it('circumference 6π (He, possessive שהיקפו) ⇒ radius 3', () => {
    expect(cmds('מעגל O שהיקפו 6π')).toEqual(r3);
  });
  it('circumference 6π (En, with copula)', () => {
    expect(cmds('circle O with circumference 6π')).toEqual(r3);
  });
  it('area 9π (He, possessive ששטחו) ⇒ radius 3', () => {
    expect(cmds('מעגל O ששטחו 9π')).toEqual(r3);
  });
  it('area 9π (En)', () => {
    expect(cmds('circle O area 9π')).toEqual(r3);
  });
  it('a plain-number circumference 12 ⇒ radius 12/2π', () => {
    const c = cmds('circle O circumference 12');
    expect(c?.[0]).toMatchObject({ type: 'circle', center: 'O' });
    expect((c?.[0] as { radius: number }).radius).toBeCloseTo(12 / (2 * Math.PI), 6);
  });
});

describe('polygon perimeter (ADR-228 C)', () => {
  it('היקף המשולש ABC = 20 → set-perimeter', () => {
    expect(cmds('היקף המשולש ABC = 20')).toEqual([{ type: 'set-perimeter', ids: ['A', 'B', 'C'], value: 20 }]);
  });
  it('perimeter of the rectangle ABCD is 24 (En, quad)', () => {
    expect(cmds('perimeter of the rectangle ABCD is 24')).toEqual([{ type: 'set-perimeter', ids: ['A', 'B', 'C', 'D'], value: 24 }]);
  });
  it('perimeter ratio היקף ABC = 2 היקף DEF → set-perimeter-ratio', () => {
    expect(cmds('היקף ABC = 2 היקף DEF')).toEqual([{ type: 'set-perimeter-ratio', ids1: ['A', 'B', 'C'], ids2: ['D', 'E', 'F'], k: 2 }]);
  });
  it('a perimeter on a CIRCLE is NOT a polygon perimeter — the circle rule sizes the radius', () => {
    // "circumference"/"היקף" naming a circle must not emit set-perimeter.
    const c = cmds('מעגל O שהיקפו 6π');
    expect(c?.some((k) => k.type === 'set-perimeter')).toBe(false);
    expect(c?.[0].type).toBe('circle');
  });
});

describe('tangent circles: stated names + circumference on an existing circle (ADR-228 Am.)', () => {
  // The two names follow the PLURAL noun ("מעגלים O1 ו O2"), which the per-circle "מעגל X" regex missed
  // (the "ים" plural suffix breaks `מעגל\s+` adjacency) — so O1/O2 were dropped and O/P invented.
  it('שני מעגלים O1 ו O2 משיקים מבחוץ → circles named O1 and O2 (not O/P)', () => {
    const c = cmds('שני מעגלים O1 ו O2 משיקים מבחוץ');
    const circles = c?.filter((k) => k.type === 'circle') as { center: string }[] | undefined;
    expect(circles?.map((k) => k.center).sort()).toEqual(['O1', 'O2']);
    expect(c?.some((k) => k.type === 'circles-tangent')).toBe(true);
  });
  it('English "circles O1 and O2 tangent externally" → same', () => {
    const c = cmds('circles O1 and O2 are tangent externally');
    const circles = c?.filter((k) => k.type === 'circle') as { center: string }[] | undefined;
    expect(circles?.map((k) => k.center).sort()).toEqual(['O1', 'O2']);
  });
  it('the two-NAMED prefixed form "circle O and circle P" still works', () => {
    const c = cmds('circle O and circle P are tangent at M');
    const circles = c?.filter((k) => k.type === 'circle') as { center: string }[] | undefined;
    expect(circles?.map((k) => k.center).sort()).toEqual(['O', 'P']);
  });
  it('circumference on an EXISTING circle → set-radius (not a duplicate circle), with the "pi" word', () => {
    // circle O1 already exists in context ⇒ "היקף מעגל O1 הוא 6pi" flexes it via set-radius.
    const r = parse('היקף מעגל O1 הוא 6pi', { circles: ['O1'] });
    expect(r.ok && r.commands).toEqual([{ type: 'set-radius', circle: 'circle-O1', value: 3 }]);
  });
  it('circumference on a NON-existing circle still CREATES it (via the circle rule)', () => {
    const r = parse('מעגל O1 שהיקפו 6pi', { circles: [] });
    expect(r.ok && r.commands).toEqual([{ type: 'circle', id: 'circle-O1', center: 'O1', radius: 3 }]);
  });
  it('AREA on an existing circle → set-radius (√(A/π)): "שטח מעגל O2 הוא 81π" ⇒ r=9', () => {
    const r = parse('שטח מעגל O2 הוא 81π', { circles: ['O2'] });
    expect(r.ok && r.commands).toEqual([{ type: 'set-radius', circle: 'circle-O2', value: 9 }]);
  });
  it('area on an existing circle WITHOUT the "מעגל" word (bare known-circle label): "שטח O2 הוא 81π"', () => {
    const r = parse('שטח O2 הוא 81π', { circles: ['O2'] });
    expect(r.ok && r.commands).toEqual([{ type: 'set-radius', circle: 'circle-O2', value: 9 }]);
  });
  it('a bare "שטח O2" whose label is NOT a known circle bows out (does not set a radius)', () => {
    expect(cmds('שטח O2 הוא 81π')).not.toEqual([{ type: 'set-radius', circle: 'circle-O2', value: 9 }]);
  });
  it('a POLYGON area "שטח ABC = 13" stays an area even when a circle O exists (not a circle size)', () => {
    const r = parse('שטח המשולש ABC הוא 13', { circles: ['O'] });
    expect(r.ok && r.commands).toEqual([{ type: 'measure-area', ids: ['A', 'B', 'C'], expr: { value: 13 } }]);
  });
});
