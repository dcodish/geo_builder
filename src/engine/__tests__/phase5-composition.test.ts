/**
 * Shape composition (ADR-013): a shape built *on existing points* must be a
 * valid, non-degenerate instance of itself — not just when built standalone.
 *
 * This is the gap that let the "parallelogram on an existing edge collapses to a
 * line" bug ship: the older shape tests only ever built shapes from an empty
 * construction, and the shapes they checked by coordinates (square/rectangle/
 * rhombus) derive their non-base vertices from the base edge, so they cannot go
 * degenerate. The shapes with a *free* third/fourth vertex (parallelogram,
 * quadrilateral, trapezoid, triangle) kept absolute defaults for those vertices
 * and collapsed when the base edge was reused — never exercised.
 *
 * Every assertion here is purely on (x,y): each shape's defining property is
 * checked from the computed positions, standalone and composed, including the
 * exact screenshot repro (triangle then parallelogram on its base).
 */

import { describe, it, expect } from 'vitest';
import type { Command, GeoObject, Id, Vec } from '../types';
import { isGeoPoint } from '../types';
import { applyStep, build } from '../step';
import { evaluate } from '../evaluate';

// --- pure (x,y) predicates -------------------------------------------------

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (u: Vec, v: Vec): number => u.x * v.y - u.y * v.x;
const dot = (u: Vec, v: Vec): number => u.x * v.x + u.y * v.y;
const len = (v: Vec): number => Math.hypot(v.x, v.y);

/** Area of a polygon (shoelace); 0 ⇒ degenerate (collinear / collapsed). */
const area = (...pts: Vec[]): number => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
};

const parallel = (u: Vec, v: Vec): boolean => Math.abs(cross(u, v)) < 1e-7;

/** Quad PQRS (in vertex order): the two opposite-side vectors PQ and SR are equal, and area > 0. */
const isParallelogram = (P: Vec, Q: Vec, R: Vec, S: Vec): boolean => {
  const PQ = sub(Q, P);
  const RS = sub(S, R); // traversal: P→Q→R→S→P, so PQ + RS = 0 for a parallelogram
  return Math.abs(PQ.x + RS.x) < 1e-7 && Math.abs(PQ.y + RS.y) < 1e-7 && area(P, Q, R, S) > 1e-6;
};

const isRhombus = (P: Vec, Q: Vec, R: Vec, S: Vec): boolean =>
  isParallelogram(P, Q, R, S) && Math.abs(len(sub(Q, P)) - len(sub(R, Q))) < 1e-7;

const isRectangle = (P: Vec, Q: Vec, R: Vec, S: Vec): boolean =>
  isParallelogram(P, Q, R, S) && Math.abs(dot(sub(Q, P), sub(R, Q))) < 1e-7; // consecutive sides ⟂

const isSquare = (P: Vec, Q: Vec, R: Vec, S: Vec): boolean => isRhombus(P, Q, R, S) && isRectangle(P, Q, R, S);

/** Exactly one pair of opposite sides parallel (a proper trapezoid, not a parallelogram). */
const isProperTrapezoid = (P: Vec, Q: Vec, R: Vec, S: Vec): boolean => {
  const pairA = parallel(sub(Q, P), sub(S, R)); // PQ ∥ RS
  const pairB = parallel(sub(R, Q), sub(P, S)); // QR ∥ SP
  return pairA !== pairB && area(P, Q, R, S) > 1e-6;
};

const isNonDegenerateTriangle = (A: Vec, B: Vec, C: Vec): boolean => area(A, B, C) > 1e-6;

/** Build a sequence and pluck the named points' positions. */
function at(cmds: Command[], ids: Id[]): Vec[] {
  const { positions } = build(cmds);
  return ids.map((id) => {
    const p = positions.get(id);
    if (!p) throw new Error(`no position for ${id}`);
    return p;
  });
}

const TRIANGLE: Command = { type: 'triangle', ids: ['A', 'B', 'C'] };

// --- the screenshot repro --------------------------------------------------

describe('regression — parallelogram on an existing edge is not degenerate (the reported bug)', () => {
  it('triangle ABC then parallelogram ABDF: ABDF is a real parallelogram, not collinear', () => {
    const [A, B, D, F] = at([TRIANGLE, { type: 'parallelogram', ids: ['A', 'B', 'D', 'F'] }], ['A', 'B', 'D', 'F']);
    expect(area(A, B, D, F)).toBeGreaterThan(1e-6); // the bug made this 0
    expect(isParallelogram(A, B, D, F)).toBe(true);
  });

  it('reuses the triangle\'s actual A and B (shares the edge), and leaves A,B,C put', () => {
    const before = at([TRIANGLE], ['A', 'B', 'C']);
    const after = at([TRIANGLE, { type: 'parallelogram', ids: ['A', 'B', 'D', 'F'] }], ['A', 'B', 'C']);
    after.forEach((p, i) => {
      expect(p.x).toBeCloseTo(before[i].x, 9);
      expect(p.y).toBeCloseTo(before[i].y, 9);
    });
  });
});

// --- every shape: standalone AND built on an existing edge -----------------

describe('shape composition — each shape is valid standalone and on an existing edge', () => {
  it('parallelogram', () => {
    const solo = at([{ type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] }], ['A', 'B', 'C', 'D']);
    expect(isParallelogram(solo[0], solo[1], solo[2], solo[3])).toBe(true);
    const comp = at([TRIANGLE, { type: 'parallelogram', ids: ['A', 'B', 'E', 'F'] }], ['A', 'B', 'E', 'F']);
    expect(isParallelogram(comp[0], comp[1], comp[2], comp[3])).toBe(true);
  });

  it('rhombus', () => {
    const solo = at([{ type: 'rhombus', ids: ['A', 'B', 'C', 'D'] }], ['A', 'B', 'C', 'D']);
    expect(isRhombus(solo[0], solo[1], solo[2], solo[3])).toBe(true);
    const comp = at([TRIANGLE, { type: 'rhombus', ids: ['A', 'B', 'E', 'F'] }], ['A', 'B', 'E', 'F']);
    expect(isRhombus(comp[0], comp[1], comp[2], comp[3])).toBe(true);
  });

  it('rectangle', () => {
    const solo = at([{ type: 'rectangle', ids: ['A', 'B', 'C', 'D'] }], ['A', 'B', 'C', 'D']);
    expect(isRectangle(solo[0], solo[1], solo[2], solo[3])).toBe(true);
    const comp = at([TRIANGLE, { type: 'rectangle', ids: ['A', 'B', 'E', 'F'] }], ['A', 'B', 'E', 'F']);
    expect(isRectangle(comp[0], comp[1], comp[2], comp[3])).toBe(true);
  });

  it('square', () => {
    const solo = at([{ type: 'square', ids: ['A', 'B', 'C', 'D'] }], ['A', 'B', 'C', 'D']);
    expect(isSquare(solo[0], solo[1], solo[2], solo[3])).toBe(true);
    const comp = at([TRIANGLE, { type: 'square', ids: ['A', 'B', 'E', 'F'] }], ['A', 'B', 'E', 'F']);
    expect(isSquare(comp[0], comp[1], comp[2], comp[3])).toBe(true);
  });

  it('trapezoid', () => {
    const solo = at([{ type: 'trapezoid', ids: ['A', 'B', 'C', 'D'] }], ['A', 'B', 'C', 'D']);
    expect(isProperTrapezoid(solo[0], solo[1], solo[2], solo[3])).toBe(true);
    const comp = at([TRIANGLE, { type: 'trapezoid', ids: ['A', 'B', 'E', 'F'] }], ['A', 'B', 'E', 'F']);
    expect(isProperTrapezoid(comp[0], comp[1], comp[2], comp[3])).toBe(true);
  });

  it('quadrilateral', () => {
    const solo = at([{ type: 'quadrilateral', ids: ['A', 'B', 'C', 'D'] }], ['A', 'B', 'C', 'D']);
    expect(area(solo[0], solo[1], solo[2], solo[3])).toBeGreaterThan(1e-6);
    const comp = at([TRIANGLE, { type: 'quadrilateral', ids: ['A', 'B', 'E', 'F'] }], ['A', 'B', 'E', 'F']);
    expect(area(comp[0], comp[1], comp[2], comp[3])).toBeGreaterThan(1e-6);
  });

  it('triangle on an existing edge', () => {
    const [A, B, D] = at([TRIANGLE, { type: 'triangle', ids: ['A', 'B', 'D'] }], ['A', 'B', 'D']);
    expect(isNonDegenerateTriangle(A, B, D)).toBe(true);
  });
});

// --- attaching on an existing edge regardless of where it sits in the name --

describe('shape composition — the shared edge need not be named first (ADR-013 amendment)', () => {
  // Reproduces the reported failure: a trapezoid, then a square on its side DC
  // named "RTCD" — the shared vertices C,D land on the square's *derived* slots,
  // which used to be rejected ("C is already defined"). The vertices rotate so
  // the existing edge becomes the base.
  const TRAP: Command = { type: 'trapezoid', ids: ['A', 'B', 'C', 'D'] };

  it('square RTCD builds on the trapezoid edge C–D instead of being rejected', () => {
    const r = applyStep(build([TRAP]).construction, { type: 'square', ids: ['R', 'T', 'C', 'D'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const e = evaluate(r.construction);
    expect(e.ok).toBe(true);
    if (!e.ok) return;
    const [C, D, R, T] = ['C', 'D', 'R', 'T'].map((id) => e.positions.get(id)!);
    // C,D are the trapezoid's vertices, reused; R,T are the square's new corners
    expect(isSquare(C, D, R, T) || isSquare(D, C, T, R) || isSquare(R, T, C, D)).toBe(true);
    // the shared edge is one segment, not duplicated
    expect(r.construction.objects.filter((o) => o.id === 'seg-CD')).toHaveLength(1);
  });

  it('reuses the trapezoid C,D (does not move them) and adds exactly R,T', () => {
    const before = at([TRAP], ['C', 'D']);
    const after = build([TRAP, { type: 'square', ids: ['R', 'T', 'C', 'D'] }]);
    const pos = after.positions;
    expect(pos.get('C')).toEqual(before[0]);
    expect(pos.get('D')).toEqual(before[1]);
    expect(pointIds(after.construction.objects)).toEqual(new Set(['A', 'B', 'C', 'D', 'R', 'T']));
  });

  it('order-independent: naming the shared edge first (CDRT) gives the same square', () => {
    const last = build([TRAP, { type: 'square', ids: ['R', 'T', 'C', 'D'] }]).positions;
    const first = build([TRAP, { type: 'square', ids: ['C', 'D', 'R', 'T'] }]).positions;
    for (const id of ['C', 'D', 'R', 'T']) {
      expect(last.get(id)).toEqual(first.get(id));
    }
  });

  it('still rejects when the two existing vertices are a diagonal (no edge to build on)', () => {
    // A square ABCD, then "square AXCY" reusing the diagonal pair A,C — no cyclic
    // rotation puts a *diagonal* on the adjacent base slots, so it stays a conflict.
    const sq = build([{ type: 'square', ids: ['A', 'B', 'C', 'D'] }]);
    const r = applyStep(sq.construction, { type: 'square', ids: ['A', 'X', 'C', 'Y'] });
    expect(r.ok).toBe(false);
  });
});

// --- the fit must handle a rotated / scaled base edge, not only horizontal --

describe('shape composition — the template is fitted (rotation + scale) to a non-axis-aligned edge', () => {
  it('parallelogram on a slanted, reused edge stays a parallelogram', () => {
    const cmds: Command[] = [
      { type: 'free-point', id: 'A', x: 1, y: 1 },
      { type: 'free-point', id: 'B', x: 4, y: 5 }, // AB is neither horizontal nor unit-length
      { type: 'parallelogram', ids: ['A', 'B', 'D', 'F'] },
    ];
    const [A, B, D, F] = at(cmds, ['A', 'B', 'D', 'F']);
    expect(isParallelogram(A, B, D, F)).toBe(true);
    // the parallelogram is built on exactly the given edge
    expect(A).toEqual({ x: 1, y: 1 });
    expect(B).toEqual({ x: 4, y: 5 });
  });
});

// --- sharing a single vertex (the 1-anchor, translation-only fit path) -------

describe('shape composition — sharing a single vertex', () => {
  it('a triangle sharing only one prior point is non-degenerate and pinned at that point', () => {
    const cmds: Command[] = [
      { type: 'free-point', id: 'A', x: 2, y: 3 },
      { type: 'triangle', ids: ['A', 'P', 'Q'] },
    ];
    const [A, P, Q] = at(cmds, ['A', 'P', 'Q']);
    expect(A).toEqual({ x: 2, y: 3 }); // the shared vertex is reused, not moved
    expect(isNonDegenerateTriangle(A, P, Q)).toBe(true);
  });
});

// --- building on a *derived* anchor: the fit must read evaluated positions ---

describe('shape composition — built on a derived vertex (ADR-013, evaluated-position fit)', () => {
  it('a parallelogram on the edge of a prior parallelogram (one endpoint derived) is valid', () => {
    // ABCD has D derived (= A + C − B). Build a parallelogram on edge D→C, whose
    // endpoint D is a *derived* point — its position only exists after evaluation,
    // so the fit must read it from the computed figure, not from stored coords.
    const cmds: Command[] = [
      { type: 'parallelogram', ids: ['A', 'B', 'C', 'D'] },
      { type: 'parallelogram', ids: ['D', 'C', 'E', 'F'] },
    ];
    const [D, C, E, F] = at(cmds, ['D', 'C', 'E', 'F']);
    expect(D).toEqual({ x: 1, y: 0 }); // the first parallelogram's derived vertex
    expect(isParallelogram(D, C, E, F)).toBe(true);
  });
});

// --- allocation: which points are created vs reused --------------------------

const pointIds = (objs: GeoObject[]): Set<Id> => new Set(objs.filter(isGeoPoint).map((o) => o.id));

describe('shape composition — allocation: new points created, existing points reused', () => {
  it('a parallelogram on a triangle edge adds only its new vertices and reuses A,B untouched', () => {
    const tri = build([TRIANGLE]).construction;
    const next = build([TRIANGLE, { type: 'parallelogram', ids: ['A', 'B', 'E', 'F'] }]).construction;

    // A,B,C (triangle) + E (new free), F (new derived) — and nothing else.
    expect(pointIds(next.objects)).toEqual(new Set(['A', 'B', 'C', 'E', 'F']));

    // the reused base corners keep their original triangle definitions (not re-created)
    for (const id of ['A', 'B']) {
      const before = tri.objects.find((o) => o.id === id);
      const after = next.objects.find((o) => o.id === id);
      expect(after).toEqual(before);
    }
    // E is allocated as a free point, F as the derived 4th vertex
    expect(next.objects.find((o) => o.id === 'E')!.kind).toBe('free-point');
    expect(next.objects.find((o) => o.id === 'F')!.kind).toBe('parallelogram-vertex');
  });

  it('re-issuing the same composed shape allocates nothing new (idempotent, FR-EN-9)', () => {
    const once = build([TRIANGLE, { type: 'parallelogram', ids: ['A', 'B', 'E', 'F'] }]).construction;
    const twice = applyStep(once, { type: 'parallelogram', ids: ['A', 'B', 'E', 'F'] });
    expect(twice.ok).toBe(true);
    if (twice.ok) expect(twice.construction.objects).toEqual(once.objects);
  });

  it('does not move earlier geometry when a shape is built on it (stability)', () => {
    const before = at([TRIANGLE], ['A', 'B', 'C']);
    const after = at([TRIANGLE, { type: 'square', ids: ['A', 'B', 'E', 'F'] }], ['A', 'B', 'C']);
    after.forEach((p, i) => {
      expect(p.x).toBeCloseTo(before[i].x, 9);
      expect(p.y).toBeCloseTo(before[i].y, 9);
    });
  });
});
