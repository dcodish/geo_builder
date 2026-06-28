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
  it('two circles + משיק + "at M" → a circles-tangent command (not a tangent line)', () => {
    // The circles aren't in context yet, so the rule also MATERIALISES them as FREE-radius circles
    // (ADR-052: unstated radius is a DOF) before the tangency. With the circles already present (ctx),
    // it emits the bare circles-tangent (tested below) — here we just confirm the relation is produced.
    const r = parse('מעגל O ומעגל P משיקים זה לזה בנקודה M', { circles: ['O', 'P'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands.map((c) => c.type)).toContain('circles-tangent');
    const c = r.commands.find((x) => x.type === 'circles-tangent') as { circle1: string; circle2: string; at: string; external: boolean };
    expect([c.circle1, c.circle2, c.at, c.external]).toEqual(['circle-O', 'circle-P', 'M', true]);
    // When the circles already exist, no circle is re-created (a stated radius is preserved).
    const r2 = parse('מעגל O ומעגל P משיקים זה לזה בנקודה M', { circles: ['O', 'P'] });
    expect(r2.ok && r2.commands.map((x) => x.type)).toEqual(['circles-tangent']);
  });

  it('a single-circle "tangent to circle O at A" is still the tangent LINE rule', () => {
    const r = parse('tangent to circle O at A', { circles: ['O'] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.map((c) => c.type)).toContain('tangent');
  });

  it('reads external (default) vs internal from the phrasing (He + En)', () => {
    const ext = (u: string) => {
      const r = parse(u);
      const c = r.ok ? r.commands.find((x) => x.type === 'circles-tangent') : undefined;
      return !!c && (c as { external?: boolean }).external === true;
    };
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
    const r = parse('מעגל O ומעגל P משיקים זה לזה בנקודה M', { circles: ['O', 'P'] });
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
    const r = parse('מעגל O ומעגל P משיקים מבפנים בנקודה M', { circles: ['O', 'P'] });
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

describe('engine — internal tangency flexes a radius rather than failing (ADR-037 A1)', () => {
  it('two EQUAL circles, internal → the 2nd shrinks to sit inside; M is on both', () => {
    s().clear();
    s().execute({ type: 'circle', id: 'circle-O', center: 'O', radius: 5 }, 'O');
    s().execute({ type: 'circle', id: 'circle-P', center: 'P', radius: 5 }, 'P');
    const r = parse('מעגל O ומעגל P משיקים מבפנים בנקודה M', { circles: ['O', 'P'] });
    if (r.ok) r.commands.forEach((c) => s().execute(c, 'internal eq'));
    const d = replay(s().facts);
    const f = s().facts.find((x) => x.utterance === 'internal eq')!;
    expect(d.status[f.id]).toBe('ok'); // works now — a radius is a flexible default
    const O = d.positions.get('O')!;
    const P = d.positions.get('P')!;
    const M = d.positions.get('M')!;
    // P shrank to 2.5; |OP| = 5 − 2.5 = 2.5; M on the big circle O (5) and the small P (2.5).
    expect(dist(O, M)).toBeCloseTo(5, 3);
    expect(dist(P, M)).toBeCloseTo(2.5, 3);
    expect(dist(O, P)).toBeCloseTo(2.5, 3);
  });
});

describe('engine — the inner radius is a first-class DOF (ADR-037 A2 / radius-as-DOF)', () => {
  const setup = () => {
    s().clear();
    s().execute({ type: 'circle', id: 'circle-O', center: 'O', radius: 5 }, 'O');
    s().execute({ type: 'circle', id: 'circle-P', center: 'P', radius: 5 }, 'P');
    const r = parse('מעגל O ומעגל P משיקים מבפנים בנקודה M', { circles: ['O', 'P'] });
    if (r.ok) r.commands.forEach((c) => s().execute(c, 'internal eq'));
  };

  it('the inner circle carries a DERIVED radius (no hidden ½ length pinned on it)', () => {
    setup();
    const c = replay(s().facts).construction.objects.find((o) => o.id === 'circle-P')!;
    // Honest: the radius is not a frozen length but derives from the centre gap.
    expect(c.kind === 'circle' && c.radius).toMatchObject({ via: 'tangent-inner', outer: 'circle-O' });
    // …and the drawn radius matches reality (= r(outer) − |OP|), not the typed 5.
    const d = replay(s().facts);
    const ri = dist(d.positions.get('P')!, d.positions.get('M')!);
    expect(ri).toBeCloseTo(5 - dist(d.positions.get('O')!, d.positions.get('P')!), 6);
  });

  it('"show another configuration" varies the inner radius while staying tangent', () => {
    setup();
    const facts = s().facts;
    const radii: number[] = [];
    for (let seed = 0; seed < 30; seed++) {
      const d = replay(facts, seed);
      if (!d.positions.get('O') || !d.positions.get('P') || !d.positions.get('M')) continue;
      const O = d.positions.get('O')!;
      const P = d.positions.get('P')!;
      const M = d.positions.get('M')!;
      const ri = dist(P, M); // the inner circle's actual radius (M is on it)
      // INVARIANT under every seed: M on the outer circle (5), and internal tangency
      // |OP| + r_inner = r_outer (collinear, P between O and M).
      expect(dist(O, M)).toBeCloseTo(5, 4);
      expect(dist(O, P) + ri).toBeCloseTo(5, 4);
      radii.push(ri);
    }
    // The inner radius genuinely flexes across seeds — it is not stuck at the 2.5 default.
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(0.3);
  });

  it('EXTERNAL tangency keeps the typed radii (a radius only flexes when forced)', () => {
    s().clear();
    s().execute({ type: 'circle', id: 'circle-O', center: 'O', radius: 5 }, 'O');
    s().execute({ type: 'circle', id: 'circle-P', center: 'P', radius: 5 }, 'P');
    const r = parse('מעגל O ומעגל P משיקים זה לזה בנקודה M', { circles: ['O', 'P'] }); // external (default)
    if (r.ok) r.commands.forEach((c) => s().execute(c, 'external eq'));
    const c = replay(s().facts).construction.objects.find((o) => o.id === 'circle-P')!;
    expect(c.kind === 'circle' && c.radius).toMatchObject({ via: 'length', value: 5 }); // untouched
  });

  it('a plain circle with nothing driving it keeps its typed radius', () => {
    s().clear();
    s().execute({ type: 'circle', id: 'circle-O', center: 'O', radius: 5 }, 'O');
    const c = replay(s().facts).construction.objects.find((o) => o.id === 'circle-O')!;
    expect(c.kind === 'circle' && c.radius).toMatchObject({ via: 'length', value: 5 });
  });
});

describe('verifier — the touch point must lie on both tangent circles', () => {
  it('a STATED-radii pair whose touch point is dragged off the circle is flagged (not silent green)', () => {
    // Stated radii 5 and 3 (a FIXED pair): the touch point M sits at radius 5 from O, so "OM = 3" cannot
    // move it without contradicting the given. The figure still LOOKS tangent (|OP| = 8 = 5+3) but M is no
    // longer on circle O — the verifier must surface that, else it reads as a clean green. (The free-radius
    // path instead resizes the circle so |OM| = 3 holds with M on it — tested above / in scenarios.)
    s().clear();
    s().execute({ type: 'circle', id: 'circle-O', center: 'O', radius: 5 }, 'O');
    s().execute({ type: 'circle', id: 'circle-P', center: 'P', radius: 3 }, 'P');
    const r = parse('מעגל O ומעגל P משיקים זה לזה בנקודה M', { circles: ['O', 'P'] });
    if (r.ok) r.commands.forEach((c) => s().execute(c, 'tangent'));
    s().execute({ type: 'set-distance', a: 'O', b: 'M', value: 3 }, 'OM=3');
    const d = replay(s().facts);
    expect(d.violations.some((v) => v.ids.includes('M'))).toBe(true);
  });
});
