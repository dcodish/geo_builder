/**
 * Ladder-contract integrity test (docs/LADDER.md, slice S0.2 of docs/24).
 *
 * Locks WHICH stage of the cross-layer solve ladder accepts/refuses canonical figures, via the
 * `StepResult.ladder` trace. This is the observable contract S1.1 (ladder unification) is verified
 * against: a refactor that preserves behavior must keep these traces; a mechanism inserted at the
 * wrong stage shows up here as a changed accept token, not as distant scenario flakiness.
 */
import { describe, expect, it } from 'vitest';
import { applyStep, emptyConstruction } from '../step';
import type { Command, Constraint, Construction, Vec } from '../types';
import { evaluate } from '../evaluate';
import { allConstraints, freeDofCount, movableIds } from '../sample';
import { impliedByFigure } from '../dofRank';
import { declaredRingsHold } from '../verify';

const run = (cmds: Command[], from: Construction = emptyConstruction()) => {
  let cur = from;
  let last: ReturnType<typeof applyStep> | null = null;
  for (const cmd of cmds) {
    last = applyStep(cur, cmd);
    cur = last.construction;
  }
  return last!;
};

describe('ladder contract (docs/LADDER.md)', () => {
  it('a plain shape from empty accepts at main:primary', () => {
    const r = run([{ type: 'square', ids: ['A', 'B', 'C', 'D'] }]);
    expect(r.ok).toBe(true);
    expect(r.ladder).toEqual(['main:primary']);
  });

  it('#1600 (ADR-593): a shape on an existing edge beside off-edge geometry records its side choice at 2c', () => {
    const r = run([
      { type: 'square', ids: ['A', 'B', 'C', 'D'] },
      { type: 'triangle', ids: ['A', 'B', 'E'] },
    ]);
    expect(r.ok).toBe(true);
    expect(r.ladder).toContain('main:side-choice');
    expect(r.construction.sideChoices).toEqual([{ type: 'triangle', ids: ['A', 'B', 'E'], toward: false }]);
    // the record rides forward on a later accept, and `edgeSide: 'toward'` takes the other clean side
    const later = applyStep(r.construction, { type: 'segment', a: 'C', b: 'E' });
    expect(later.construction.sideChoices).toEqual(r.construction.sideChoices);
    const toward = run([
      { type: 'square', ids: ['A', 'B', 'C', 'D'] },
      { type: 'triangle', ids: ['A', 'B', 'E'], edgeSide: 'toward' } as Command,
    ]);
    expect(toward.construction.sideChoices?.[0].toward).toBe(true);
    expect(toward.ladder?.[0], 'the default is the mirror (away); toward keeps the primary').not.toBe(r.ladder?.[0]);
  });

  it('a structurally degenerate constraint refuses at the pre-gate', () => {
    const r = run([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'set-parallel', a: 'B', b: 'B', c: 'A', d: 'C' },
    ]);
    expect(r.ok).toBe(false);
    expect(r.ladder).toEqual(['pre:degenerate']);
  });

  // #1931 (ADR-640), stage 0j: a NEW crossing of a line the givens hold tangent («AP ⊥ OA», A on the circle) is
  // refused on the prior figure, before any solve — in both spellings of the crossing.
  const tangentAtA: Command[] = [
    { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true },
    { type: 'point-on-circle', id: 'A', circle: 'circle-O' },
    { type: 'free-point', id: 'P', x: 3, y: 2, free: true, ifAbsent: true },
    { type: 'set-perpendicular', a: 'A', b: 'P', c: 'O', d: 'A' },
  ] as Command[];
  it('#1931 (ADR-640): a crossing asked of a tangent refuses at pre:tangent-crossing (0j)', () => {
    const r = run([
      ...tangentAtA,
      { type: 'line-through', id: 'chord-AP', a: 'A', b: 'P' },
      { type: 'line-circle-intersection', id: 'E', line: 'chord-AP', circle: 'circle-O', avoid: 'A', order: ['A', 'E', 'P'] },
    ] as Command[]);
    expect(r.ok).toBe(false);
    expect(r.ladder).toEqual(['pre:tangent-crossing']);
    if (!r.ok) expect(r.error).toMatch(/^cannot place E: line chord-AP is tangent to circle circle-O at A/);
    // the carrier spelling: E on the line first, then on the circle
    const c = run([...tangentAtA, { type: 'free-point', id: 'E', x: 3, y: 2, free: true, ifAbsent: true } as Command, { type: 'set-collinear', a: 'E', b: 'A', c: 'P' } as Command, { type: 'point-on-circle', id: 'E', circle: 'circle-O' } as Command]);
    expect(c.ok).toBe(false);
    expect(c.ladder).toEqual(['pre:tangent-crossing']);
  });

  it('#1931 (ADR-640): the tangency stated AFTER the crossing refuses at main:refuse with the tangent reason (2i)', () => {
    const r = run([
      ...tangentAtA.slice(0, 3),
      { type: 'line-through', id: 'chord-AP', a: 'A', b: 'P' },
      { type: 'line-circle-intersection', id: 'E', line: 'chord-AP', circle: 'circle-O', avoid: 'A' },
      tangentAtA[3],
    ] as Command[]);
    expect(r.ok).toBe(false);
    expect(r.ladder?.[r.ladder.length - 1]).toBe('main:refuse');
    if (!r.ok) {
      expect(r.error).toMatch(/is tangent to circle circle-O at A/);
      expect(r.degenerate, 'a contradiction, never a pending row').toBe(true);
    }
  });

  // #2080 / #2083 (ADR-645), stage 0j's circle–circle member: two circles with ONE common point (stated tangent, or
  // tangent by their stated lengths) have no second crossing — refused on the prior figure, before any solve.
  const pair: Command[] = [
    { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true },
    { type: 'circle', id: 'circle-P', center: 'P', radius: 3.6, freeRadius: true, apart: true },
  ] as Command[];
  const crossings: Command[] = [
    { type: 'circle-circle-intersection', id: 'X', circle1: 'circle-O', circle2: 'circle-P', branch: 0 },
    { type: 'circle-circle-intersection', id: 'Y', circle1: 'circle-O', circle2: 'circle-P', branch: 1, avoid: 'X' },
  ] as Command[];
  const tangency = { type: 'circles-tangent', circle1: 'circle-O', circle2: 'circle-P', at: 'M', external: true } as Command;
  it('#2080 (ADR-645): a second crossing of two circles stated tangent refuses at pre:tangent-crossing (0j), both orders', () => {
    const r = run([...pair, tangency, ...crossings]);
    expect(r.ok).toBe(false);
    expect(r.ladder).toEqual(['pre:tangent-crossing']);
    if (!r.ok) {
      expect(r.error).toBe('over-constrained: X coincides with Y cannot hold');
      expect(r.degenerate).toBe(true);
    }
    const other = run([...pair, ...crossings, tangency]);
    expect(other.ok).toBe(false);
    expect(other.ladder).toEqual(['pre:tangent-crossing']);
  });

  it('#2083 (ADR-645): tangent by stated lengths — the crossing after «OP = 5» refuses at 0j; «OP = 5» after it at main:refuse', () => {
    const sized: Command[] = [
      { type: 'circle', id: 'circle-O', center: 'O', radius: 3 },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 2, apart: true },
    ] as Command[];
    const op = { type: 'set-distance', a: 'O', b: 'P', value: 5 } as Command;
    const r = run([...sized, op, ...crossings]);
    expect(r.ok).toBe(false);
    expect(r.ladder).toEqual(['pre:tangent-crossing']);
    const other = run([...sized, ...crossings, op]);
    expect(other.ok).toBe(false);
    expect(other.ladder?.[other.ladder.length - 1]).toBe('main:refuse');
    if (!other.ok) {
      expect(other.error).toBe('over-constrained: X coincides with Y cannot hold');
      expect(other.degenerate, 'a contradiction, never a pending row').toBe(true);
    }
    // control: «OP = 4» crosses at two points
    expect(run([...sized, { ...op, value: 4 } as Command, ...crossings]).ok).toBe(true);
  });

  it('an M1 restatement of an existing on-segment point accepts on the m1 branch', () => {
    const r = run([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'point-on-segment', id: 'D', a: 'B', b: 'C', t: 0.3 },
      { type: 'midpoint', id: 'D', a: 'B', b: 'C' }, // D exists → constraint, not redefinition
    ]);
    expect(r.ok).toBe(true);
    expect(r.ladder?.[0]).toBe('m1:constraint');
    expect(r.ladder?.[r.ladder.length - 1]).toMatch(/^m1:(primary|settle|recruit)$/);
  });

  it('a constraint the eager carrier pick cannot satisfy accepts via the recruiter (ADR-103 figure; the S3.2 component tier sits BEHIND the rungs — stability measurement 2026-07-25)', () => {
    const r = run([
      { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true, autoCenter: true },
      { type: 'circle', id: 'circle-P', center: 'P', radius: 3.6, freeRadius: true, autoCenter: true },
      { type: 'circle-circle-intersection', id: 'A', circle1: 'circle-O', circle2: 'circle-P', branch: 0 },
      { type: 'circle-circle-intersection', id: 'B', circle1: 'circle-O', circle2: 'circle-P', branch: 1, avoid: 'A' },
      { type: 'point-on-circle', id: 'C', circle: 'circle-P' },
      { type: 'extend-onto-circle', id: 'D', a: 'C', b: 'A', circle: 'circle-O' },
      { type: 'set-distance', a: 'C', b: 'D', value: 36 }, // radii alone cap |CD| ≈ 8 → must recruit the centres
    ] as Command[]);
    expect(r.ok).toBe(true);
    expect(r.ladder?.[r.ladder.length - 1]).toBe('main:recruit');
    expect(r.ladder?.some((t) => t.startsWith('recruit:'))).toBe(true);
  });

  it('a genuine redefinition refuses at m1:conflict-refuse', () => {
    const r = run([
      { type: 'square', ids: ['A', 'B', 'C', 'D'] },
      { type: 'free-point', id: 'C', x: 1, y: 1 },
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already defined/i);
    expect(r.ladder).toEqual(['m1:conflict-refuse']);
  });

  // Deliberately UPDATED by ADR-413 (#408): mid(AB) = mid(AC) forces B ≡ C — but B and C are the
  // DECLARED triangle's own vertices, so the "allowed with a notice" lane (ADR-123 — justified there
  // because the merged point, the kite's N≡O centre, was never user-defined) would leave a "triangle"
  // that is a segment on screen. A forced coincidence that FLATTENS a declared polygon now refuses
  // honestly via the collapse accept gate; point-level forced coincidences that keep every declared
  // shape real are untouched (locked by scenario `area-ratio-converges-points-allowed`).
  it('a restatement whose forced coincidence would FLATTEN the declared triangle is refused (ADR-413 narrows ADR-123)', () => {
    const r = run([
      { type: 'triangle', ids: ['A', 'B', 'C'] },
      { type: 'midpoint', id: 'M', a: 'A', b: 'B' },
      { type: 'midpoint', id: 'M', a: 'A', b: 'C' }, // mid(AB)=mid(AC) ⇔ B≡C ⇔ triangle ABC collapses
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/over-constrained|cannot hold|same point/);
  });

  it('a contradicted absolute given walks the main failure ladder and refuses with blame', () => {
    const r = run([
      { type: 'square', ids: ['A', 'B', 'C', 'D'] },
      { type: 'set-distance', a: 'A', b: 'B', value: 5 },
      { type: 'set-distance', a: 'A', b: 'B', value: 7 }, // contradicts the stated 5
    ]);
    expect(r.ok).toBe(false);
    expect(r.ladder?.[r.ladder.length - 1]).toBe('main:refuse');
  });

  it('every applyStep result carries a ladder trace', () => {
    const ok = run([{ type: 'triangle', ids: ['A', 'B', 'C'] }]);
    expect(ok.ladder).toBeDefined();
    expect(ok.ladder!.length).toBeGreaterThan(0);
  });
});

/**
 * #2795 ([ADR-821](../../../docs/06-decisions.md#adr-821)) — stage 2i′'s `implied:release` (ADR-623), its three holes
 * closed. A restated row the figure is already forced to satisfy gives its carrier back, so nothing moves and no
 * freedom leaves `freeDofs`.
 */
describe('#2795 — the re-stated given yields (stage 2i′, implied:release)', () => {
  const settle = (cmds: Command[]) => {
    let cur = emptyConstruction();
    for (const cmd of cmds) {
      const r = applyStep(cur, cmd);
      expect(r.ok, JSON.stringify(cmd)).toBe(true);
      cur = r.construction;
    }
    return cur;
  };
  const maxMove = (a: Map<string, Vec>, b: Map<string, Vec>) => Math.max(0, ...[...a].map(([id, p]) => (b.get(id) ? Math.hypot(p.x - b.get(id)!.x, p.y - b.get(id)!.y) : 0)));
  const restate = (prefix: Command[], line: Command[]) => {
    const prev = settle(prefix);
    let cur = prev;
    let ladder: string[] = [];
    for (const cmd of line) {
      const r = applyStep(cur, cmd);
      expect(r.ok, JSON.stringify(cmd)).toBe(true);
      ladder = [...ladder, ...(r.ladder ?? [])];
      cur = r.construction;
    }
    const a = evaluate(prev), b = evaluate(cur);
    expect(a.ok && b.ok).toBe(true);
    return { ladder, move: a.ok && b.ok ? maxMove(a.positions, b.positions) : Infinity, dof: [freeDofCount(prev), freeDofCount(cur)] };
  };
  const tri: Command = { type: 'triangle', ids: ['A', 'B', 'C'] };
  const abEqAc: Command = { type: 'set-equal', a: 'A', b: 'B', c: 'A', d: 'C' };

  it('H1 — impliedByFigure counts a structurally equal prior row as evidence (an exact repeat)', () => {
    const c = settle([tri, abEqAc]);
    const prior: Constraint[] = [...allConstraints(c)];
    const k = prior.find((y) => y.type === 'equal');
    expect(k, 'the figure holds its AB = AC row').toBeDefined();
    expect(impliedByFigure(c, movableIds(c), prior, { ...k! }), 'a structural copy of the prior row is forced by it').toBe(true);
  });

  it('H1 — «AB = AC» typed twice releases its carrier and moves nothing', () => {
    const r = restate([tri, abEqAc], [abEqAc]);
    expect(r.move).toBeLessThan(1e-9);
    expect(r.dof[1]).toBe(r.dof[0]);
  });

  it('H2 — a reversed rider («D על BA» after «D על AB») releases its order row and moves nothing', () => {
    const r = restate([tri, { type: 'segment', a: 'A', b: 'B' }, { type: 'point-on-segment', id: 'D', a: 'A', b: 'B' }], [{ type: 'segment', a: 'B', b: 'A' }, { type: 'point-on-segment', id: 'D', a: 'B', b: 'A' }]);
    expect(r.move).toBeLessThan(1e-9);
    expect(r.dof[1]).toBe(r.dof[0]);
  });

  it('H3 — the isosceles trapezoid\'s equal diagonals release (a parallelogram seed does not count) and move nothing', () => {
    const trap: Command[] = [{ type: 'trapezoid', ids: ['A', 'B', 'C', 'D'], kind: 'isosceles-trapezoid' }, { type: 'set-equal', a: 'A', b: 'D', c: 'B', d: 'C', trapezoidLegs: true }];
    const r = restate(trap, [{ type: 'segment', a: 'A', b: 'C' }, { type: 'segment', a: 'B', b: 'D' }, { type: 'set-equal', a: 'A', b: 'C', c: 'B', d: 'D' }]);
    expect(r.ladder).toContain('implied:release');
    expect(r.move).toBeLessThan(1e-9);
    expect(r.dof[1]).toBe(r.dof[0]);
  });

  it('declaredRingsHold reads the trapezoid identity rule of checkGivens', () => {
    const c = settle([{ type: 'trapezoid', ids: ['A', 'B', 'C', 'D'], kind: 'isosceles-trapezoid' }]);
    const para = new Map<string, Vec>([['A', { x: 0, y: 0 }], ['B', { x: 4, y: 0 }], ['C', { x: 5, y: 2 }], ['D', { x: 1, y: 2 }]]);
    const trap = new Map<string, Vec>([['A', { x: 0, y: 0 }], ['B', { x: 4, y: 0 }], ['C', { x: 3, y: 2 }], ['D', { x: 1, y: 2 }]]);
    expect(declaredRingsHold(c, para)).toBe(false);
    expect(declaredRingsHold(c, trap)).toBe(true);
  });

  it('the ADR-623 false-freeze net: a NEW given still drives (a free triangle\'s «AB = AC», a rectangle\'s «∠ABD = 30»)', () => {
    const iso = restate([tri], [abEqAc]);
    expect(iso.ladder).not.toContain('implied:release');
    expect(iso.dof[1]).toBe(iso.dof[0] - 1);
    const rect = restate([{ type: 'rectangle', ids: ['A', 'B', 'C', 'D'] } as Command], [{ type: 'set-angle', vertex: 'B', ray1: 'A', ray2: 'D', value: 30 }]);
    expect(rect.ladder).not.toContain('implied:release');
    expect(rect.dof[1]).toBe(rect.dof[0] - 1);
  });
});
