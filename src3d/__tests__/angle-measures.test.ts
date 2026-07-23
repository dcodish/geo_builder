/**
 * The 3-D named-measure layer: angle EQUALITY ([ADR-3D-052](docs/06b-decisions-3d.md), issue #271),
 * a value for a named angle (issue #272), and numeric BOUNDS ([ADR-3D-053](docs/06b-decisions-3d.md),
 * issue #273).
 *
 * The operator's prod report (2026-07-22): «angle SAB = angle SAD» failed, and labelling both angles α
 * asserted NOTHING — two cosmetic stickers, no error, and a canvas drawing α on two angles the figure
 * did not make equal. A stated given silently dropped.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';
import { resolve3 } from '../engine/evaluate';
import { dot3, sub3 } from '../engine/vec3';
import type { Positions3 } from '../engine/types';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
const submit = (u: string) => useGeo3.getState().submit(u);
const build = (steps: string[]) => {
  reset();
  for (const u of steps) submit(u);
  const st = useGeo3.getState();
  return { st, ...derive3(st.facts, st.seed) };
};
const deg = (pos: Positions3, v: string, a: string, b: string) => {
  const u1 = sub3(pos.get(a)!, pos.get(v)!);
  const u2 = sub3(pos.get(b)!, pos.get(v)!);
  const n1 = Math.hypot(u1.x, u1.y, u1.z);
  const n2 = Math.hypot(u2.x, u2.y, u2.z);
  return (Math.acos(Math.max(-1, Math.min(1, dot3(u1, u2) / (n1 * n2)))) * 180) / Math.PI;
};
const PYRAMID = 'פירמידה ABCDS שבסיסה ריבוע';

describe('ADR-3D-052 — an angle EQUALITY between two named angles (#271)', () => {
  beforeEach(reset);

  it('parses every phrasing, in both languages', () => {
    for (const u of ['∠SAB = ∠SAD', 'זווית SAB = זווית SAD', 'angle SAB = angle SAD', 'הזווית SAB שווה לזווית SAD']) {
      const r = parse3(u);
      expect(r.ok, u).toBe(true);
      expect(r.ok && r.commands.some((c) => c.type === 'angle-pair-eq'), u).toBe(true);
    }
  });

  it('DRIVES the figure — the two angles come out equal in every configuration', () => {
    const { st, construction } = build([PYRAMID, '∠SAB = ∠SAD']);
    expect(st.lastError).toBeNull();
    for (const seed of [0, 1, 2, 3]) {
      const { positions } = resolve3(construction, seed);
      expect(deg(positions, 'A', 'S', 'B'), `seed ${seed}`).toBeCloseTo(deg(positions, 'A', 'S', 'D'), 6);
    }
  });

  it('a general equality needs no shared vertex or arm', () => {
    const r = parse3('∠ABC = ∠SAD');
    expect(r.ok && r.commands.some((c) => c.type === 'angle-pair-eq')).toBe(true);
  });

  it('REUSING a label asserts the equality — the silent half of #271', () => {
    // «∠SAB = α» then «∠SAD = α» used to record two cosmetic stickers and assert nothing, so the canvas
    // drew α on two angles the figure did not make equal.
    const { st, construction } = build([PYRAMID, '∠SAB = α', '∠SAD = α']);
    expect(st.lastError).toBeNull();
    expect(construction.scalarPins.some((p) => p.kind === 'cos-eq')).toBe(true);
    for (const seed of [0, 1, 2]) {
      const { positions } = resolve3(construction, seed);
      expect(deg(positions, 'A', 'S', 'B'), `seed ${seed}`).toBeCloseTo(deg(positions, 'A', 'S', 'D'), 6);
    }
  });

  it('a single label still just names its angle (no self-equality)', () => {
    const { construction } = build([PYRAMID, '∠SAB = α']);
    expect(construction.angleMarks).toHaveLength(1);
    expect(construction.scalarPins.some((p) => p.kind === 'cos-eq')).toBe(false);
  });

  it('the chained form names both angles at once', () => {
    const { st, construction } = build([PYRAMID, '∠SAB = ∠SAD = α']);
    expect(st.lastError).toBeNull();
    expect(construction.angleMarks.filter((m) => m.label === 'α')).toHaveLength(2);
    const { positions } = resolve3(construction, 0);
    expect(deg(positions, 'A', 'S', 'B')).toBeCloseTo(deg(positions, 'A', 'S', 'D'), 6);
  });
});

describe('a VALUE for a named angle (#272)', () => {
  beforeEach(reset);

  it('«α = 70» pins whatever α names', () => {
    const { st, construction } = build([PYRAMID, '∠SAB = α', 'α = 70']);
    expect(st.lastError).toBeNull();
    for (const seed of [0, 1, 2]) {
      expect(deg(resolve3(construction, seed).positions, 'A', 'S', 'B'), `seed ${seed}`).toBeCloseTo(70, 3);
    }
  });

  it('a shared label pins every angle wearing it', () => {
    const { st, construction } = build([PYRAMID, '∠SAB = α', '∠SAD = α', 'α = 70']);
    expect(st.lastError).toBeNull();
    const { positions } = resolve3(construction, 0);
    expect(deg(positions, 'A', 'S', 'B')).toBeCloseTo(70, 3);
    expect(deg(positions, 'A', 'S', 'D')).toBeCloseTo(70, 3);
  });

  it('a value for a letter that names nothing is REFUSED, never invented', () => {
    reset();
    submit(PYRAMID);
    submit('β = 70');
    expect(useGeo3.getState().lastError).toEqual({ code: 'unknown-symbol', id: 'β' });
  });
});

describe('ADR-3D-053 — numeric BOUNDS on an angle (#273)', () => {
  beforeEach(reset);

  it('parses one-sided, two-sided, named and word forms', () => {
    const cases: [string, Record<string, unknown>][] = [
      ['∠SAB > 60', { vertex: 'A', p: 'S', q: 'B', min: 60 }],
      ['∠SAB < 90', { vertex: 'A', p: 'S', q: 'B', max: 90 }],
      ['60 < ∠SAB < 90', { vertex: 'A', p: 'S', q: 'B', min: 60, max: 90 }],
      ['90 > ∠SAB > 60', { vertex: 'A', p: 'S', q: 'B', min: 60, max: 90 }],
      ['זווית SAB גדולה מ-60', { vertex: 'A', p: 'S', q: 'B', min: 60 }],
      ['זווית SAB קטנה מ-90', { vertex: 'A', p: 'S', q: 'B', max: 90 }],
      ['angle SAB is between 60 and 90', { vertex: 'A', p: 'S', q: 'B', min: 60, max: 90 }],
      ['α > 60', { label: 'α', min: 60 }],
      ['60 < α < 90', { label: 'α', min: 60, max: 90 }],
    ];
    for (const [u, shape] of cases) {
      const r = parse3(u);
      expect(r.ok, u).toBe(true);
      expect(r.ok && r.commands[0], u).toMatchObject({ type: 'angle-bound3', ...shape });
    }
  });

  it('the bound HOLDS, and every "show another configuration" stays inside it', () => {
    // The whole point of a requirement: it determines nothing, so it can only be honoured by CHOOSING
    // a configuration. `resample` used to be a blind seed+1 and would have walked straight out.
    const { st } = build([PYRAMID, '60 < ∠SAB < 70']);
    expect(st.lastError).toBeNull();
    for (let i = 0; i < 6; i++) {
      const cur = useGeo3.getState();
      const { positions } = resolve3(derive3(cur.facts, cur.seed).construction, cur.seed);
      const a = deg(positions, 'A', 'S', 'B');
      expect(a, `seed ${cur.seed}`).toBeGreaterThan(60);
      expect(a, `seed ${cur.seed}`).toBeLessThan(70);
      useGeo3.getState().resample();
    }
  });

  it('the angle keeps its DOF — a bound restricts, it does not determine', () => {
    const { st, construction } = build([PYRAMID, '60 < ∠SAB < 70']);
    const seen = new Set<string>();
    for (let s = st.seed; s < st.seed + 40; s++) {
      const { positions } = resolve3(construction, s);
      const a = deg(positions, 'A', 'S', 'B');
      if (a > 60 && a < 70) seen.add(a.toFixed(2));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('a bound on a NAMED angle resolves through its label', () => {
    const { st } = build([PYRAMID, '∠SAB = α', '60 < α < 70']);
    expect(st.lastError).toBeNull();
    const cur = useGeo3.getState();
    const { positions } = resolve3(derive3(cur.facts, cur.seed).construction, cur.seed);
    const a = deg(positions, 'A', 'S', 'B');
    expect(a).toBeGreaterThan(60);
    expect(a).toBeLessThan(70);
  });

  it('an empty window and an unknown label are refused, never silently dropped', () => {
    expect(parse3('70 < ∠SAB < 60').ok).toBe(false);
    reset();
    submit(PYRAMID);
    submit('60 < β < 70');
    expect(useGeo3.getState().lastError).toEqual({ code: 'unknown-symbol', id: 'β' });
  });

  it('an UNREACHABLE bound refuses and keeps the prior figure', () => {
    reset();
    submit(PYRAMID);
    const before = useGeo3.getState().facts.length;
    submit('179 < ∠SAB < 180'); // a square-base pyramid cannot open that far
    expect(useGeo3.getState().lastError).toEqual({ code: 'bound-unsatisfiable', id: '' });
    expect(useGeo3.getState().facts.length).toBe(before);
  });
});
