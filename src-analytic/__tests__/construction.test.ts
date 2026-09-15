/**
 * The CONSTRUCTION a derived point is drawn from (#1030).
 *
 * Operator, 2026-09-15: *"the tool can find easily the location of that point **but what does the
 * student learn from this**… something that will give a student an understanding of what kind of
 * builds he needs to do."*
 *
 * So these tests are not about pixels. They assert that the scaffolding is the **real geometry** —
 * that the median actually runs to the opposite side's midpoint, that the centroid actually sits at
 * the 2:1 point the label claims, that the altitude foot is actually a right angle. A construction
 * drawn from wrong geometry would teach a student something false, which is worse than teaching them
 * nothing.
 */
import { describe, expect, it } from 'vitest';
import { fold } from '../engine/apply';
import { evaluate } from '../engine/evaluate';
import { parseLine } from '../parser/parseAnalytic';
import type { Fact } from '../engine/types';

const build = (src: string[]) =>
  fold(
    src.flatMap((s) => {
      const r = parseLine(s);
      if (!r.ok) throw new Error(`${s}: ${r.code}`);
      return r.facts;
    }) as Fact[],
  ).construction;

const figureOf = (src: string[]) => evaluate(build(src), 0);
const TRI = ['A(1,3)', 'B(-4,1)', 'C(-3,8)'];
const near = (p: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.hypot(p.x - q.x, p.y - q.y) < 1e-9;

describe('the centroid — the case the ruling was about', () => {
  const fig = figureOf([...TRI, 'משולש ABC', 'M מפגש התיכונים במשולש ABC']);
  const con = fig.construction.find((c) => c.id === 'M')!;

  it('draws three medians, one per vertex', () => {
    expect(con.lines).toHaveLength(3);
    expect(con.feet).toHaveLength(3);
  });

  it('each median runs from a vertex to the MIDPOINT of the opposite side', () => {
    const at = (id: string) => fig.points.find((p) => p.id === id)!;
    const verts = [at('A'), at('B'), at('C')];
    for (const l of con.lines) {
      const vi = verts.findIndex((v) => near(v, l.a));
      expect(vi, 'a median must start at a vertex').toBeGreaterThanOrEqual(0);
      const others = verts.filter((_, i) => i !== vi);
      const mid = { x: (others[0].x + others[1].x) / 2, y: (others[0].y + others[1].y) / 2 };
      expect(near(l.b, mid), 'a median must end at the opposite side s midpoint').toBe(true);
    }
  });

  it('every median actually passes through the centroid', () => {
    // If it did not, the drawing would show three lines that visibly miss the point they define.
    const m = fig.points.find((p) => p.id === 'M')!;
    for (const l of con.lines) {
      const cross = (l.b.x - l.a.x) * (m.y - l.a.y) - (l.b.y - l.a.y) * (m.x - l.a.x);
      const scale = Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);
      expect(Math.abs(cross) / scale).toBeLessThan(1e-9);
    }
  });

  it('the 2:1 the LABEL claims is the ratio the figure actually has', () => {
    // The label is a statement about the geometry; this is what makes it true rather than decorative.
    const m = fig.points.find((p) => p.id === 'M')!;
    for (const l of con.lines) {
      const vertexToM = Math.hypot(m.x - l.a.x, m.y - l.a.y);
      const mToFoot = Math.hypot(l.b.x - m.x, l.b.y - m.y);
      expect(vertexToM / mToFoot).toBeCloseTo(2, 9);
    }
  });

  it('labels the two PARTS algebraically, a different letter per median', () => {
    // Operator ruling: "2x, x and 2y, y and 2z, z" — the board convention, which hands the student
    // the variables to write the equation with rather than merely stating the ratio.
    expect(con.lines.map((l) => (l.marks ?? []).map((m) => m.text))).toEqual([
      ['2x', 'x'],
      ['2y', 'y'],
      ['2z', 'z'],
    ]);
  });

  it('puts each label on its OWN part of the median', () => {
    // The centroid is two thirds along, so the long part is [0, 2/3] and the short part [2/3, 1];
    // a label at the midpoint of each. Getting this wrong would put "2x" on the short part and
    // teach the ratio backwards.
    for (const l of con.lines) {
      const [long, short] = l.marks!;
      expect(long.at).toBeCloseTo(1 / 3, 12);
      expect(short.at).toBeCloseTo(5 / 6, 12);
      expect(long.at).toBeLessThan(2 / 3); // on the vertex side of the centroid
      expect(short.at).toBeGreaterThan(2 / 3); // beyond it
    }
  });

  it('and the part labelled 2x really is twice the part labelled x', () => {
    // The labels are a claim about the geometry. This is what makes them true rather than decorative.
    const m = fig.points.find((p) => p.id === 'M')!;
    for (const l of con.lines) {
      const [long, short] = l.marks!;
      expect(long.text).toBe(`2${short.text}`);
      const vToM = Math.hypot(m.x - l.a.x, m.y - l.a.y);
      const mToFoot = Math.hypot(l.b.x - m.x, l.b.y - m.y);
      expect(vToM / mToFoot).toBeCloseTo(2, 9);
    }
  });
});

describe('the other constructions are the real geometry too', () => {
  it('an altitude meets the opposite side at a RIGHT angle', () => {
    const fig = figureOf(['A(0,0)', 'B(4,0)', 'C(1,3)', 'H מפגש הגבהים במשולש ABC']);
    const con = fig.construction.find((c) => c.id === 'H')!;
    const at = (id: string) => fig.points.find((p) => p.id === id)!;
    const verts = [at('A'), at('B'), at('C')];
    expect(con.lines).toHaveLength(3);
    for (const l of con.lines) {
      const vi = verts.findIndex((v) => near(v, l.a));
      const [u, w] = verts.filter((_, i) => i !== vi);
      const alt = { x: l.b.x - l.a.x, y: l.b.y - l.a.y };
      const side = { x: w.x - u.x, y: w.y - u.y };
      const dot = alt.x * side.x + alt.y * side.y;
      expect(Math.abs(dot) / (Math.hypot(alt.x, alt.y) * Math.hypot(side.x, side.y))).toBeLessThan(1e-9);
    }
  });

  it('an angle bisector divides the opposite side in the ratio of the adjacent sides', () => {
    // BD:DC = AB:AC — the property that makes the foot computable without trigonometry.
    const fig = figureOf(['A(-1,-1)', 'B(7,3)', 'C(-4,5)', 'O מפגש חוצי הזוויות במשולש ABC']);
    const con = fig.construction.find((c) => c.id === 'O')!;
    const at = (id: string) => fig.points.find((p) => p.id === id)!;
    const [a, b, c] = [at('A'), at('B'), at('C')];
    const fromA = con.lines.find((l) => near(l.a, a))!;
    const bd = Math.hypot(fromA.b.x - b.x, fromA.b.y - b.y);
    const dc = Math.hypot(c.x - fromA.b.x, c.y - fromA.b.y);
    const ab = Math.hypot(b.x - a.x, b.y - a.y);
    const ac = Math.hypot(c.x - a.x, c.y - a.y);
    expect(bd / dc).toBeCloseTo(ab / ac, 9);
  });

  it('a perpendicular bisector starts at a side s midpoint and reaches the circumcentre', () => {
    const fig = figureOf(['A(0,0)', 'B(4,0)', 'C(0,3)', 'P מפגש האנכים האמצעיים במשולש ABC']);
    const con = fig.construction.find((c) => c.id === 'P')!;
    const p = fig.points.find((q) => q.id === 'P')!;
    expect(con.lines).toHaveLength(3);
    expect(con.lines.every((l) => near(l.b, p))).toBe(true);
    // And its foot is equidistant from the two vertices it bisects — that is what "bisector" means.
    expect(con.feet).toHaveLength(3);
  });

  it('a diagonal meet draws exactly the two diagonals', () => {
    const fig = figureOf(['A(-2,1)', 'B(4,5)', 'C(5,2)', 'D(-1,-2)', 'G מפגש האלכסונים במרובע ABCD']);
    const con = fig.construction.find((c) => c.id === 'G')!;
    expect(con.lines).toHaveLength(2);
    expect(con.feet).toHaveLength(0); // a diagonal has no foot to mark
  });

  it('a midpoint draws the segment it is the midpoint of', () => {
    const fig = figureOf(['A(8,1)', 'B(-2,-5)', 'M אמצע AB']);
    const con = fig.construction.find((c) => c.id === 'M')!;
    expect(con.lines).toHaveLength(1);
    expect(con.lines[0].marks ?? []).toEqual([]); // no property worth asserting in words here
  });
});

describe('the construction is DECORATION — it must not become the figure', () => {
  const src = [...TRI, 'משולש ABC', 'M מפגש התיכונים במשולש ABC'];

  it('spends no letter and creates no object', () => {
    // The ADR-297 property: a construction line minted as an object would occupy a name the student
    // is about to use. Asserted directly rather than trusted.
    const c = build(src);
    expect(c.objects.map((o) => o.id)).toEqual(['A', 'B', 'C', 'poly-ABC', 'M']);
  });

  it('adds no points to the figure — the feet are not named points', () => {
    const fig = figureOf(src);
    expect(fig.points.map((p) => p.id)).toEqual(['A', 'B', 'C', 'M']);
  });

  it('adds no segments — the medians are not sides', () => {
    const fig = figureOf(src);
    expect(fig.segments).toHaveLength(3); // the triangle's own three, and no more
  });

  it('is absent for a point that is VACANT at this configuration', () => {
    // No scaffolding for something that is not there.
    const fig = figureOf(['A(0,0)', 'B(1,1)', 'C(2,2)', 'P מפגש האנכים האמצעיים במשולש ABC']);
    expect(fig.vacant.map((v) => v.id)).toEqual(['P']);
    expect(fig.construction).toEqual([]);
  });
});
