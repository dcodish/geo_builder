/**
 * #1715 (ADR-AG-224) — ONE meet frame, «<line> ו<line> נפגשים / נחתכים בנקודה E», over every line-object the grammar
 * reads.
 *
 * Operator, round sheet T4: *"…not variations of it such as חוצה זוית DCB וחוצה זוית CBA נפגשים בנקודה E or חוצה זוית
 * C וחוצה זוית B נפגשים בנקודה E. note that the 2d tool does support these syntaxes"*. The operand resolver read a named
 * line and a tangent as an OPERAND, and no other line-object; `lineObjectOperand` reads the rest by the rule that
 * reads them as a sentence.
 *
 * Every lock CALLS the real path (`decideSubmit`, `derive`) and asserts GEOMETRY at several seeds, against the closed
 * forms of `engine/derived.ts` where the meet is a classical centre (incentre, orthocentre, centroid, circumcentre),
 * and against each line's own defining property otherwise.
 */
import { describe, expect, it } from 'vitest';
import { derive, type Derivation } from '../engine/derive';
import { centroid, circumcentre, incentre, orthocentre } from '../engine/derived';
import { decideSubmit } from '../app/submit';

const SEEDS = [0, 1, 2, 3, 4, 5, 6, 7];
type P = { x: number; y: number };
const TRI = 'משולש ABC';

const pt = (d: Derivation, id: string): P => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id} — points: ${d.figure.points.map((q) => q.id).join(' ')}`);
  return p;
};
const sub = (p: P, q: P): P => ({ x: p.x - q.x, y: p.y - q.y });
const dot = (u: P, v: P) => u.x * v.x + u.y * v.y;
const cross = (u: P, v: P) => u.x * v.y - u.y * v.x;
const len = (u: P) => Math.hypot(u.x, u.y);
const dist = (p: P, q: P) => len(sub(p, q));

/** The verdict `App.tsx` dispatches, after the context lines were recorded. */
function verdict(steps: readonly string[]): string {
  const lines: string[] = [];
  let last = '';
  for (const line of steps) {
    const v = decideSubmit(line, lines, 0);
    if (v.kind === 'record') lines.push(v.line);
    last = v.kind === 'refused' ? `refused:${v.error.key}` : v.kind;
  }
  return last;
}
function built(steps: readonly string[], seed: number): Derivation {
  expect(verdict(steps), steps.join(' · ')).toBe('record');
  const d = derive(steps, seed);
  expect(d.faults, `${steps.join(' · ')} @${seed}: ${JSON.stringify(d.faults)}`).toEqual([]);
  return d;
}
/** Relative to the triangle's size, so a lock means the same thing at every seed. */
const scaleOf = (d: Derivation) => Math.max(1, ...['A', 'B', 'C'].map((id) => len(pt(d, id))));
const near = (d: Derivation, p: P, q: P | null) => {
  expect(q).not.toBeNull();
  expect(dist(p, q!) / scaleOf(d)).toBeLessThan(1e-5);
};

/** Each line-object's own defining property, as a residual that is 0 when E lies on it. */
const ON: Record<string, { np: string; at: (d: Derivation, e: P) => number }> = {
  'bisector of B': {
    np: 'חוצה זוית B',
    // on the bisector RAY from B: equal angles to BA and BC, and inside the angle
    at: (d, e) => {
      const [a, b, c] = ['A', 'B', 'C'].map((id) => pt(d, id));
      const u = sub(a, b), v = sub(c, b), w = sub(e, b);
      const ang = (x: P, y: P) => Math.atan2(Math.abs(cross(x, y)), dot(x, y));
      return Math.abs(ang(u, w) - ang(w, v)) + Math.abs(ang(u, w) + ang(w, v) - ang(u, v));
    },
  },
  'bisector of ACB': {
    np: 'חוצה הזווית ACB',
    at: (d, e) => {
      const [a, b, c] = ['A', 'B', 'C'].map((id) => pt(d, id));
      const u = sub(a, c), v = sub(b, c), w = sub(e, c);
      const ang = (x: P, y: P) => Math.atan2(Math.abs(cross(x, y)), dot(x, y));
      return Math.abs(ang(u, w) - ang(w, v)) + Math.abs(ang(u, w) + ang(w, v) - ang(u, v));
    },
  },
  'altitude from A': {
    np: 'הגובה מ-A',
    at: (d, e) => Math.abs(dot(sub(e, pt(d, 'A')), sub(pt(d, 'C'), pt(d, 'B')))) / scaleOf(d) ** 2,
  },
  'median from B': {
    np: 'התיכון מ-B',
    at: (d, e) => {
      const [a, b, c] = ['A', 'B', 'C'].map((id) => pt(d, id));
      return Math.abs(cross(sub(e, b), sub({ x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 }, b))) / scaleOf(d) ** 2;
    },
  },
  'perpendicular from C to AB': {
    np: 'האנך מ-C ל-AB',
    at: (d, e) => Math.abs(dot(sub(e, pt(d, 'C')), sub(pt(d, 'B'), pt(d, 'A')))) / scaleOf(d) ** 2,
  },
  'perpendicular bisector of BC': {
    np: 'האנך האמצעי לצלע BC',
    at: (d, e) => Math.abs(dist(e, pt(d, 'B')) - dist(e, pt(d, 'C'))) / scaleOf(d),
  },
  'line AM': {
    np: 'הישר AM',
    at: (d, e) => Math.abs(cross(sub(e, pt(d, 'A')), sub(pt(d, 'M'), pt(d, 'A')))) / scaleOf(d) ** 2,
  },
};

describe('#1715 — the operator’s sentences', () => {
  const OPERATOR = [
    'חוצה זוית BCA וחוצה זוית CBA נפגשים בנקודה E',
    'חוצה זוית C וחוצה זוית B נפגשים בנקודה E',
    'חוצה הזווית B וחוצה הזווית C נחתכים בנקודה E',
  ];
  it.each(OPERATOR)('«%s» after «משולש ABC»: E is the incentre, at 8 seeds', (line) => {
    for (const seed of SEEDS) {
      const d = built([TRI, line], seed);
      near(d, pt(d, 'E'), incentre(pt(d, 'A'), pt(d, 'B'), pt(d, 'C')));
    }
  });

  it('the spellings around them build the same point: «ו-», «ב-E», "meet at E", the noun form', () => {
    for (const line of [
      'חוצה זוית C ו-חוצה זוית B נפגשים בנקודה E',
      'חוצה זוית C וחוצה זוית B נפגשים ב-E',
      'חוצה זוית C וחוצה זוית B נחתכות בנקודה E',
      'E נקודת החיתוך של חוצה זוית C עם חוצה זוית B',
    ]) {
      const d = built([TRI, line], 0);
      near(d, pt(d, 'E'), incentre(pt(d, 'A'), pt(d, 'B'), pt(d, 'C')));
    }
    const en = built(['triangle ABC', 'the bisector of angle B and the bisector of angle C meet at E'], 0);
    near(en, pt(en, 'E'), incentre(pt(en, 'A'), pt(en, 'B'), pt(en, 'C')));
  });
});

describe('#1715 — the classical centres, each through the frame', () => {
  const CASES: Array<[string, (a: P, b: P, c: P) => P | null]> = [
    ['הגובה מ-A והגובה מ-B נפגשים בנקודה E', orthocentre],
    ['התיכון מ-A והתיכון מ-B נפגשים בנקודה E', (a, b, c) => centroid(a, b, c)],
    ['האנך האמצעי לצלע AB והאנך האמצעי לצלע BC נפגשים בנקודה E', circumcentre],
  ];
  it.each(CASES)('«%s» at 8 seeds', (line, centre) => {
    for (const seed of SEEDS) {
      const d = built([TRI, line], seed);
      near(d, pt(d, 'E'), centre(pt(d, 'A'), pt(d, 'B'), pt(d, 'C')));
    }
  });
  // «האנך מ-P ל-X» is a REFERENCE to the perpendicular the figure drew (ADR-AG-207), so the two are drawn first.
  it('«האנך מ-A ל-BC והאנך מ-B ל-AC נחתכים בנקודה E», the perpendiculars drawn, at 8 seeds', () => {
    for (const seed of SEEDS) {
      const d = built([TRI, 'האנך מ-A ל-BC', 'האנך מ-B ל-AC', 'האנך מ-A ל-BC והאנך מ-B ל-AC נחתכים בנקודה E'], seed);
      near(d, pt(d, 'E'), orthocentre(pt(d, 'A'), pt(d, 'B'), pt(d, 'C')));
    }
  });
  it('an undrawn «האנך מ-C ל-AB» in the frame asks which perpendicular (ADR-AG-207’s reference rule)', () => {
    expect(verdict([TRI, 'חוצה זוית B והאנך מ-C ל-AB נפגשים בנקודה E'])).toBe('refused:ambiguous-shape');
  });
});

describe('#1715 — the cross-product: every pair of kinds, in both orders, E on both lines', () => {
  const kinds = Object.keys(ON);
  // Two lines through one NAMED point meet at that point (the bisector of B and the median from B, the altitude from A
  // and the line AM) — the crossing-already-named family, a different question; every other pair is a new point.
  const through: Record<string, string> = { 'bisector of B': 'B', 'median from B': 'B', 'altitude from A': 'A', 'line AM': 'A' };
  const pairs = kinds.flatMap((k1) => kinds.filter((k2) => k2 !== k1 && (!through[k1] || through[k1] !== through[k2])).map((k2) => [k1, k2] as const));
  it.each(pairs)('%s × %s', (k1, k2) => {
    // the perpendicular is drawn first: «האנך מ-C ל-AB» refers to it (ADR-AG-207)
    const steps = [TRI, 'M אמצע BC', 'האנך מ-C ל-AB', `${ON[k1].np} ו${ON[k2].np} נפגשים בנקודה E`];
    for (const seed of [0, 3, 6]) {
      const d = derive(steps, seed);
      // median from B and the line AM are two medians; altitude from A and the perpendicular from C are two altitudes …
      // every pair meets at one point of the plane, unless the two lines coincide or are parallel — not for a triangle.
      expect(verdict(steps), steps.join(' · ')).toBe('record');
      expect(d.faults, `${k1} × ${k2} @${seed}`).toEqual([]);
      const e = pt(d, 'E');
      expect(ON[k1].at(d, e), `${k1} @${seed}`).toBeLessThan(1e-5);
      expect(ON[k2].at(d, e), `${k2} @${seed}`).toBeLessThan(1e-5);
    }
  });
});

describe('#1715 — the retired per-kind meets keep their verdicts on the one frame', () => {
  it('two named lines (ADR-AG-213): «הישר AC והישר BD נפגשים בנקודה E» is the «נחתכים» point', () => {
    const a = built(['מרובע ABCD', 'הישר AC והישר BD נפגשים בנקודה E'], 0);
    const b = built(['מרובע ABCD', 'הישר AC והישר BD נחתכים בנקודה E'], 0);
    expect(dist(pt(a, 'E'), pt(b, 'E'))).toBeLessThan(1e-9);
  });
  it('two tangents (C7, ADR-AG-213): «המשיק בנקודה A והמשיק בנקודה C נפגשים בנקודה D» builds', () => {
    expect(verdict(['מעגל O', 'המשיק בנקודה A והמשיק בנקודה C נפגשים בנקודה D'])).toBe('record');
  });
  it('a tangent and a line-object: the tangent at A and the bisector of C', () => {
    const d = built(['מעגל O', 'A על המעגל', 'משולש BCD', 'המשיק בנקודה A וחוצה זוית C נפגשים בנקודה E'], 0);
    const [o, a, e] = ['O', 'A', 'E'].map((id) => pt(d, id));
    expect(Math.abs(dot(sub(e, a), sub(a, o))) / Math.max(1, len(sub(e, o))) ** 2).toBeLessThan(1e-5);
  });
});

describe('#1715 — refusals', () => {
  it('parallel lines are `unsatisfiable` — two named lines, and two perpendiculars to one side', () => {
    expect(verdict(['מלבן ABCD', 'הישר AB והישר CD נפגשים בנקודה E'])).toBe('refused:unsatisfiable');
    expect(verdict(['מלבן ABCD', 'האנך מ-A ל-BC', 'האנך מ-D ל-BC', 'האנך מ-A ל-BC והאנך מ-D ל-BC נפגשים בנקודה E'])).toBe('refused:unsatisfiable');
    expect(verdict(['מלבן ABCD', 'האנך האמצעי לצלע AB והאנך האמצעי לצלע AD נפגשים בנקודה E'])).toBe('record');
  });
  it('one object twice names no point — «חוצה זוית B וחוצה הזווית B», «הגובה מ-A והגובה מ-A»', () => {
    expect(verdict([TRI, 'חוצה זוית B וחוצה הזווית B נפגשים בנקודה E'])).toBe('refused:repeated-vertex');
    expect(verdict([TRI, 'הגובה מ-A והגובה מ-A נפגשים בנקודה E'])).toBe('refused:repeated-vertex');
  });
  it('a meet at a point the pair already has is the crossing-already-named refusal', () => {
    expect(verdict([TRI, 'הישר AB והישר BC נפגשים בנקודה E'])).toBe('refused:crossing-already-named');
  });
  it('a cevian named only by its side is not read in the frame — 2-D does not read it either', () => {
    expect(verdict([TRI, 'הגובה לצלע BC וחוצה זוית B נפגשים בנקודה E'])).toBe('refused:not-handled');
  });
});

describe('#1715 — the class reaches every frame that takes an operand', () => {
  it('«E על חוצה זוית B» puts E on the bisector ray, at 8 seeds', () => {
    for (const seed of SEEDS) {
      const d = built([TRI, 'E על חוצה זוית B'], seed);
      expect(ON['bisector of B'].at(d, pt(d, 'E'))).toBeLessThan(1e-5);
    }
  });
  it('«חוצה זוית B חותך את הגובה מ-A בנקודה E» is the meet', () => {
    const d = built([TRI, 'חוצה זוית B חותך את הגובה מ-A בנקודה E'], 0);
    expect(ON['bisector of B'].at(d, pt(d, 'E'))).toBeLessThan(1e-5);
    expect(ON['altitude from A'].at(d, pt(d, 'E'))).toBeLessThan(1e-5);
  });
});
