/**
 * Collinearity constraint (ADR-050) — "E on line AC" / "line CE passes through A" / "A B C collinear".
 *
 * The bug it fixes: a student building "two circles meet at A,B; C on one, E on the other; line CE
 * through A" had no way to make C, A, E collinear — "line CE passes through A" was silently dropped
 * and "E on the extension of AC" hit a redefine error. Both now route to a `collinear` constraint
 * that drives a free DOF until the three points line up. (See src/__tests__/scenarios.test.ts for the
 * exact end-to-end utterance sequence.)
 */

import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';
import { build, evaluate } from '@/engine';
import type { AnyCommand, Id, Vec } from '@/engine';

/** Twice the signed area of triangle (a,b,c) — 0 ⇔ collinear. */
const cross3 = (a: Vec, b: Vec, c: Vec) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const at = (pos: Map<Id, Vec>, id: Id): Vec => {
  const v = pos.get(id);
  if (!v) throw new Error(`no position for ${id}`);
  return v;
};
/** The three points are collinear AND none collapsed onto another (a real config, not E = A). */
const collinearNonDegenerate = (pos: Map<Id, Vec>, a: Id, b: Id, c: Id) => {
  const [pa, pb, pc] = [at(pos, a), at(pos, b), at(pos, c)];
  const span = Math.max(dist(pa, pb), dist(pb, pc), dist(pa, pc));
  expect(Math.abs(cross3(pa, pb, pc)) / (span * span), `${a},${b},${c} collinear`).toBeLessThan(1e-3);
  expect(dist(pa, pb), `${a}≠${b}`).toBeGreaterThan(1e-2 * span);
  expect(dist(pb, pc), `${b}≠${c}`).toBeGreaterThan(1e-2 * span);
  expect(dist(pa, pc), `${a}≠${c}`).toBeGreaterThan(1e-2 * span);
};

/** The two-circles-meet figure the operator built (O=(0,0) r5, P=(4,0) r3.6; C on P, E on O). */
const secantFigure = (): AnyCommand[] => [
  { type: 'circle', id: 'circle-O', center: 'O', radius: 5, autoCenter: true },
  { type: 'circle', id: 'circle-P', center: 'P', radius: 3.6, autoCenter: true },
  { type: 'circle-circle-intersection', id: 'A', circle1: 'circle-O', circle2: 'circle-P', branch: 0 },
  { type: 'circle-circle-intersection', id: 'B', circle1: 'circle-O', circle2: 'circle-P', branch: 1 },
  { type: 'point-on-circle', id: 'C', circle: 'circle-P' },
  { type: 'point-on-circle', id: 'E', circle: 'circle-O' },
];

describe('parser — collinearity phrasings', () => {
  const collinearCmd = (cmds: AnyCommand[]) => cmds.find((c) => c.type === 'set-collinear');

  it('"E on line AC" → set-collinear with E first (the driven point) + draws AC', () => {
    const r = parse('E on line AC');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(collinearCmd(r.commands)).toEqual({ type: 'set-collinear', a: 'E', b: 'A', c: 'C' });
    expect(r.commands).toContainEqual({ type: 'segment', a: 'A', b: 'C' });
  });

  it('Hebrew "E על הישר AC" parses the same', () => {
    const r = parse('E על הישר AC');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(collinearCmd(r.commands)).toEqual({ type: 'set-collinear', a: 'E', b: 'A', c: 'C' });
  });

  it('"line CE passes through A" → drive a point of the line (C/E listed first), A last + draws CE', () => {
    const r = parse('line CE passes through A');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(collinearCmd(r.commands)).toEqual({ type: 'set-collinear', a: 'C', b: 'E', c: 'A' });
    expect(r.commands).toContainEqual({ type: 'segment', a: 'C', b: 'E' });
  });

  it('Hebrew "ישר CE עובר בנקודה A" parses the same (the operator\'s exact words)', () => {
    const r = parse('ישר CE עובר בנקודה A');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(collinearCmd(r.commands)).toEqual({ type: 'set-collinear', a: 'C', b: 'E', c: 'A' });
  });

  it('"A, B, C collinear" / "A B C על ישר אחד" → a bare collinear of the three', () => {
    for (const u of ['A, B, C are collinear', 'A B C על ישר אחד']) {
      const r = parse(u);
      expect(r.ok, u).toBe(true);
      if (!r.ok) continue;
      expect(collinearCmd(r.commands), u).toEqual({ type: 'set-collinear', a: 'A', b: 'B', c: 'C' });
    }
  });

  it('does NOT hijack a plain "C on AB" (point-on-segment) or "E על מעגל O"', () => {
    const seg = parse('C on AB');
    expect(seg.ok && seg.commands.some((c) => c.type === 'point-on-segment')).toBe(true);
    expect(seg.ok && seg.commands.some((c) => c.type === 'set-collinear')).toBe(false);
    const circ = parse('E על מעגל O');
    expect(circ.ok && circ.commands.some((c) => c.type === 'set-collinear')).toBe(false);
  });
});

describe('engine — collinearity drives a free DOF', () => {
  it('"E on line AC" slides E along its circle onto line AC (the other crossing, not E = A)', () => {
    const { positions } = build([...secantFigure(), { type: 'set-collinear', a: 'E', b: 'A', c: 'C' }]);
    collinearNonDegenerate(positions, 'E', 'A', 'C');
  });

  it('"line CE passes through A" lines up C, E, A by sliding a point of the line', () => {
    const r = parse('ישר CE עובר בנקודה A');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { positions } = build([...secantFigure(), ...r.commands]);
    collinearNonDegenerate(positions, 'C', 'E', 'A');
  });

  it('a CHAIN of two collinear constraints solves (triangular: D on line AC, then E on line DB)', () => {
    // The shared carrier D drives "A,D,C collinear"; E drives "D,B,E collinear" (E depends on D). The
    // joint sum-of-squares pulls D toward both and used to return the seed (false over-constraint). The
    // binding-aware seed + keeping an accepted candidate through the polish now place both.
    const { positions } = build([
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5, autoCenter: true },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 3.6, autoCenter: true },
      { type: 'circle-circle-intersection', id: 'A', circle1: 'circle-O', circle2: 'circle-P', branch: 0 },
      { type: 'circle-circle-intersection', id: 'B', circle1: 'circle-O', circle2: 'circle-P', branch: 1 },
      { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
      { type: 'point-on-circle', id: 'D', circle: 'circle-P' },
      { type: 'set-collinear', a: 'A', b: 'D', c: 'C' }, // drives D onto line AC
      { type: 'point-on-circle', id: 'E', circle: 'circle-O' },
      { type: 'set-collinear', a: 'D', b: 'B', c: 'E' }, // drives E onto line DB
    ]);
    collinearNonDegenerate(positions, 'A', 'D', 'C');
    collinearNonDegenerate(positions, 'D', 'B', 'E');
    expect(dist(at(positions, 'P'), at(positions, 'D'))).toBeCloseTo(3.6, 1); // D stayed on circle P
    expect(dist(at(positions, 'O'), at(positions, 'E'))).toBeCloseTo(5, 1); // E stayed on circle O
  });

  it('the redefine "E על המשך הצלע AC" reinterprets as collinear (no "already defined" error)', () => {
    // pointOnExtension emits point-on-segment id=E; E already exists on circle O, so step.ts turns the
    // redefinition into a collinear constraint that slides E onto line AC instead of erroring.
    const r = parse('E על המשך הצלע AC');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.commands).toContainEqual({ type: 'point-on-segment', id: 'E', a: 'A', b: 'C', t: 1.3 });
    const { positions } = build([...secantFigure(), ...r.commands]);
    collinearNonDegenerate(positions, 'E', 'A', 'C');
  });

  it('an on-segment point is driven to lie on a line through two others (closed-form root)', () => {
    // G slides along AB (the x-axis); line CD is the vertical x = 2, so G lands at the crossing (2, 0).
    const { positions, construction } = build([
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'free-point', id: 'B', x: 6, y: 0 },
      { type: 'point-on-segment', id: 'G', a: 'A', b: 'B' },
      { type: 'free-point', id: 'C', x: 2, y: 3 },
      { type: 'free-point', id: 'D', x: 2, y: -3 },
      { type: 'set-collinear', a: 'G', b: 'C', c: 'D' },
    ]);
    expect(construction.objects.find((o) => o.id === 'G')?.kind).toBe('on-segment-solved'); // the carrier the constraint drives
    expect(evaluate(construction).ok).toBe(true);
    collinearNonDegenerate(positions, 'G', 'C', 'D');
    expect(at(positions, 'G').x).toBeCloseTo(2, 1);
  });
});

describe('engine — second-intersection pattern (point on a circle, line through a co-circular point)', () => {
  // "E on line DB" with E on circle O and B ALSO on circle O is "the OTHER crossing of line DB with O",
  // so E becomes a line∩circle that AVOIDS B — deterministic, never the degenerate E = B (the bug the
  // operator hit: E landing on B / on the wrong side, seed-dependently).
  const chainFig = (): AnyCommand[] => [
    { type: 'circle', id: 'circle-O', center: 'O', radius: 5, autoCenter: true },
    { type: 'circle', id: 'circle-P', center: 'P', radius: 3.6, autoCenter: true },
    { type: 'circle-circle-intersection', id: 'A', circle1: 'circle-O', circle2: 'circle-P', branch: 0 },
    { type: 'circle-circle-intersection', id: 'B', circle1: 'circle-O', circle2: 'circle-P', branch: 1 },
    { type: 'point-on-circle', id: 'C', circle: 'circle-O' },
    { type: 'point-on-circle', id: 'D', circle: 'circle-P' },
    { type: 'point-on-circle', id: 'E', circle: 'circle-O' },
    { type: 'set-collinear', a: 'C', b: 'A', c: 'D' }, // C = line(A,D) ∩ O, avoid A
    { type: 'set-collinear', a: 'E', b: 'D', c: 'B' }, // E = line(D,B) ∩ O, avoid B
  ];

  it('E and C become line∩circle crossings (avoiding the shared point), never degenerate', () => {
    const { construction, positions } = build(chainFig());
    expect(construction.objects.find((o) => o.id === 'E')?.kind).toBe('line-circle');
    expect(construction.objects.find((o) => o.id === 'C')?.kind).toBe('line-circle');
    collinearNonDegenerate(positions, 'E', 'D', 'B');
    collinearNonDegenerate(positions, 'C', 'A', 'D');
    // The defining symptom: E is NOT the shared crossing B, and C is NOT A.
    const span = dist(at(positions, 'O'), at(positions, 'B'));
    expect(dist(at(positions, 'E'), at(positions, 'B'))).toBeGreaterThan(0.2 * span);
    expect(dist(at(positions, 'C'), at(positions, 'A'))).toBeGreaterThan(0.2 * span);
    expect(dist(at(positions, 'O'), at(positions, 'E'))).toBeCloseTo(5, 6); // exactly on circle O
  });

  it('is deterministic — the same figure built twice gives the same E (no seed dependence)', () => {
    const a = build(chainFig()).positions;
    const b = build(chainFig()).positions;
    expect(dist(at(a, 'E'), at(b, 'E'))).toBeLessThan(1e-9);
  });
});

describe('parser + engine — ordered line "line ABE" (collinear AND in order)', () => {
  /** Parameter of B projected onto A→E: 0<t<1 ⇔ B is between A and E (the listed order). */
  const tBetween = (a: Vec, b: Vec, e: Vec) => {
    const dir = { x: e.x - a.x, y: e.y - a.y };
    return ((b.x - a.x) * dir.x + (b.y - a.y) * dir.y) / (dir.x * dir.x + dir.y * dir.y);
  };

  it('parses "line ABE" / "ישר ABE" / "line ABEF" to set-line; "line AB" (2 pts) is a plain segment', () => {
    expect(parse('line ABE')).toEqual({ ok: true, commands: [{ type: 'set-line', points: ['A', 'B', 'E'] }] });
    expect(parse('ישר ABE')).toEqual({ ok: true, commands: [{ type: 'set-line', points: ['A', 'B', 'E'] }] });
    expect(parse('line ABEF')).toEqual({ ok: true, commands: [{ type: 'set-line', points: ['A', 'B', 'E', 'F'] }] });
    // 2 points → NOT the ordered-line form; it's the bare-segment shorthand (draw segment AB).
    expect(parse('line AB')).toEqual({ ok: true, commands: [{ type: 'segment', a: 'A', b: 'B' }] });
  });

  it('"line DBE" puts E beyond B (B between D and E) on circle O, deterministically', () => {
    const r = parse('line DBE');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { positions } = build([
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5, autoCenter: true },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 3.6, autoCenter: true },
      { type: 'circle-circle-intersection', id: 'A', circle1: 'circle-O', circle2: 'circle-P', branch: 0 },
      { type: 'circle-circle-intersection', id: 'B', circle1: 'circle-O', circle2: 'circle-P', branch: 1 },
      { type: 'point-on-circle', id: 'D', circle: 'circle-P' },
      { type: 'point-on-circle', id: 'E', circle: 'circle-O' },
      ...r.commands,
    ]);
    collinearNonDegenerate(positions, 'D', 'B', 'E');
    const t = tBetween(at(positions, 'D'), at(positions, 'B'), at(positions, 'E'));
    expect(t, 'B is between D and E (order D-B-E)').toBeGreaterThan(0.02);
    expect(t, 'B is between D and E (order D-B-E)').toBeLessThan(0.98);
    expect(dist(at(positions, 'O'), at(positions, 'E'))).toBeCloseTo(5, 4); // E on circle O
  });
});

describe('engine — collinearity as a pure check (over-constraint)', () => {
  it('three FIXED collinear points pass (residual 0, nothing to drive)', () => {
    const { positions } = build([
      { type: 'free-point', id: 'A', x: 0, y: 0 },
      { type: 'free-point', id: 'B', x: 4, y: 0 },
      { type: 'free-point', id: 'C', x: 2, y: 0 },
      { type: 'set-collinear', a: 'A', b: 'B', c: 'C' },
    ]);
    collinearNonDegenerate(positions, 'A', 'B', 'C');
  });

  it('three FIXED non-collinear points are rejected (kept-prior over-constraint)', () => {
    expect(() =>
      build([
        { type: 'free-point', id: 'A', x: 0, y: 0 },
        { type: 'free-point', id: 'B', x: 4, y: 0 },
        { type: 'free-point', id: 'C', x: 0, y: 3 },
        { type: 'set-collinear', a: 'A', b: 'B', c: 'C' },
      ]),
    ).toThrow();
  });
});
