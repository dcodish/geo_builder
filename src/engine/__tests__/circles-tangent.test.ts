/**
 * Two circles tangent to each other — "מעגל O ומעגל P משיקים זה לזה בנקודה M" /
 * "circle O and circle P are tangent at M". The centres are pulled to the touching
 * distance (external = r1+r2) and M is placed at the single touch point on the
 * centre line. Previously the משיק was grabbed by the tangent-LINE rule, which drew
 * a stray tangent and left the circles overlapping at their default spots.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parse } from '@/parser';
import { replay, useGeoStore } from '@/store/geoStore';

const s = () => useGeoStore.getState();
const pos = () => replay(s().facts).positions;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

beforeEach(() => s().clear());

describe('parse — circles tangent to each other', () => {
  it('two circles + משיק + "at M" → a single circles-tangent command (not a tangent line)', () => {
    const r = parse('מעגל O ומעגל P משיקים זה לזה בנקודה M');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.map((c) => c.type)).toEqual(['circles-tangent']);
    const c = r.commands[0] as { circle1: string; circle2: string; at: string; external: boolean };
    expect([c.circle1, c.circle2, c.at, c.external]).toEqual(['circle-O', 'circle-P', 'M', true]);
  });

  it('a single-circle "tangent to circle O at A" is still the tangent LINE rule', () => {
    const r = parse('tangent to circle O at A', { circles: ['O'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.map((c) => c.type)).toContain('tangent');
  });

  it('reads external (default) vs internal from the phrasing (He + En)', () => {
    const ext = (u: string) => (parse(u).ok && (parse(u) as { commands: { external?: boolean }[] }).commands[0].external) === true;
    expect(ext('circle O and circle P are tangent at M')).toBe(true); // default external
    expect(ext('מעגל O ומעגל P משיקים זה לזה בנקודה M')).toBe(true);
    expect(ext('circle O and circle P are tangent internally at M')).toBe(false);
    expect(ext('circle O and circle P are tangent from inside at M')).toBe(false);
    expect(ext('מעגל O ומעגל P משיקים מבפנים בנקודה M')).toBe(false);
  });
});

describe('engine — externally tangent circles', () => {
  beforeEach(() => {
    s().execute({ type: 'circle', id: 'circle-O', center: 'O', radius: 5 }, 'circle O');
    s().execute({ type: 'circle', id: 'circle-P', center: 'P', radius: 5 }, 'circle P');
    const r = parse('מעגל O ומעגל P משיקים זה לזה בנקודה M');
    if (r.ok) r.commands.forEach((c) => s().execute(c, 'tangent circles'));
  });

  it('pulls the centres to r1+r2 apart and places M at the touch point', () => {
    const O = pos().get('O')!;
    const P = pos().get('P')!;
    const M = pos().get('M')!;
    expect(dist(O, P)).toBeCloseTo(10, 3); // 5 + 5, externally tangent
    expect(dist(O, M)).toBeCloseTo(5, 3); // M on circle O
    expect(dist(P, M)).toBeCloseTo(5, 3); // …and on circle P → the single shared point
    // M lies between the centres (collinear, the touch point on the centre line).
    expect(dist(O, M) + dist(M, P)).toBeCloseTo(dist(O, P), 3);
  });

  it('the two circles no longer overlap (sole common point is M)', () => {
    // |centres| = r1 + r2 ⇒ external tangency: they meet only at M, never crossing.
    expect(dist(pos().get('O')!, pos().get('P')!)).toBeGreaterThanOrEqual(10 - 1e-3);
  });
});

describe('engine — internally tangent circles (one inside the other)', () => {
  beforeEach(() => {
    s().clear();
    s().execute({ type: 'circle', id: 'circle-O', center: 'O', radius: 8 }, 'circle O r8');
    s().execute({ type: 'circle', id: 'circle-P', center: 'P', radius: 3 }, 'circle P r3');
    const r = parse('מעגל O ומעגל P משיקים מבפנים בנקודה M');
    if (r.ok) r.commands.forEach((c) => s().execute(c, 'tangent internal'));
  });

  it('centres are |r1−r2| apart and M is on both circles (P inside O)', () => {
    const O = pos().get('O')!;
    const P = pos().get('P')!;
    const M = pos().get('M')!;
    expect(dist(O, P)).toBeCloseTo(5, 3); // |8 − 3|
    expect(dist(O, M)).toBeCloseTo(8, 3); // M on the big circle O
    expect(dist(P, M)).toBeCloseTo(3, 3); // …and on the small circle P → internal touch
  });
});
