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
