/**
 * Phase-5c corpus gate (docs/09-implementation-plan.md §Phase 5c).
 * Reproduce the figures of corpus Q5, Q6, Q7 — three circle problems — end to
 * end from typed He/En utterances (we play the parser, then build & assert
 * structure; we never solve the algebra). The grammar + engine + renderer were
 * widened in lock-step for circles, inscribed vertices, arc midpoint, diameter,
 * line∩circle, and the tangent line.
 */

import { describe, it, expect } from 'vitest';
import type { Command, Vec } from '../types';
import { build } from '../step';
import { evaluate } from '../evaluate';
import { dist, sub, angleDeg, cross, footOnLine } from '../geometry';
import { parse } from '@/parser';

const dot = (u: Vec, v: Vec) => u.x * v.x + u.y * v.y;
const collinear = (a: Vec, b: Vec, q: Vec) => Math.abs(cross(a, b, q)) < 1e-6;

function reproduce(utterances: string[], tag: string) {
  const commands = utterances.flatMap((u) => {
    const r = parse(u);
    if (!r.ok) throw new Error(`${tag}: failed to parse "${u}"`);
    return r.commands;
  });
  return build(commands as Command[]);
}

describe('inscribed without naming the circle (regression — no silent half-parse)', () => {
  // "triangle ABC inscribed in a circle" with NO centre named must still draw the
  // circle (auto-centre), not silently become a bare triangle.
  for (const u of ['משולש ABC חסום במעגל', 'triangle ABC inscribed in a circle']) {
    it(`"${u}" builds a real circle with A,B,C on it`, () => {
      const { construction, positions } = reproduce([u], 'inscribed');
      const circles = construction.objects.filter((o) => o.kind === 'circle');
      expect(circles).toHaveLength(1);
      const center = positions.get((circles[0] as { center: string }).center)!;
      for (const id of ['A', 'B', 'C']) {
        expect(dist(center, positions.get(id)!)).toBeCloseTo(5, 6); // each vertex on the circle
      }
    });
  }
});

describe('inscribed cyclic polygons (square / rectangle / isosceles trapezoid)', () => {
  const para = (a: Vec, b: Vec, c: Vec, d: Vec) => {
    const u = sub(b, a), v = sub(d, c);
    return Math.abs(u.x * v.y - u.y * v.x) < 1e-6; // (b−a) ∥ (d−c)
  };

  it('inscribed square: 4 equal sides, all on the circle', () => {
    const { positions } = reproduce(['square ABCD inscribed in a circle'], 'sq');
    const O = positions.get('O')!;
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => positions.get(id)!);
    for (const p of [A, B, C, D]) expect(dist(O, p)).toBeCloseTo(5, 6);
    expect(dist(A, B)).toBeCloseTo(dist(B, C), 6);
    expect(dist(B, C)).toBeCloseTo(dist(C, D), 6);
  });

  it('inscribed isosceles trapezoid: AB ∥ DC, equal legs, all on the circle', () => {
    const { positions } = reproduce(['טרפז ABCD חסום במעגל'], 'trap');
    const O = positions.get('O')!;
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => positions.get(id)!);
    for (const p of [A, B, C, D]) expect(dist(O, p)).toBeCloseTo(5, 6);
    expect(para(A, B, D, C)).toBe(true); // one pair of parallel sides
    expect(para(A, D, B, C)).toBe(false); // the other pair is NOT parallel (a trapezoid, not a parallelogram)
    expect(dist(B, C)).toBeCloseTo(dist(D, A), 6); // isosceles — equal legs
  });
});

describe('constructible cases that used to escalate (right-tri inscribed, circumcircle, special lines)', () => {
  it('right triangle inscribed: vertices on the circle, right angle at C (Thales)', () => {
    const { positions } = reproduce(['right triangle ABC inscribed in a circle'], 'rt');
    const O = positions.get('O')!;
    const [A, B, C] = ['A', 'B', 'C'].map((id) => positions.get(id)!);
    for (const p of [A, B, C]) expect(dist(O, p)).toBeCloseTo(5, 6);
    expect(angleDeg(C, A, B)).toBeCloseTo(90, 6); // right angle at C
    expect((A.x + B.x) / 2).toBeCloseTo(O.x, 6); // AB is a diameter → its midpoint is the centre
    expect((A.y + B.y) / 2).toBeCloseTo(O.y, 6);
  });

  it('circle through A B C: the circle is the circumcircle (equidistant from all three)', () => {
    const { positions } = reproduce(['circle through A B C'], 'cc');
    const O = positions.get('O')!;
    const [A, B, C] = ['A', 'B', 'C'].map((id) => positions.get(id)!);
    expect(dist(O, A)).toBeCloseTo(dist(O, B), 6);
    expect(dist(O, B)).toBeCloseTo(dist(O, C), 6);
  });

  it('median from A: M is the midpoint of the opposite side BC', () => {
    const { positions } = reproduce(['triangle ABC', 'median from A in ABC'], 'med');
    const [B, C, M] = ['B', 'C', 'M'].map((id) => positions.get(id)!);
    expect(M.x).toBeCloseTo((B.x + C.x) / 2, 6);
    expect(M.y).toBeCloseTo((B.y + C.y) / 2, 6);
  });

  it('altitude from A: foot F lies on BC and AF ⟂ BC', () => {
    const { positions } = reproduce(['triangle ABC', 'height from A in ABC'], 'alt');
    const [A, B, C, F] = ['A', 'B', 'C', 'F'].map((id) => positions.get(id)!);
    expect(collinear(B, C, F)).toBe(true);
    expect(dot(sub(F, A), sub(C, B))).toBeCloseTo(0, 6); // AF ⟂ BC
  });

  it('AD bisects ∠BAC: D lands on BC and AD bisects the angle', () => {
    const { positions } = reproduce(['triangle ABC', 'AD bisects angle BAC'], 'bis');
    const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => positions.get(id)!);
    expect(collinear(B, C, D)).toBe(true);
    expect(angleDeg(A, B, D)).toBeCloseTo(angleDeg(A, D, C), 4); // ∠BAD = ∠DAC
  });

  it('circle inscribed in a triangle: the incircle is tangent to all three sides', () => {
    // distinct from "triangle inscribed in a circle" — the circle is INSIDE the triangle
    const { positions } = reproduce(['triangle ABC', 'circle inscribed in triangle ABC'], 'incircle');
    const [A, B, C, I] = ['A', 'B', 'C', 'I'].map((id) => positions.get(id)!);
    const distToSide = (p: Vec, q: Vec) => dist(I, footOnLine(I, p, q));
    // the incenter is equidistant from all three sides ⇒ one circle is tangent to each
    expect(distToSide(A, B)).toBeCloseTo(distToSide(B, C), 6);
    expect(distToSide(B, C)).toBeCloseTo(distToSide(C, A), 6);
  });
});

describe('corpus Q5 — triangle inscribed in a circle + arc midpoint', () => {
  const EN = [
    'triangle ABC inscribed in circle O radius 5',
    'D is the midpoint of arc BC in circle O',
    'segment AD',
    'segment CD',
    'segment OC',
    'E is the intersection of AD and BC',
  ];
  const HE = [
    'המשולש ABC חסום במעגל שמרכזו O ורדיוסו 5',
    'D אמצע הקשת BC במעגל O',
    'קטע AD',
    'קטע CD',
    'קטע OC',
    'E חיתוך AD ו-BC',
  ];

  for (const [lang, utterances] of [['en', EN], ['he', HE]] as const) {
    it(`reproduces Q5 (${lang})`, () => {
      const { construction, positions } = reproduce(utterances, `Q5-${lang}`);
      const O = positions.get('O')!;
      const A = positions.get('A')!, B = positions.get('B')!, C = positions.get('C')!, D = positions.get('D')!, E = positions.get('E')!;

      // A, B, C, D all lie on the circle of radius 5
      for (const p of [A, B, C, D]) expect(dist(O, p)).toBeCloseTo(5, 6);
      // D is the arc midpoint of BC → equidistant from B and C
      expect(dist(D, B)).toBeCloseTo(dist(D, C), 5);
      // E is the crossing of AD and BC
      expect(collinear(A, D, E)).toBe(true);
      expect(collinear(B, C, E)).toBe(true);

      expect(construction.objects.some((o) => o.kind === 'circle' && o.id === 'circle-O')).toBe(true);
      expect(evaluate(construction).ok).toBe(true);
    });
  }
});

describe('corpus Q6 — chord & diameter crossing, plus a parallel line ∩ circle', () => {
  const EN = [
    'circle centered at O radius 4',
    'chord AB in circle O',
    'diameter DE in circle O',
    'C is the intersection of AB and DE',
    'G is where the line through O parallel to AB meets circle O',
  ];
  const HE = [
    'מעגל שמרכזו O ורדיוסו 4',
    'מיתר AB במעגל O',
    'קוטר DE במעגל O',
    'C חיתוך AB ו-DE',
    'G חיתוך הישר דרך O המקביל ל-AB עם מעגל O',
  ];

  for (const [lang, utterances] of [['en', EN], ['he', HE]] as const) {
    it(`reproduces Q6 (${lang})`, () => {
      const { construction, positions } = reproduce(utterances, `Q6-${lang}`);
      const O = positions.get('O')!;
      const A = positions.get('A')!, B = positions.get('B')!, D = positions.get('D')!, EE = positions.get('E')!, C = positions.get('C')!, G = positions.get('G')!;

      // A, B (chord) and D, E (diameter) are on the circle of radius 4
      for (const p of [A, B, D, EE]) expect(dist(O, p)).toBeCloseTo(4, 6);
      // DE is a diameter: O is its midpoint
      expect((D.x + EE.x) / 2).toBeCloseTo(O.x, 6);
      expect((D.y + EE.y) / 2).toBeCloseTo(O.y, 6);
      // C is the crossing of the two chords
      expect(collinear(A, B, C)).toBe(true);
      expect(collinear(D, EE, C)).toBe(true);
      // G is on the circle, on the line through O parallel to AB → (G−O) ∥ AB
      expect(dist(O, G)).toBeCloseTo(4, 6);
      const og = sub(G, O);
      const ab = sub(B, A);
      expect(Math.abs(og.x * ab.y - og.y * ab.x)).toBeLessThan(1e-6);

      expect(evaluate(construction).ok).toBe(true);
    });
  }
});

describe('corpus Q7 — inscribed triangle, tangent at a vertex, angle bisector', () => {
  const EN = [
    'triangle ABD inscribed in circle O radius 5',
    'E is the intersection of the tangent to circle O at D and AB',
    'F is the intersection of the bisector of angle ADB and AB',
    'segment DE',
    'segment DF',
  ];
  const HE = [
    'המשולש ABD חסום במעגל שמרכזו O ורדיוסו 5',
    'E חיתוך המשיק למעגל O בנקודה D עם AB',
    'F חיתוך חוצה זווית ADB עם AB',
    'קטע DE',
    'קטע DF',
  ];

  for (const [lang, utterances] of [['en', EN], ['he', HE]] as const) {
    it(`reproduces Q7 (${lang})`, () => {
      const { construction, positions } = reproduce(utterances, `Q7-${lang}`);
      const O = positions.get('O')!;
      const A = positions.get('A')!, B = positions.get('B')!, D = positions.get('D')!, E = positions.get('E')!, F = positions.get('F')!;

      // A, B, D are on the circle
      for (const p of [A, B, D]) expect(dist(O, p)).toBeCloseTo(5, 6);
      // E is on line AB and the tangent at D is ⟂ to the radius OD → DE ⟂ OD
      expect(collinear(A, B, E)).toBe(true);
      expect(dot(sub(E, D), sub(D, O))).toBeCloseTo(0, 5); // tangent ⟂ radius
      // F is on line AB and DF bisects ∠ADB
      expect(collinear(A, B, F)).toBe(true);
      expect(angleDeg(D, A, F)).toBeCloseTo(angleDeg(D, F, B), 5);

      expect(evaluate(construction).ok).toBe(true);
    });
  }
});
