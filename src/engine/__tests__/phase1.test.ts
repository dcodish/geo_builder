/**
 * Phase-1 acceptance gate (docs/08-testing-strategy.md §Step 1).
 * Fixtures F1 (build + stability), F2 (alternatives), F3 (over-constraint),
 * plus determinism and idempotency. No parser/UI — hardcoded commands only.
 */

import { describe, it, expect } from 'vitest';
import type { Command, Id, Vec } from '../types';
import { LEN_EPS } from '../types';
import { applyCommand } from '../apply';
import { evaluate } from '../evaluate';
import { applyStep, build, branchCount, commandConflict, cycleAlternative, maxDelta, emptyConstruction } from '../step';
import { angleDeg, cross, dist } from '../geometry';

/** Evaluate or throw — convenience for assertions. */
function ev(c: Parameters<typeof evaluate>[0]): Map<Id, Vec> {
  const e = evaluate(c);
  if (!e.ok) throw new Error(e.error);
  return e.positions;
}

const SQUARE: Command = { type: 'square', ids: ['A', 'B', 'C', 'D'] };

describe('F1 — build a square + point on a side (stability)', () => {
  it('builds a geometrically valid square', () => {
    const r = applyStep(emptyConstruction(), SQUARE);
    expect(r.ok).toBe(true);
    const p = r.positions;
    const A = p.get('A')!, B = p.get('B')!, C = p.get('C')!, D = p.get('D')!;

    const ab = dist(A, B), bc = dist(B, C), cd = dist(C, D), da = dist(D, A);
    expect(bc).toBeCloseTo(ab, 9);
    expect(cd).toBeCloseTo(ab, 9);
    expect(da).toBeCloseTo(ab, 9);
    // equal diagonals + a right angle ⇒ square
    expect(dist(A, C)).toBeCloseTo(dist(B, D), 9);
    expect(angleDeg(A, D, B)).toBeCloseTo(90, 6);
  });

  it('places G on AD and leaves the square unchanged (stability)', () => {
    const r1 = applyStep(emptyConstruction(), SQUARE);
    const r2 = applyStep(r1.construction, { type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.4 });
    expect(r2.ok).toBe(true);

    const A = r2.positions.get('A')!, D = r2.positions.get('D')!, G = r2.positions.get('G')!;
    expect(cross(A, D, G)).toBeCloseTo(0, 9); // G collinear with A,D
    // G strictly between A and D
    expect(dist(A, G)).toBeGreaterThan(0);
    expect(dist(G, D)).toBeGreaterThan(0);
    expect(dist(A, G) + dist(G, D)).toBeCloseTo(dist(A, D), 9);

    // existing points did not move
    expect(maxDelta(r1.positions, r2.positions, ['A', 'B', 'C', 'D'])).toBeLessThan(LEN_EPS);
  });
});

describe('F2 — a two-configuration construction (alternatives)', () => {
  const base: Command[] = [
    { type: 'free-point', id: 'A', x: 0, y: 0 },
    { type: 'free-point', id: 'B', x: 6, y: 0 },
    { type: 'point-by-distances', id: 'C', from1: 'A', dist1: 5, from2: 'B', dist2: 5, branch: 0 },
  ];

  it('enumerates exactly two valid branches and cycles between them', () => {
    const { construction, positions } = build(base);
    expect(branchCount(construction, 'C')).toBe(2);

    const A = positions.get('A')!, B = positions.get('B')!;
    const C0 = positions.get('C')!;
    expect(C0.y).toBeGreaterThan(0); // branch 0 = above AB
    expect(dist(A, C0)).toBeCloseTo(5, 9);
    expect(dist(B, C0)).toBeCloseTo(5, 9);

    const flipped = cycleAlternative(construction, 'C');
    const p1 = ev(flipped);
    const C1 = p1.get('C')!;
    expect(C1.y).toBeLessThan(0); // branch 1 = below AB
    expect(dist(A, C1)).toBeCloseTo(5, 9); // still valid
    expect(dist(B, C1)).toBeCloseTo(5, 9);

    // unrelated points stay put
    expect(maxDelta(positions, p1, ['A', 'B'])).toBeLessThan(LEN_EPS);

    // cycling again returns to branch 0
    const back = ev(cycleAlternative(flipped, 'C')).get('C')!;
    expect(dist(back, C0)).toBeLessThan(LEN_EPS);
  });
});

describe('F3 — contradiction is rejected and the prior figure is kept (over-constraint)', () => {
  it('rejects an impossible angle and preserves the square', () => {
    const base = build([SQUARE, { type: 'point-on-segment', id: 'G', a: 'A', b: 'D' }]);

    // G is on AD, so ∠GAB is the square's corner = 90°; setting it to 37° is impossible.
    const r = applyStep(base.construction, { type: 'set-angle', vertex: 'A', ray1: 'G', ray2: 'B', value: 37 });

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/over-constrained/i);

    // prior construction kept (same reference) and still a valid square
    expect(r.construction).toBe(base.construction);
    const p = ev(r.construction);
    expect(dist(p.get('A')!, p.get('B')!)).toBeCloseTo(dist(p.get('B')!, p.get('C')!), 9);
    expect(p.has('G')).toBe(true);
  });
});

describe('determinism', () => {
  it('identical command sequences yield identical coordinates', () => {
    const seq: Command[] = [SQUARE, { type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.4 }];
    const a = build(seq).positions;
    const b = build(seq).positions;
    for (const id of ['A', 'B', 'C', 'D', 'G']) {
      expect(a.get(id)).toEqual(b.get(id));
    }
  });
});

describe('idempotency (FR-EN-9)', () => {
  it('re-issuing a command adds no duplicate objects', () => {
    const once = applyCommand(emptyConstruction(), SQUARE);
    const twice = applyCommand(once, SQUARE);
    expect(twice.objects.length).toBe(once.objects.length);
  });

  it('re-issuing the identical command through the pipeline is an accepted no-op', () => {
    const r1 = applyStep(emptyConstruction(), SQUARE);
    const r2 = applyStep(r1.construction, SQUARE);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.construction.objects.length).toBe(r1.construction.objects.length);
  });
});

describe('redefinition conflict — an id cannot be redefined as something different', () => {
  it('rejects re-declaring an existing point with a different definition (keeps prior)', () => {
    // Square defines C as a derived corner; trying to make C "5 from A and 5 from B"
    // (and B at a different position) is a contradiction, not a silent no-op.
    const base = build([SQUARE]);
    const r = applyStep(base.construction, {
      type: 'point-by-distances',
      id: 'C',
      from1: 'A',
      dist1: 5,
      from2: 'B',
      dist2: 5,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/already defined/i);
      expect(r.construction).toBe(base.construction); // prior figure preserved
    }
    // Turning a derived point (C) into a free one is still a conflict…
    expect(commandConflict(base.construction, { type: 'free-point', id: 'C', x: 1, y: 1 })).toMatch(/already defined/i);
    // …but re-placing the free point B is a move, not a conflict (ADR-011).
    expect(commandConflict(base.construction, { type: 'free-point', id: 'B', x: 6, y: 0 })).toBeNull();
  });

  it('repositions a free point instead of conflicting (a move, ADR-011)', () => {
    // The square defines B as a free point at (5,0); re-placing it at (6,0) moves
    // it and the square resizes (C, D are derived from A, B) — still valid.
    const base = build([SQUARE]);
    const r = applyStep(base.construction, { type: 'free-point', id: 'B', x: 6, y: 0 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.positions.get('B')).toEqual({ x: 6, y: 0 });
      // still a square: equal sides, right angle
      const A = r.positions.get('A')!, B = r.positions.get('B')!, C = r.positions.get('C')!;
      expect(dist(B, C)).toBeCloseTo(dist(A, B), 9);
      expect(angleDeg(A, B, C)).toBeCloseTo(45, 6); // ∠BAC = half the right angle ⇒ square diagonal
    }
  });

  it('still refuses to turn a derived point into a free one', () => {
    const base = build([SQUARE]); // C is derived (square corner)
    const r = applyStep(base.construction, { type: 'free-point', id: 'C', x: 1, y: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/already defined/i);
  });

  it('allows a command that only adds new objects, and a re-issue of the same definition', () => {
    const base = build([SQUARE]);
    // G on AD is new → no conflict.
    expect(commandConflict(base.construction, { type: 'point-on-segment', id: 'G', a: 'A', b: 'D', t: 0.4 })).toBeNull();
    // The same square again → every produced object matches → no conflict.
    expect(commandConflict(base.construction, SQUARE)).toBeNull();
  });
});
