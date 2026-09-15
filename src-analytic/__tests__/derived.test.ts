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
import { buildScene } from '../render/scene';
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
  it('reports the point as absent, and never as a NaN', () => {
    /**
     * The vacancy half is unchanged and is what this case is really for: `P` is ABSENT rather than a
     * NaN point, and the honest lines around it still land.
     *
     * The «raises nothing» half FLIPPED in #1058, and this figure is that issue's own second example.
     * `A(0,0) B(1,1) C(2,2)` are pinned and collinear, so there is no configuration in which they have
     * a circumcentre — ADR-AG-008's "not at THIS value" presupposes other values, and here there are
     * none. Silence told the student nothing about a point they had named.
     */
    const d = derive(['A(0,0)', 'B(1,1)', 'C(2,2)', 'P מפגש האנכים האמצעיים במשולש ABC']);
    expect(d.figure.vacant.map((v) => v.id)).toEqual(['P']);
    expect(d.figure.points.map((p) => p.id)).toEqual(['A', 'B', 'C']);
    expect(d.figure.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
    expect(d.faults.map((f) => f.code)).toEqual(['does-not-exist']);
  });

  it('…but stays SILENT while the figure can still move — ADR-AG-008, in its own scope', () => {
    // Three FREE vertices: at this seed they may be near-collinear, and another configuration will
    // have a circumcentre. That is the case the rule was written for, and it must not be reported.
    const d = derive(['משולש ABC', 'P מפגש האנכים האמצעיים במשולש ABC']);
    expect(d.figure.carrierDof).toBeGreaterThan(0);
    expect(d.faults).toEqual([]);
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

describe('a shape noun that carries a GIVEN is HONOURED (#1049, was a refusal)', () => {
  /**
   * THIS LOCK IS DELIBERATELY FLIPPED, and the reason is the one it was written with.
   *
   * It asserted `out-of-scope` because drawing a parallelogram as a plain ring of four sides would
   * drop «AB ∥ DC» — a stated given vanishing, which the root CLAUDE.md forbids outright — and the
   * constraint layer that could honour it did not exist yet. The comment said so: *"refused until
   * B3 can honour it"*. B3 shipped (ADR-AG-015), the registry (#1049) uses it, and the given is now
   * honoured rather than dropped. So the invariant the test was protecting is INTACT; what changed
   * is which answer satisfies it.
   */
  it.each(['מקבילית ABCD', 'טרפז ABCD', 'ריבוע ABCD'])('%s builds, with its given kept', (noun) => {
    const r = parseLine(noun);
    expect(r.ok).toBe(true);
    // The ring AND the constraints the noun carries — never the ring alone, which is the exact
    // failure the original test existed to prevent.
    if (r.ok) expect(r.facts.filter((f) => f.t === 'constraint').length).toBeGreaterThan(0);
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
    ['coordinate first, then derived', ['A(8,-2)', 'B(1,1)', 'C(0,4)', 'M(3,5)', 'M מפגש התיכונים במשולש ABC']],
  ])('one name cannot be two kinds — %s', (_name, lines) => {
    const d = derive(lines);
    expect(d.faults.map((f) => f.code)).toEqual(['name-kind-clash']);
    const ids = d.construction.objects.map((o) => o.id);
    expect(ids.filter((x) => x === 'M')).toHaveLength(1);
    expect(d.figure.points.filter((p) => p.id === 'M')).toHaveLength(1);
  });

  it('DERIVED first, then a coordinate, is a STATEMENT about it (#1046 — was a clash)', () => {
    /**
     * THIS LOCK IS DELIBERATELY FLIPPED, and the invariant it protected is intact.
     *
     * What it was protecting is that one name never holds two objects, and that still holds — it
     * is asserted below, unchanged. What it got wrong is the DISPOSITION: the operator does not
     * mean "here is a second M", they mean "the M you have is at (3,5)", which is what M1 is for.
     * Operator, 2026-09-15: *"it should know I am referring to the existing M"*.
     *
     * The other direction — a coordinate first, then a derived rule — stays a clash, and that is
     * not an inconsistency: naming a point `M` and then saying M is the centroid is a second
     * DEFINITION of M, while giving the centroid a coordinate is a statement about the first one.
     */
    const lines = ['A(8,-2)', 'B(1,1)', 'C(0,4)', 'M מפגש התיכונים במשולש ABC', 'M(3,5)'];
    const d = derive(lines);
    // The centroid of THIS triangle is (3,1), so «M(3,5)» is false and the figure says so.
    expect(d.faults.map((f) => f.code)).toEqual(['unsatisfiable']);
    // The invariant the original test existed for, untouched.
    expect(d.construction.objects.filter((o) => o.id === 'M')).toHaveLength(1);
    expect(d.figure.points.filter((p) => p.id === 'M')).toHaveLength(1);
  });

  it('and the TRUE version of that statement is simply accepted', () => {
    const d = derive(['A(0,0)', 'B(6,0)', 'C(3,6)', 'M מפגש התיכונים במשולש ABC', 'M(3,2)']);
    expect(d.faults).toEqual([]);
    expect(d.construction.objects.filter((o) => o.id === 'M')).toHaveLength(1);
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

/**
 * #1058 — a point that CANNOT exist says why, instead of being silently absent.
 *
 * The operator, playing round #1056's T12: *"we should not accept this input as is since it doesnt
 * exist. we should put a message to user about why its not drawn and not accept the input."*
 *
 * Measured then: `dof = 0` at every seed on the reported figure, so "not at this configuration" was
 * vacuously "never". ADR-AG-008 is AMENDED, not overturned — its silence is right wherever the figure
 * still has freedom, and the amendment is that the distinction needs a predicate.
 */
describe('#1058 — vacancy needs a predicate', () => {
  const codes = (lines: string[]) => derive(lines, 0).faults.map((f) => f.code);

  it('reports the concave diagonal meet — the operator’s reported figure', () => {
    expect(codes(['A(0,0)', 'B(4,0)', 'C(1,1)', 'D(0,4)', 'G מפגש האלכסונים במרובע ABCD'])).toEqual([
      'does-not-exist',
    ]);
  });

  it('reports the wider class the issue named — a collinear circumcentre', () => {
    expect(codes(['A(0,0)', 'B(1,1)', 'C(2,2)', 'P מפגש האנכים האמצעיים במשולש ABC'])).toEqual([
      'does-not-exist',
    ]);
  });

  it('names WHAT does not exist, so the message can say it', () => {
    // The same `existing` token #1046 introduced for a name clash, reused rather than re-invented —
    // the locale renders «מפגש האלכסונים», never `derived:diagonals`.
    const d = derive(['A(0,0)', 'B(4,0)', 'C(1,1)', 'D(0,4)', 'G מפגש האלכסונים במרובע ABCD'], 0);
    expect(d.faults[0].existing).toBe('derived:diagonals');
  });

  it('stays SILENT while the figure can still move — ADR-AG-008 intact', () => {
    // The amendment's whole point: this figure has freedom, so another configuration may have the
    // point, and «הציגו תצורה אחרת» can reach it. Reporting here would be the opposite defect.
    expect(codes(['מרובע ABCD', 'G מפגש האלכסונים במרובע ABCD'])).toEqual([]);
  });

  it('a convex quadrilateral is unaffected', () => {
    expect(codes(['A(0,0)', 'B(4,0)', 'C(4,4)', 'D(0,4)', 'G מפגש האלכסונים במרובע ABCD'])).toEqual([]);
  });
});

describe('#1076 — a CARRIER is not a stated object', () => {
  /**
   * Operator ruling, 2026-09-15: *"when I say that נקודה B על הישר y=x - what i really mean is
   * that B is (t,t). so I dont want the line itself drawn. if i want the line itself, I will say
   * y=x"*.
   *
   * These assert the SCENE, not the construction. #1066's lesson was that a mechanism verified at
   * the engine layer says nothing about what the student sees, and this defect lives entirely in
   * what is shown.
   */
  const drawn = (lines: string[]) => {
    const d = derive(lines, 0);
    const s = buildScene(d.figure, d.box, 600, 600);
    return { curves: s.curves.length, points: s.points.length, faults: d.faults, d };
  };

  it('does not draw the line a point was merely placed ON', () => {
    const r = drawn(['נקודה B על הישר y=x']);
    expect(r.faults).toEqual([]);
    expect(r.curves).toBe(0);
    // The carrier is REAL — B rides it, and the panel still names it.
    expect(r.points).toBe(1);
    expect(r.d.figure.curves).toHaveLength(1);
    const b = r.d.figure.points[0];
    expect(b.y).toBeCloseTo(b.x, 6);
  });

  it('draws the same line when the student asks for the line itself', () => {
    expect(drawn(['y=x']).curves).toBe(1);
  });

  it('PROMOTES the carrier when the line is later stated — and calls it a change', () => {
    // Content-derived ids (ADR-AG-023) make these ONE object, so the second line adds no row and
    // would read as «כבר ידוע» to #1045's mechanism — while the canvas visibly gains a line.
    const r = drawn(['נקודה B על הישר y=x', 'y=x']);
    expect(r.curves).toBe(1);
    expect(r.d.figure.curves).toHaveLength(1);
    expect(r.d.outcomes[1]).toBe('created');
  });

  it('never DEMOTES a stated line to a carrier', () => {
    expect(drawn(['y=x', 'נקודה B על הישר y=x']).curves).toBe(1);
  });

  it('leaves an object the student built alone — «D על הצלע BC»', () => {
    // The flag belongs to the MINTING, not to the noun: BC is the student's own segment.
    const r = drawn(['A(0,0)', 'B(4,0)', 'C(0,4)', 'משולש ABC', 'D על הצלע BC']);
    expect(r.faults).toEqual([]);
    expect(r.d.figure.segments).toHaveLength(3);
  });

  it('carries the CURVE families, which fell through to not-handled', () => {
    // Not a parabola: «y=x^2» is a translated conic and out of scope by ADR-AG-005. The circle and
    // the ellipse are the corpus's own, and «שמשוואתו» is how the corpus writes them.
    for (const line of [
      'נקודה P על המעגל שמשוואתו x^2+y^2=25',
      'P על האליפסה x^2/9+y^2/4=1',
      'P is on the circle x^2+y^2=25',
    ]) {
      const r = drawn([line]);
      expect(r.faults).toEqual([]);
      expect(r.curves).toBe(0);
      expect(r.points).toBe(1);
    }
    const p = derive(['נקודה P על המעגל שמשוואתו x^2+y^2=25'], 0).figure.points[0];
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(5, 6);
  });
});
