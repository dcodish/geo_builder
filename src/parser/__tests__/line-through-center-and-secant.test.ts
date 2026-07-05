/**
 * Operator report (2026-06-20), tangent-secant figure:
 *  (1) "ישר AD עובר דרך מרכז המעגל" ("line AD passes through the CENTRE of the circle") created a
 *      PHANTOM circle P — the `circle` rule fired because `מרכז` (centre) matched its "centred" trigger,
 *      even though it was a REFERENCE to the existing circle's centre, not a circle definition. Fix:
 *      `centred` is a circle definition only when a centre is actually NAMED.
 *  (2) "AO חותך את המעגל בנקודות C ו-D" (a NAMED line cutting the circle at TWO points) had no rule —
 *      `lineMeetsCircle` handles one crossing, `secantFromExternal` needs "from a point". New
 *      `lineCutsCircleTwice` builds the secant + both crossings.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { replay, type Fact } from '@/store/geoStore';
import type { AnyCommand, Vec } from '@/engine';

describe('a reference to the circle CENTRE does not create a phantom circle', () => {
  it('"ישר AD עובר דרך מרכז המעגל" does NOT build a circle (defers instead)', () => {
    const r = parse('ישר AD עובר דרך מרכז המעגל', { circles: ['O'], points: ['O', 'A', 'D'] });
    if (r.ok) expect(r.commands.some((c) => c.type === 'circle' || c.type === 'circumcircle'), 'no phantom circle').toBe(false);
    else expect(r.ok).toBe(false); // deferring is fine
  });

  it('a real circle definition with a NAMED centre still works', () => {
    for (const u of ['מעגל שמרכזו O רדיוסו 5', 'circle centered at O', 'circle O', 'מעגל']) {
      const r = parse(u, { circles: [], points: [] });
      expect(r.ok && r.commands.some((c) => c.type === 'circle'), `"${u}" builds a circle`).toBe(true);
    }
  });
});

/**
 * "AB עובר דרך מרכזי המעגלים" (ADR-228 Am.4) — a line through two on-circle points that passes through BOTH
 * circle centres. The ORDERED set-line [A, centreOfA, centreOfB, B] puts A and B at the FAR intersections,
 * so they don't collapse onto the tangency point (which is on the centre line and on both circles).
 */
describe('a line through two on-circle points that crosses both centres (ADR-228 Am.4)', () => {
  const ctx = { circles: ['O1', 'O2'], points: ['O1', 'O2', 'A', 'B', 'E'], circleMembers: [{ center: 'O1', points: ['A'] }, { center: 'O2', points: ['B'] }] };
  it('"AB עובר דרך מרכזי המעגלים" → segment + ordered set-line [A, O1, O2, B]', () => {
    const r = parse('AB עובר דרך מרכזי המעגלים', ctx);
    expect(r.ok && r.commands).toEqual([
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'set-line', points: ['A', 'O1', 'O2', 'B'] },
    ]);
  });
  it('English "AB passes through the centres of the circles" → same', () => {
    const r = parse('AB passes through the centres of the circles', ctx);
    expect(r.ok && r.commands).toEqual([
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'set-line', points: ['A', 'O1', 'O2', 'B'] },
    ]);
  });
  it('the order pairs each endpoint with its OWN circle (A on O2, B on O1 ⇒ A adjacent O2 ⇒ [A, O2, O1, B])', () => {
    const swapped = { ...ctx, circleMembers: [{ center: 'O1', points: ['B'] }, { center: 'O2', points: ['A'] }] };
    const r = parse('AB עובר דרך מרכזי המעגלים', swapped);
    expect(r.ok && r.commands).toEqual([
      { type: 'segment', a: 'A', b: 'B' },
      { type: 'set-line', points: ['A', 'O2', 'O1', 'B'] },
    ]);
  });
  it('does NOT fire when the endpoints are not on distinct circles (e.g. "ישר AD עובר דרך מרכז המעגל")', () => {
    const r = parse('ישר AD עובר דרך מרכז המעגל', { circles: ['O'], points: ['O', 'A', 'D'] });
    // A,D are not on two distinct circles → this rule bows out (a phantom-circle-free defer / other rule)
    if (r.ok) expect(r.commands.some((c) => c.type === 'set-line')).toBe(false);
  });

  // The operator tried several phrasings; ALL must reach the same ordered set-line (ADR-228 Am.4).
  const expected = [
    { type: 'segment', a: 'A', b: 'B' },
    { type: 'set-line', points: ['A', 'O1', 'O2', 'B'] },
  ];
  it('names the centres explicitly: "AB עובר דרך O1 ו O2"', () => {
    expect((parse('AB עובר דרך O1 ו O2', ctx) as { ok: true; commands: unknown[] }).commands).toEqual(expected);
  });
  it('dash list "A-O1-O2-B" (no keyword at all)', () => {
    expect((parse('A-O1-O2-B', ctx) as { ok: true; commands: unknown[] }).commands).toEqual(expected);
  });
  it('dash list with the line word "ישר A-O1-O2-B"', () => {
    expect((parse('ישר A-O1-O2-B', ctx) as { ok: true; commands: unknown[] }).commands).toEqual(expected);
  });
  it('a 2-label "A-B" is NOT a collinear list (it is a segment, left alone)', () => {
    const r = parse('A-B', ctx);
    if (r.ok) expect(r.commands.some((c) => c.type === 'set-line')).toBe(false);
  });
});

describe('a named line cutting the circle at TWO points (secant)', () => {
  const ctx = { circles: ['O'], points: ['O', 'A'] };
  it('parses to line-through + both line-circle crossings', () => {
    for (const u of ['AO חותך את המעגל בנקודות C ו D', 'the line AO cuts the circle at C and D']) {
      const r = parse(u, ctx);
      expect(r.ok, u).toBe(true);
      if (!r.ok) continue;
      expect(r.commands.filter((c) => c.type === 'line-circle-intersection')).toHaveLength(2);
    }
  });

  it('a ONE-crossing "line AB cuts circle O at E" still routes to lineMeetsCircle', () => {
    const r = parse('הישר AB חותך את מעגל O בנקודה E', { circles: ['O'], points: ['A', 'B'] });
    expect(r.ok && r.commands.filter((c) => c.type === 'line-circle-intersection').length).toBe(1);
  });

  it('builds C, D on the circle and collinear with the line (a secant through the centre)', () => {
    const facts: Fact[] = [];
    let g = 0;
    const setup: AnyCommand[][] = [
      [{ type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true } as AnyCommand],
      [{ type: 'free-point', id: 'A', x: 12, y: 0 } as AnyCommand],
    ];
    for (const grp of setup) {
      const key = `g${g++}`;
      for (const cmd of grp) facts.push({ id: `${key}.${facts.length}`, group: key, enabled: true, cmd });
    }
    const r = parse('AO חותך את המעגל בנקודות C ו D', ctx);
    if (!r.ok) throw new Error('secant did not parse');
    const key = `g${g++}`;
    for (const cmd of r.commands) facts.push({ id: `${key}.${facts.length}`, group: key, enabled: true, cmd });

    const fig = replay(facts);
    expect(fig.lastError).toBeNull();
    const at = (id: string): Vec => fig.positions.get(id)!;
    const O = at('O'), A = at('A'), C = at('C'), D = at('D');
    expect(Math.hypot(C.x - O.x, C.y - O.y), '|OC| = radius').toBeCloseTo(5, 2);
    expect(Math.hypot(D.x - O.x, D.y - O.y), '|OD| = radius').toBeCloseTo(5, 2);
    const off = (p: Vec) => Math.abs((p.x - A.x) * (O.y - A.y) - (p.y - A.y) * (O.x - A.x)) / Math.hypot(O.x - A.x, O.y - A.y);
    expect(off(C), 'C on line AO').toBeLessThan(1e-3);
    expect(off(D), 'D on line AO').toBeLessThan(1e-3);
  });
});
