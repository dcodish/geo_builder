/**
 * Phase-5d — the constraint family beyond `angle` (ADR-014 generic mechanism):
 * distance, equal-segments, parallel, perpendicular. Each *drives* an on-segment
 * point's parameter t when one is referenced (the constraint places it), and is
 * an over-constraint *check* when every referenced point is already determined.
 */

import { describe, it, expect } from 'vitest';
import type { AnyCommand, Command, Vec } from '../types';
import { build, applyStep, emptyConstruction } from '../step';
import { dist, sub } from '../geometry';
import { parse } from '@/parser';

const dot = (u: Vec, v: Vec) => u.x * v.x + u.y * v.y;
const crossp = (u: Vec, v: Vec) => u.x * v.y - u.y * v.x;

/** A,B on the x-axis with an on-segment point E between them. */
const onAB = (bx: number) => [
  { type: 'free-point', id: 'A', x: 0, y: 0 } as const,
  { type: 'free-point', id: 'B', x: bx, y: 0 } as const,
  { type: 'point-on-segment', id: 'E', a: 'A', b: 'B' } as const,
];

describe('distance constraint', () => {
  it('drives an on-segment point to the given distance', () => {
    const { positions } = build([...onAB(10), { type: 'set-distance', a: 'E', b: 'A', value: 3 }]);
    expect(dist(positions.get('A')!, positions.get('E')!)).toBeCloseTo(3, 6);
  });

  it('is an over-constraint check when both points are fixed (keeps prior figure)', () => {
    const sq = build([{ type: 'square', ids: ['A', 'B', 'C', 'D'], side: 5 }]);
    const r = applyStep(sq.construction, { type: 'set-distance', a: 'A', b: 'B', value: 7 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/over-constrained/i);
  });
});

describe('a constraint drives a FREE vertex (2 DOF) when no parametric carrier exists (ADR-030)', () => {
  it('reshapes a parallelogram so a side equals a diagonal (|AB| = |AC|)', () => {
    // ABCD parallelogram (A,B,C free, D derived); the diagonal AC; then |AB| = |AC|.
    // No on-segment/on-circle DOF is referenced, so the engine moves a free vertex to
    // the nearest configuration that satisfies it (a parallelogram with side = diagonal).
    const pgram = build([{ type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] }, { type: 'segment', a: 'A', b: 'C' }]);
    const r = applyStep(pgram.construction, { type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'C' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const P = r.positions;
    expect(dist(P.get('A')!, P.get('B')!)).toBeCloseTo(dist(P.get('A')!, P.get('C')!), 4);
    // still a parallelogram: D = A + C − B
    const A = P.get('A')!, B = P.get('B')!, C = P.get('C')!, D = P.get('D')!;
    expect(D.x).toBeCloseTo(A.x + C.x - B.x, 4);
    expect(D.y).toBeCloseTo(A.y + C.y - B.y, 4);
  });

  it('a square is rigid — the same |AB| = |AC| is rejected (committed shape, not driven)', () => {
    const sq = build([{ type: 'square', ids: ['A', 'B', 'C', 'D'] }, { type: 'segment', a: 'A', b: 'C' }]);
    const r = applyStep(sq.construction, { type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'C' });
    expect(r.ok).toBe(false); // |AC| = √2·|AB| intrinsically; can't hold
    if (!r.ok) expect(r.error).toMatch(/over-constrained/i);
  });
});

describe('equal-segments constraint', () => {
  it('drives an on-segment point to make two segments equal (here: the midpoint)', () => {
    const { positions } = build([...onAB(10), { type: 'set-equal', a: 'E', b: 'A', c: 'E', d: 'B' }]);
    const A = positions.get('A')!, B = positions.get('B')!, E = positions.get('E')!;
    expect(dist(E, A)).toBeCloseTo(dist(E, B), 6);
    expect(E.x).toBeCloseTo(5, 6); // midpoint of A(0,0)–B(10,0)
  });
});

describe('"diameter AB" on two existing points is a constraint (AB is a diameter), not a redefinition', () => {
  const P = (u: string, ctx?: { circles: string[] }): AnyCommand[] => {
    const r = parse(u, ctx);
    if (!r.ok) throw new Error(u);
    return r.commands;
  };
  it('makes two inscribed vertices antipodal (|AB| = diameter, midpoint = centre)', () => {
    const { positions } = build([...P('triangle ABD inscribed in circle O radius 5'), ...P('diameter AB', { circles: ['O'] })]);
    const [A, B, O] = ['A', 'B', 'O'].map((id) => positions.get(id)!);
    expect(dist(A, B)).toBeCloseTo(10, 2); // a diameter of the radius-5 circle
    expect(dist({ x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }, O)).toBeCloseTo(0, 3); // midpoint is the centre
  });
  it('coexists with another constraint on the same vertices (DE=DF AND AB-diameter together)', () => {
    const { positions } = build([
      ...P('triangle ABD inscribed in circle O radius 5'),
      ...P('the tangent at D and the extension of AB meet at E', { circles: ['O'] }),
      ...P('point F on AB'),
      ...P('DE=DF'),
      ...P('diameter AB', { circles: ['O'] }),
    ]);
    const [A, B, D, E, F] = ['A', 'B', 'D', 'E', 'F'].map((id) => positions.get(id)!);
    expect(dist(A, B)).toBeCloseTo(10, 1); // AB is a diameter…
    expect(dist(D, E)).toBeCloseTo(dist(D, F), 1); // …and DE=DF still holds (jointly satisfied)
  });
});

describe('a constraint its direct carrier cannot meet recruits other free DOFs (reconfigures)', () => {
  it('"DE = DF" with F stuck on segment AB reconfigures the triangle until it holds', () => {
    // |DF| (F on segment AB) can't reach |DE| (E far out on the tangent) in the
    // default triangle — but it CAN if the free vertices move. The engine must find that.
    const cmds = [
      ['triangle ABD inscribed in circle O radius 5', undefined],
      ['the tangent at D and the extension of AB meet at E', { circles: ['O'] }],
      ['point F on AB', undefined],
      ['DE = DF', undefined],
    ].flatMap(([u, ctx]) => {
      const r = parse(u as string, ctx as { circles: string[] } | undefined);
      if (!r.ok) throw new Error(u as string);
      return r.commands;
    });
    const { positions } = build(cmds as Command[]);
    const [A, B, D, E, F, O] = ['A', 'B', 'D', 'E', 'F', 'O'].map((id) => positions.get(id)!);
    expect(dist(D, E)).toBeCloseTo(dist(D, F), 2); // the constraint now holds…
    const t = (sub(F, A).x * sub(B, A).x + sub(F, A).y * sub(B, A).y) / (sub(B, A).x ** 2 + sub(B, A).y ** 2);
    expect(t).toBeGreaterThan(-0.02); // …with F still ON segment AB…
    expect(t).toBeLessThan(1.02);
    for (const p of [A, B, D]) expect(dist(O, p)).toBeCloseTo(5, 2); // …and A,B,D still on the circle
  });
});

describe('a constraint drives a FREE point, not one already pinned by another constraint', () => {
  it('"DF = DE" moves the free E, not F (which a second definition pinned)', () => {
    // F is defined twice (a point on AB, then = the tangent∩AB intersection) → pinned
    // by a coincidence. "DF = DE" must drive the free E, not fight F's pin.
    const cmds = [
      'triangle ABD inscribed in circle O radius 5',
      'point F on the extension of AB',
      'tangent to circle O at D',
      'F is the intersection of the tangent to circle O at D and AB',
      'point E on AB',
      'DF = DE',
    ].flatMap((u) => {
      const r = parse(u);
      if (!r.ok) throw new Error(u);
      return r.commands;
    });
    const { positions } = build(cmds as Command[]);
    const [D, E, F] = ['D', 'E', 'F'].map((id) => positions.get(id)!);
    expect(dist(D, F)).toBeCloseTo(dist(D, E), 4); // the constraint holds…
    expect(dist(positions.get('A')!, F)).toBeGreaterThan(0.1); // …and F isn't collapsed onto A
  });
});

describe('a trivially-true equal ("DF = DF") is a no-op, not a degenerate drive', () => {
  it('does not slide an on-segment carrier to t=0 (which collapsed F onto A)', () => {
    // F is a point on segment AB; "DF = DF" references F but constrains nothing —
    // it must not drive F to a degenerate position.
    const { positions } = build([
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'free-point', id: 'B', x: 10, y: 0 },
      { type: 'free-point', id: 'D', x: 5, y: 6 },
      { type: 'point-on-segment', id: 'F', a: 'A', b: 'B', t: 0.4 },
      { type: 'set-equal', a: 'D', b: 'F', c: 'D', d: 'F' }, // trivially true
    ]);
    expect(positions.get('F')!.x).toBeCloseTo(4, 6); // F stays at t=0.4 (x=4), not driven to A (x=0)
  });
});

describe('ratio constraint (a proportion |AB| = k·|CD|)', () => {
  it('drives an on-segment point so |AE| = 2·|EB| (E at the 2:1 point)', () => {
    const { positions } = build([...onAB(6), { type: 'set-ratio', a: 'E', b: 'A', c: 'E', d: 'B', k: 2 }]);
    const A = positions.get('A')!, B = positions.get('B')!, E = positions.get('E')!;
    expect(dist(E, A)).toBeCloseTo(2 * dist(E, B), 6);
    expect(E.x).toBeCloseTo(4, 6); // |AE|=4, |EB|=2 on A(0,0)–B(6,0)
  });

  it('parses "AE = 2 EB" and drives the same point (end to end)', () => {
    const r = parse('AE = 2 EB');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { positions } = build([...onAB(6), ...r.commands]);
    expect(positions.get('E')!.x).toBeCloseTo(4, 6);
  });

  it('is an over-constraint check when both segments are fixed (keeps prior figure)', () => {
    const sq = build([{ type: 'square', ids: ['A', 'B', 'C', 'D'], side: 5 }]); // |AB| = |BC|
    const r = applyStep(sq.construction, { type: 'set-ratio', a: 'A', b: 'B', c: 'B', d: 'C', k: 2 }); // demands |AB| = 2|BC|
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/over-constrained/i);
  });
});

describe('perpendicular constraint', () => {
  it('drives an on-segment point so AE ⟂ AB', () => {
    const { positions } = build([
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'free-point', id: 'B', x: 4, y: 0 },
      { type: 'free-point', id: 'P', x: -2, y: 4 },
      { type: 'free-point', id: 'Q', x: 2, y: 4 },
      { type: 'point-on-segment', id: 'E', a: 'P', b: 'Q' },
      { type: 'set-perpendicular', a: 'A', b: 'E', c: 'A', d: 'B' },
    ]);
    const A = positions.get('A')!, B = positions.get('B')!, E = positions.get('E')!;
    expect(dot(sub(E, A), sub(B, A))).toBeCloseTo(0, 5);
  });
});

describe('parallel constraint', () => {
  it('drives an on-segment point so AE ∥ AB', () => {
    const { positions } = build([
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'free-point', id: 'B', x: 4, y: 0 },
      { type: 'free-point', id: 'P', x: 3, y: -2 },
      { type: 'free-point', id: 'Q', x: 3, y: 2 },
      { type: 'point-on-segment', id: 'E', a: 'P', b: 'Q' },
      { type: 'set-parallel', a: 'A', b: 'E', c: 'A', d: 'B' },
    ]);
    const A = positions.get('A')!, B = positions.get('B')!, E = positions.get('E')!;
    expect(crossp(sub(E, A), sub(B, A))).toBeCloseTo(0, 5);
  });

  it('is an over-constraint check when the segments are fixed and not parallel', () => {
    // square ABCD: AB ⟂ BC, so declaring AB ∥ BC contradicts the figure.
    const sq = build([{ type: 'square', ids: ['A', 'B', 'C', 'D'] }]);
    const r = applyStep(sq.construction, { type: 'set-parallel', a: 'A', b: 'B', c: 'B', d: 'C' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/over-constrained/i);
  });
});

describe('parser → constraint commands', () => {
  it('parses the four constraint phrasings (He + En)', () => {
    const cases: [string, object][] = [
      ['AB = 6', { type: 'set-distance', a: 'A', b: 'B', value: 6 }],
      ['AB = CD', { type: 'set-equal', a: 'A', b: 'B', c: 'C', d: 'D' }],
      ['BC parallel to AD', { type: 'set-parallel', a: 'B', b: 'C', c: 'A', d: 'D' }],
      ['BC מקביל ל-AD', { type: 'set-parallel', a: 'B', b: 'C', c: 'A', d: 'D' }],
      ['AB perpendicular to CD', { type: 'set-perpendicular', a: 'A', b: 'B', c: 'C', d: 'D' }],
      ['AB מאונך ל-CD', { type: 'set-perpendicular', a: 'A', b: 'B', c: 'C', d: 'D' }],
    ];
    for (const [utterance, expected] of cases) {
      const r = parse(utterance);
      expect(r.ok, `"${utterance}" should parse`).toBe(true);
      if (r.ok) expect(r.commands[0]).toEqual(expected);
    }
  });

  it('the unnamed-foot phrasing "perpendicular from A to BC" now builds an altitude (foot + segment)', () => {
    const r = parse('perpendicular from A to BC');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.commands.map((c) => c.type)).toContain('foot');
  });
});

// guard: a constraint that drives a point keeps existing points stable
describe('stability', () => {
  it('driving E does not move A or B', () => {
    const r1 = build(onAB(10));
    const r2 = applyStep(r1.construction, { type: 'set-distance', a: 'E', b: 'A', value: 3 });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.positions.get('A')).toEqual(r1.positions.get('A'));
    expect(r2.positions.get('B')).toEqual(r1.positions.get('B'));
  });
});

// keep the empty-import-free check honest
it('emptyConstruction is the zero figure', () => {
  expect(emptyConstruction()).toEqual({ objects: [], constraints: [] });
});
