/**
 * Derived points over stated parents ([ADR-AG-009](../../docs/06c-decisions-analytic.md#adr-ag-009)
 * B4, issue #1028) — the constructs the «lines and points» corpus is mostly made of.
 *
 * **The expected values are an INDEPENDENT oracle, not this engine's own output.** Each was produced
 * by running the same exercise through the 2-D tool's `parse → replay` path while scoping the slice,
 * and checked by hand against the closed form. A test whose expectation came from the code it tests
 * proves only that the code is consistent with itself.
 */
import { describe, expect, it } from 'vitest';
import { fold } from '../engine/apply';
import { depsPrecedeDependents, dofCount, objectDeps } from '../engine/carriers';
import { derive } from '../engine/derive';
import { evaluate, isKnowledge } from '../engine/evaluate';
import { circumcentre, diagonalMeet, evalRule, incentre, orthocentre } from '../engine/derived';
import { parseLine } from '../parser/parseAnalytic';
import type { Fact } from '../engine/types';

const lines = (src: string[]): Fact[] =>
  src.flatMap((s) => {
    const r = parseLine(s);
    if (!r.ok) throw new Error(`${s}: ${r.code}`);
    return r.facts;
  });
const build = (src: string[]) => fold(lines(src)).construction;
const posOf = (src: string[], id: string) => {
  const p = evaluate(build(src), 0).points.find((q) => q.id === id);
  if (!p) throw new Error(`${id} not in the figure`);
  return p;
};

describe('the corpus exercises the operator is teaching', () => {
  it('image 1 #1 — the midpoint of a segment given its endpoints', () => {
    const m = posOf(['A(8,1)', 'B(-2,-5)', 'M אמצע AB'], 'M');
    expect(m.x).toBeCloseTo(3, 9);
    expect(m.y).toBeCloseTo(-2, 9);
  });

  it('image 2 #8 — the centroid of a triangle given three vertices', () => {
    const m = posOf(['A(1,3)', 'B(-4,1)', 'C(-3,8)', 'M מפגש התיכונים במשולש ABC'], 'M');
    expect(m.x).toBeCloseTo(-2, 9); // (1 − 4 − 3)/3
    expect(m.y).toBeCloseTo(4, 9); //  (3 + 1 + 8)/3
  });

  it('image 1 #5 — a parallelogram s diagonals meet at the midpoint of each', () => {
    const src = ['A(-2,1)', 'B(4,5)', 'C(5,2)', 'D(-1,-2)', 'G מפגש האלכסונים במרובע ABCD'];
    const g = posOf(src, 'G');
    expect(g.x).toBeCloseTo(1.5, 9);
    expect(g.y).toBeCloseTo(1.5, 9);
  });

  it('image 6 #16 — the incentre of a triangle given three vertices', () => {
    const o = posOf(['A(-1,-1)', 'B(7,3)', 'C(-4,5)', 'O מפגש חוצי הזוויות במשולש ABC'], 'O');
    expect(o.x).toBeCloseTo(0, 9);
    expect(o.y).toBeCloseTo(2, 9);
  });
});

describe('the closed forms, against properties rather than against themselves', () => {
  it('the incentre is equidistant from all three sides', () => {
    const a = { x: -1, y: -1 };
    const b = { x: 7, y: 3 };
    const c = { x: -4, y: 5 };
    const i = incentre(a, b, c)!;
    const distToLine = (p: { x: number; y: number }, u: typeof a, v: typeof a) =>
      Math.abs((v.x - u.x) * (u.y - p.y) - (u.x - p.x) * (v.y - u.y)) / Math.hypot(v.x - u.x, v.y - u.y);
    const d1 = distToLine(i, a, b);
    expect(distToLine(i, b, c)).toBeCloseTo(d1, 9);
    expect(distToLine(i, c, a)).toBeCloseTo(d1, 9);
  });

  it('the circumcentre is equidistant from all three vertices', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 4, y: 0 };
    const c = { x: 1, y: 3 };
    const o = circumcentre(a, b, c)!;
    const d = (p: typeof a) => Math.hypot(o.x - p.x, o.y - p.y);
    expect(d(b)).toBeCloseTo(d(a), 9);
    expect(d(c)).toBeCloseTo(d(a), 9);
  });

  it('the orthocentre of a right triangle is its right-angle vertex', () => {
    // A textbook property, and a case the Euler-line form must get exactly right.
    const h = orthocentre({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 })!;
    expect(h.x).toBeCloseTo(0, 9);
    expect(h.y).toBeCloseTo(0, 9);
  });

  it('the circumcentre of a right triangle is the midpoint of its hypotenuse', () => {
    const o = circumcentre({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 })!;
    expect(o.x).toBeCloseTo(2, 9);
    expect(o.y).toBeCloseTo(1.5, 9);
  });

  it('refuses a degenerate triangle instead of returning a point at infinity', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 1, y: 1 };
    const c = { x: 2, y: 2 };
    expect(circumcentre(a, b, c)).toBeNull();
    expect(incentre(a, b, c)).toBeNull();
    expect(orthocentre(a, b, c)).toBeNull();
  });

  it('judges degeneracy by SHAPE, not by size — a large thin triangle is still a triangle', () => {
    // An absolute epsilon would call this degenerate; the test is relative to the longest side.
    expect(circumcentre({ x: 0, y: 0 }, { x: 1e4, y: 0 }, { x: 5e3, y: 1 })).not.toBeNull();
  });
});

describe('a degenerate configuration is VACANT, never a fault and never a NaN point', () => {
  it('reports the point as absent at this configuration, and raises nothing', () => {
    const d = derive(['A(0,0)', 'B(1,1)', 'C(2,2)', 'P מפגש האנכים האמצעיים במשולש ABC']);
    expect(d.faults).toEqual([]); // "not at this configuration" is not an error (ADR-AG-008)
    expect(d.figure.vacant.map((v) => v.id)).toEqual(['P']);
    expect(d.figure.points.map((p) => p.id)).toEqual(['A', 'B', 'C']);
    expect(d.figure.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });
});

describe('a construction may not reference what does not exist', () => {
  it('refuses a midpoint of points the figure does not have, and NAMES the point', () => {
    // Inventing `B` would place a point the question never gave (ADR-052) and would spend a letter
    // the student is about to use (the ADR-297 class).
    const d = derive(['A(1,1)', 'M אמצע AB']);
    expect(d.faults.map((f) => f.code)).toEqual(['unknown-reference']);
    expect(d.faults[0].detail).toBe('B');
    expect(d.figure.points.map((p) => p.id)).toEqual(['A']);
  });

  it('and that refusal is what makes a parent always precede its dependent', () => {
    // The invariant evaluation relies on instead of a topological sort. Asserted, not trusted.
    const c = build(['A(1,3)', 'B(-4,1)', 'C(-3,8)', 'משולש ABC', 'M מפגש התיכונים במשולש ABC']);
    expect(depsPrecedeDependents(c)).toBe(true);
    expect(objectDeps(c.objects[4])).toEqual(['A', 'B', 'C']);
  });
});

describe('a shape noun that carries a GIVEN is refused, not silently flattened', () => {
  it.each(['מקבילית ABCD', 'טרפז ABCD', 'ריבוע ABCD'])('%s', (noun) => {
    // Drawing a parallelogram as a plain ring of four sides would drop AB ∥ DC — a stated given
    // vanishing, which the root CLAUDE.md forbids outright. Refused until B3 can honour it.
    const r = parseLine(noun);
    expect(r.ok).toBe(false);
    // And refused BY NAME rather than escalated: `not-handled` would send input we understand
    // perfectly to the paid LLM (ADR-3D-214 D2).
    if (!r.ok) expect(r.code).toBe('out-of-scope');
  });

  it('while the NEUTRAL nouns build, because they assert nothing beyond their vertices', () => {
    const d = derive(['A(1,3)', 'B(-4,1)', 'C(-3,8)', 'משולש ABC']);
    expect(d.faults).toEqual([]);
    expect(d.figure.segments).toHaveLength(3);
  });
});

describe('M1 — restating a construction is absorbed, contradicting it is refused', () => {
  it('absorbs an identical restatement', () => {
    const d = derive(['A(8,1)', 'B(-2,-5)', 'M אמצע AB', 'M אמצע AB']);
    expect(d.faults).toEqual([]);
    expect(d.construction.objects.filter((o) => o.id === 'M')).toHaveLength(1);
  });

  it('treats a segment as undirected — AB and BA are one object', () => {
    const d = derive(['A(0,0)', 'B(4,3)', 'הקטע AB', 'הקטע BA']);
    expect(d.faults).toEqual([]);
    expect(d.figure.segments).toHaveLength(1);
  });

  it('treats a polygon as a RING — ABC and ACB are one triangle', () => {
    const d = derive(['A(1,3)', 'B(-4,1)', 'C(-3,8)', 'משולש ABC', 'משולש ACB']);
    expect(d.faults).toEqual([]);
    expect(d.figure.segments).toHaveLength(3);
  });

  it('and ABCD vs BCDA likewise — a rotation names the same quadrilateral', () => {
    const d = derive(['A(-2,1)', 'B(4,5)', 'C(5,2)', 'D(-1,-2)', 'מרובע ABCD', 'מרובע BCDA']);
    expect(d.faults).toEqual([]);
    expect(d.figure.segments).toHaveLength(4);
  });

  it('but ABDC is a DIFFERENT quadrilateral and keeps its own identity', () => {
    // The canonical form must not over-merge: reordering into a different side set is a new figure,
    // and silently absorbing it would drop a figure the student asked for.
    const d = derive(['A(-2,1)', 'B(4,5)', 'C(5,2)', 'D(-1,-2)', 'מרובע ABCD', 'מרובע ABDC']);
    expect(d.faults).toEqual([]);
    expect(d.figure.segments).toHaveLength(8);
  });

  it('refuses a restatement that means something different under the same name', () => {
    const d = derive(['A(8,1)', 'B(-2,-5)', 'C(0,0)', 'M אמצע AB', 'M אמצע AC']);
    expect(d.faults.map((f) => f.code)).toEqual(['conflicting-restatement']);
  });

  /**
   * Operator-reported, 2026-09-15: a figure with **two points called M**.
   *
   * `M מפגש התיכונים במשולש ABC` then `M(3,c)` created a `derived` M *and* a `point` M, both drawn,
   * with no refusal at all — so the canvas showed one name twice and every later reference to `M`
   * bound to whichever came first.
   *
   * The cause was that each case asked only about the kinds it happened to know: the point case
   * checked for a curve and stopped. B4 added three kinds and none of them was visible to it. The
   * gate now compares `prior.kind` to `f.t` and enumerates nothing, so it cannot go stale again —
   * which is why the reverse order is tested too: a per-kind check tends to be fixed in one
   * direction only.
   */
  it.each([
    ['derived first, then a coordinate', ['A(8,-2)', 'B(1,1)', 'C(0,4)', 'M מפגש התיכונים במשולש ABC', 'M(3,5)']],
    ['coordinate first, then derived', ['A(8,-2)', 'B(1,1)', 'C(0,4)', 'M(3,5)', 'M מפגש התיכונים במשולש ABC']],
  ])('one name cannot be two kinds — %s', (_name, lines) => {
    const d = derive(lines);
    expect(d.faults.map((f) => f.code)).toEqual(['name-kind-clash']);
    const ids = d.construction.objects.map((o) => o.id);
    expect(ids.filter((x) => x === 'M')).toHaveLength(1);
    expect(d.figure.points.filter((p) => p.id === 'M')).toHaveLength(1);
  });

  it('no id is ever held by two objects, whatever the kinds', () => {
    // The invariant the bug violated, asserted directly rather than case by case — a fifth object
    // kind that forgot the gate would fail here rather than shipping a duplicate.
    const d = derive([
      'A(8,-2)', 'B(1,1)', 'C(0,4)',
      'משולש ABC', 'הקטע AB',
      'M מפגש התיכונים במשולש ABC',
      'P מפגש האנכים האמצעיים במשולש ABC',
    ]);
    const ids = d.construction.objects.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the honesty gate reaches derived points too', () => {
  it('prints a derived coordinate when its parents are pinned', () => {
    const c = build(['A(8,1)', 'B(-2,-5)', 'M אמצע AB']);
    const k = isKnowledge(c, (f) => f.points.find((p) => p.id === 'M')?.x ?? null);
    expect(k).toEqual({ known: true, value: 3 });
  });

  it('refuses to print one whose parent still carries a free parameter', () => {
    // The midpoint of `A(-9a,0)` and `B(3,4)` moves with `a`. A number here would be one sample's.
    const c = build(['A(-9a,0)', 'B(3,4)', 'M אמצע AB']);
    expect(isKnowledge(c, (f) => f.points.find((p) => p.id === 'M')?.x ?? null).known).toBe(false);
  });

  it('counts no NEW freedom for a derived point — its parents already own it', () => {
    // Counting the midpoint's own freedom would report 2 DOF for the one unknown `a`.
    expect(dofCount(build(['A(-9a,0)', 'B(3,4)', 'M אמצע AB']))).toBe(1);
    expect(dofCount(build(['A(8,1)', 'B(-2,-5)', 'M אמצע AB']))).toBe(0);
  });
});

/**
 * #1043 — «מפגש האלכסונים» is the meet of two SEGMENTS, not of their supporting lines.
 *
 * From a Codex review, and confirmed by measurement before the fix: a concave quadrilateral got a
 * point at `t = 2` along a diagonal that ends at `t = 1` — committed with no fault, drawn, and
 * printed in the data panel as a coordinate the student can read off the figure. An invented point
 * is the same class of defect as a dropped given: the figure says something the sentence does not.
 */
describe('#1043 — the diagonal meet lies ON both diagonals', () => {
  const at = (pts: Record<string, { x: number; y: number }>) => (id: string) => pts[id] ?? null;

  it('is absent for a concave quadrilateral whose diagonals do not cross', () => {
    // The reported figure. Before the fix this returned (2,2): AC runs (0,0)→(1,1), so t = 2 is
    // twice past its own endpoint.
    expect(diagonalMeet({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 4 })).toBeNull();
  });

  it('is absent for the reviewer’s own figure too', () => {
    expect(
      diagonalMeet({ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 0.5, y: 0.5 }, { x: 0, y: 2 }),
    ).toBeNull();
  });

  it('still meets for a convex quadrilateral, where the diagonals really do cross', () => {
    const m = diagonalMeet({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 });
    expect(m?.x).toBeCloseTo(2, 9);
    expect(m?.y).toBeCloseTo(2, 9);
  });

  it('still meets for a non-square convex quadrilateral', () => {
    // The catalog's own figure, whose expected meet was checked by hand in ADR-AG-013: (1.5, 1.5).
    const m = diagonalMeet({ x: -2, y: 1 }, { x: 4, y: 5 }, { x: 5, y: 2 }, { x: -1, y: -2 });
    expect(m).not.toBeNull();
  });

  it('accepts a crossing exactly ON a vertex — the interval is CLOSED', () => {
    // A(0,0) B(4,0) C(2,2) D(0,4): BD runs (4,0)→(0,4) and passes exactly through C, so the meet
    // sits at t = 1 — the far ENDPOINT of diagonal AC. The diagonals genuinely touch there, so it is
    // a meet rather than an absence. Ruled explicitly rather than left to whichever way the
    // tolerance happened to fall.
    const m = diagonalMeet({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 4 });
    expect(m).not.toBeNull();
    expect(m?.x).toBeCloseTo(2, 9);
    expect(m?.y).toBeCloseTo(2, 9);
  });

  it('is absent when the diagonals are parallel — unchanged', () => {
    expect(diagonalMeet({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 2 }, { x: 3, y: 2 })).toBeNull();
  });

  it('scales: a large thin quadrilateral is judged the same way as a small one', () => {
    // Relative tolerance, not absolute — the corpus has figures spanning 3 units and 3000.
    const small = diagonalMeet({ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 });
    const big = diagonalMeet(
      { x: 0, y: 0 },
      { x: 4000, y: 0 },
      { x: 4000, y: 4000 },
      { x: 0, y: 4000 },
    );
    expect(small).not.toBeNull();
    expect(big).not.toBeNull();
    expect(big?.x).toBeCloseTo(2000, 6);
  });

  it('reports the point ABSENT through the rule evaluator, never NaN', () => {
    // The vacancy path: `evalRule` propagates null and the figure reports the point absent at this
    // configuration — ADR-AG-008's distinction, applied here.
    const pts = { A: { x: 0, y: 0 }, B: { x: 4, y: 0 }, C: { x: 1, y: 1 }, D: { x: 0, y: 4 } };
    const out = evalRule({ t: 'diagonals', v: ['A', 'B', 'C', 'D'] }, at(pts));
    expect(out).toBeNull();
  });
});
