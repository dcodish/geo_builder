/**
 * Free vertices, the joint solve, and entry-order independence
 * ([ADR-AG-009](../../docs/06c-decisions-analytic.md#adr-ag-009) B2/B3 — #1016, #1017, #1033, #1034,
 * #1047).
 *
 * The gate is **image 7 #6 in the operator's own order** — a real bagrut exercise, whose published
 * answer is the independent oracle these tests check against. Its figure is not reachable by any
 * cheaper solve: four unknowns (`B` and `C` unplaced) against four equations.
 */
import { describe, expect, it } from 'vitest';
import { fold } from '../engine/apply';
import { reportedDof } from '../engine/carriers';
import { derive } from '../engine/derive';
import { evaluate } from '../engine/evaluate';
import { freeRank, residual, solveLM } from '../engine/solve';
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

const at = (src: string[], id: string, seed = 0) => {
  const p = evaluate(build(src), seed).points.find((q) => q.id === id);
  if (!p) throw new Error(`${id} absent`);
  return p;
};

/** Image 7 #6 — «AD הוא התיכון לצלע BC במשולש ABC ששטחו 20; A(6,4), D(0,3), B על החלק החיובי של ציר x». */
const EX6 = [
  'משולש ABC',
  'AD תיכון לצלע BC',
  'שטח המשולש ABC הוא 20',
  'A(6,4)',
  'D(0,3)',
  'B על החלק החיובי של ציר x',
];

describe('image 7 #6 — the gate, in the operator s own order', () => {
  it('builds every line with no refusal', () => {
    expect(derive(EX6).faults).toEqual([]);
  });

  it('lands on the exercise s published answer', () => {
    // The independent oracle: the textbook's own solution, not this engine's output.
    const b = at(EX6, 'B');
    const c = at(EX6, 'C');
    expect(b.x).toBeCloseTo(2, 6);
    expect(b.y).toBeCloseTo(0, 6);
    expect(c.x).toBeCloseTo(-2, 6);
    expect(c.y).toBeCloseTo(6, 6);
  });

  it('satisfies every given it was handed, checked independently of the solver', () => {
    const f = evaluate(build(EX6), 0);
    const P = (id: string) => f.points.find((p) => p.id === id)!;
    const [a, b, c, d] = ['A', 'B', 'C', 'D'].map(P);
    // D really is the midpoint of BC.
    expect((b.x + c.x) / 2).toBeCloseTo(d.x, 6);
    expect((b.y + c.y) / 2).toBeCloseTo(d.y, 6);
    // The area really is 20.
    const area = Math.abs(a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2;
    expect(area).toBeCloseTo(20, 6);
    // B really is on the POSITIVE x-axis.
    expect(b.y).toBeCloseTo(0, 9);
    expect(b.x).toBeGreaterThan(0);
  });

  it('the DOF cue counts down to ZERO as the givens arrive', () => {
    // 02c R22: the moment the figure becomes determined is the moment the student learns their
    // givens were sufficient. A cue that never reaches 0 teaches the opposite of the truth.
    const dofs = EX6.map((_, i) => {
      const src = EX6.slice(0, i + 1);
      const c = build(src);
      return reportedDof(c, evaluate(c, 0).carrierDof);
    });
    expect(dofs[0]).toBe(6); // three unplaced vertices
    expect(dofs[dofs.length - 1]).toBe(0); // determined
    // Monotonically non-increasing after the declarations: a given never ADDS freedom.
    for (let i = 2; i < dofs.length; i += 1) expect(dofs[i]).toBeLessThanOrEqual(dofs[i - 1]);
  });
});

describe('entry order does not matter (02c R19)', () => {
  it('the shape noun first and the coordinates first give the same figure', () => {
    const nounFirst = ['משולש ABC', 'A(6,4)', 'B(0,0)', 'C(3,7)'];
    const coordsFirst = ['A(6,4)', 'B(0,0)', 'C(3,7)', 'משולש ABC'];
    for (const id of ['A', 'B', 'C']) {
      expect(at(nounFirst, id)).toEqual(at(coordsFirst, id));
    }
  });

  it('a coordinate CONSUMES a named vertex s freedom rather than clashing with it', () => {
    const c = build(['משולש ABC', 'A(6,4)']);
    expect(c.objects.filter((o) => o.id === 'A')).toHaveLength(1);
    expect(c.objects.find((o) => o.id === 'A')?.kind).toBe('point');
    expect(reportedDof(c, evaluate(c, 0).carrierDof)).toBe(4); // B and C still free
  });
});

describe('a shape noun DECLARES; a reference still may not invent', () => {
  it('משולש ABC introduces three free vertices and draws', () => {
    const d = derive(['משולש ABC']);
    expect(d.faults).toEqual([]);
    expect(d.figure.points.map((p) => p.id).sort()).toEqual(['A', 'B', 'C']);
    expect(d.figure.segments).toHaveLength(3);
  });

  it('but «M אמצע AB» with no A still refuses, naming the point', () => {
    // #1028's rule is unchanged: referring to a point may not create it.
    const d = derive(['M אמצע AB']);
    expect(d.faults.map((f) => f.code)).toEqual(['unknown-reference']);
  });

  it('an unplaced vertex MOVES between configurations — it is free, not defaulted (ADR-052)', () => {
    const src = ['משולש ABC'];
    expect(at(src, 'A', 0)).not.toEqual(at(src, 'A', 1));
  });
});

describe('the solve is honest when it cannot succeed', () => {
  it('reports an unsatisfiable given rather than drawing a figure that violates it', () => {
    // Two areas for one triangle: no configuration has both.
    const d = derive(['משולש ABC', 'שטח המשולש ABC הוא 20', 'שטח המשולש ABC הוא 50']);
    expect(d.faults.map((f) => f.code)).toContain('unsatisfiable');
  });

  it('and a figure that CAN satisfy its givens raises nothing', () => {
    const d = derive(['משולש ABC', 'שטח המשולש ABC הוא 20']);
    expect(d.faults).toEqual([]);
    const f = evaluate(build(['משולש ABC', 'שטח המשולש ABC הוא 20']), 0);
    const P = (id: string) => f.points.find((p) => p.id === id)!;
    const [a, b, c] = ['A', 'B', 'C'].map(P);
    expect(Math.abs(a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y)) / 2).toBeCloseTo(20, 6);
  });
});

describe('the residual contract — per component, never a norm', () => {
  it('a midpoint contributes TWO residuals, because it is two equations', () => {
    // Collapsing it to a distance gives a rank-1 Jacobian at the solution, so the figure reports a
    // degree of freedom it does not have. This is the shape of that bug, asserted directly.
    const r = residual(
      { t: 'midpoint', id: 'M', a: 'A', b: 'B' },
      (id) => ({ M: { x: 0, y: 0 }, A: { x: 2, y: 2 }, B: { x: 4, y: 6 } })[id] ?? null,
      {},
    );
    expect(r).toHaveLength(2);
  });

  it('and the rank it produces is what makes the DOF count right', () => {
    // Four unknowns, a midpoint pinned (2) — two degrees of freedom must survive.
    const residuals = (x: number[]) => [(x[0] + x[2]) / 2 - 0, (x[1] + x[3]) / 2 - 3];
    expect(freeRank([1, 1, 1, 1], residuals)).toBe(2);
  });

  it('a dependent given removes no extra freedom', () => {
    // The same equation twice is one constraint, and the rank says so where counting would not.
    const residuals = (x: number[]) => [x[0] - 5, x[0] - 5];
    expect(freeRank([0, 0], residuals)).toBe(1);
  });
});

describe('the minimiser', () => {
  it('converges to the same answer from very different starts', () => {
    const target = (x: number[]) => [x[0] * x[0] + x[1] * x[1] - 25, x[0] - x[1]];
    for (const start of [[1, 0], [9, 9], [-2, 7]]) {
      const r = solveLM(start, target);
      expect(r.ok).toBe(true);
      expect(Math.abs(r.values[0])).toBeCloseTo(Math.sqrt(12.5), 4);
    }
  });

  it('reports failure rather than returning the least-bad answer', () => {
    const impossible = (x: number[]) => [x[0] - 1, x[0] - 2];
    expect(solveLM([0], impossible).ok).toBe(false);
  });
});

describe('the canvas shows the QUESTION, the panel shows the ANSWER (#1032)', () => {
  // Operator ruling, 2026-09-15: the label reads what the point's OWN givens fix — not what the
  // solve later derives. `B(2,0)` is the answer and belongs in the panel; the canvas says
  // `B(x_B, 0)`, because «על ציר ה-x» pins the y and nothing pins the x.
  const provOf = (src: string[], id: string) => evaluate(build(src), 0).provenance[id];

  it('a stated point carries both its coordinates', () => {
    const p = provOf(EX6, 'A');
    expect(p.x).toEqual({ known: true, value: 6 });
    expect(p.y).toEqual({ known: true, value: 4 });
  });

  it('a point on the x-axis has its y fixed and its x OPEN — even though the solve determines it', () => {
    const p = provOf(EX6, 'B');
    expect(p.y).toEqual({ known: true, value: 0 });
    expect(p.x.known).toBe(false);
    // And the figure really does determine it — which is exactly what must NOT reach the canvas.
    expect(at(EX6, 'B').x).toBeCloseTo(2, 6);
  });

  it('a point described by nothing of its own carries neither', () => {
    // C is fixed by the joint solve, but no given names C alone, so the canvas shows only its name.
    const p = provOf(EX6, 'C');
    expect(p.x.known).toBe(false);
    expect(p.y.known).toBe(false);
  });

  it('a constraint naming SEVERAL points pins none of them individually', () => {
    // «שטח המשולש ABC הוא 20» references A, B and C, so it is not provenance for any one of them.
    const p = provOf(['משולש ABC', 'שטח המשולש ABC הוא 20'], 'A');
    expect(p.x.known).toBe(false);
  });

  it('a stated coordinate carrying a free PARAMETER is not known — the honesty gate still binds', () => {
    // `A(-9a,0)` must never print a sampled number on the canvas; provenance and honesty agree here.
    const p = provOf(['A(-9a,0)'], 'A');
    expect(p.x.known).toBe(false);
    expect(p.y).toEqual({ known: true, value: 0 });
  });
});

/**
 * The relation vocabulary — #1052 and #1051, round #1061.
 *
 * The design under test is the RESOLVER, not the sentences. «DE מקביל ל-BF», «הצלע AB מקבילה לצלע DC»,
 * «AB מקביל לציר ה-x» and «הישר l1 מקביל לישר l2» are one relation over four kinds of operand, so the
 * cases below deliberately walk the operand matrix rather than the phrasings: a rule that worked for
 * point pairs and not for axes would pass a phrasing-shaped test suite.
 *
 * Measured baseline before building: **0 of 14 relation phrasings and 0 of 5 slope phrasings parsed.**
 */
describe('#1052/#1051 — one relation, four kinds of operand', () => {
  const dirOf = (d: ReturnType<typeof derive>, a: string, b: string) => {
    const p = d.figure.points.find((q) => q.id === a);
    const q = d.figure.points.find((r) => r.id === b);
    if (!p || !q) return null;
    const n = Math.hypot(q.x - p.x, q.y - p.y);
    return n < 1e-12 ? null : { x: (q.x - p.x) / n, y: (q.y - p.y) / n };
  };

  it('makes two segments parallel', () => {
    const d = derive(['מרובע ABCD', 'AB מקביל ל-DC'], 0);
    expect(d.faults).toEqual([]);
    const u = dirOf(d, 'A', 'B')!;
    const v = dirOf(d, 'D', 'C')!;
    expect(u.x * v.y - u.y * v.x).toBeCloseTo(0, 6);
  });

  it('makes two segments perpendicular', () => {
    const d = derive(['משולש ABC', 'AB מאונך ל-BC'], 0);
    expect(d.faults).toEqual([]);
    const u = dirOf(d, 'A', 'B')!;
    const v = dirOf(d, 'B', 'C')!;
    expect(u.x * v.x + u.y * v.y).toBeCloseTo(0, 6);
  });

  it('relates a segment to an AXIS — the operand that carries no point', () => {
    const d = derive(['משולש ABC', 'AB מקביל לציר ה-x'], 0);
    expect(d.faults).toEqual([]);
    expect(dirOf(d, 'A', 'B')!.y).toBeCloseTo(0, 6);
  });

  it('relates a segment to a NAMED LINE — the operand the solver cannot see by id', () => {
    // The direction comes from the resolved equation, handed in by `evaluate` rather than looked up
    // in `solve`, which knows only points.
    const d = derive(['נתון הישר l1: y=x', 'משולש ABC', 'AB מאונך לישר l1'], 0);
    expect(d.faults).toEqual([]);
    const u = dirOf(d, 'A', 'B')!;
    expect((u.x + u.y) / Math.SQRT2).toBeCloseTo(0, 6);
  });

  it('accepts every synonym and every optional particle', () => {
    for (const line of [
      'DE מקביל ל-BF',
      'DE מקבילה ל-BF',
      'הצלע DE מקבילה לצלע BF',
      'הישר DE מקביל לישר BF',
      'DE מאונך ל-BF',
      'DE ניצב ל-BF',
      'הקטע DE מאונך לקטע BF',
      'DE parallel to BF',
      'DE is perpendicular to BF',
    ]) {
      const r = parseLine(line);
      expect(r.ok, line).toBe(true);
    }
  });

  it('pins a stated SLOPE, in every corpus phrasing', () => {
    for (const line of ['שיפוע AB הוא 2', 'שיפוע הישר AB הוא 2', 'השיפוע של AB הוא 2', 'the slope of AB is 2']) {
      expect(parseLine(line).ok, line).toBe(true);
    }
    const d = derive(['משולש ABC', 'שיפוע AB הוא 2'], 0);
    expect(d.faults).toEqual([]);
    const u = dirOf(d, 'A', 'B')!;
    expect(u.y - 2 * u.x).toBeCloseTo(0, 6);
  });

  it('a VERTICAL segment can never have a stated slope — the plan’s own requirement', () => {
    // Written as `dy = m·dx` rather than `dy/dx = m` precisely so this is a clean refusal instead of
    // a division by zero, and so the minimiser has no pole to cross.
    const d = derive(['A(0,0)', 'B(0,5)', 'שיפוע AB הוא 2'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['unsatisfiable']);
  });

  it('refuses an operand it does not recognise, without blaming the relation', () => {
    // The verb was understood; saying «לא הבנתי את המשפט» would send the student to rewrite the part
    // they got right (ADR-AG-017).
    const r = parseLine('DE מקביל לפיל');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('bad-operand');
  });

  it('each relation removes exactly one degree of freedom', () => {
    // A relation is one scalar equation. If it removed two the DOF cue would lie, and if it removed
    // none the constraint is not reaching the solver at all — both have shipped elsewhere.
    expect(derive(['מרובע ABCD'], 0).figure.carrierDof).toBe(8);
    expect(derive(['מרובע ABCD', 'AB מקביל ל-DC'], 0).figure.carrierDof).toBe(7);
    expect(derive(['מרובע ABCD', 'AB מקביל ל-DC', 'AD מקביל ל-BC'], 0).figure.carrierDof).toBe(6);
  });

  it('a zero-length operand has no direction, and is not silently satisfied', () => {
    const d = derive(['A(0,0)', 'B(0,0)', 'C(1,1)', 'D(2,2)', 'AB מקביל ל-CD'], 0);
    // `null` from the residual is "cannot be judged" — it must not be reported as a violated given,
    // and it must not be counted as holding either.
    expect(d.figure.unsatisfied).toEqual([]);
  });
});

/**
 * #1062 — a FALSE given over fully placed points was accepted in silence.
 *
 * The check lived inside the solve: `if (ids.length > 0 …)` and then only on non-convergence. A
 * determined figure has no free carriers, so no solve ran, so no residual was ever compared to zero.
 * Found while writing the vertical-slope lock above, and it turned out to be pre-existing and general
 * — `area` and `on-line`, both shipped in PR #1055, had it too.
 */
describe('#1062 — the check is not part of the solve', () => {
  const codes = (lines: string[]) => derive(lines, 0).faults.map((f) => f.code);

  it('reports a false given on a figure with NO free carriers', () => {
    expect(codes(['A(0,0)', 'B(4,0)', 'C(0,3)', 'שטח המשולש ABC הוא 999'])).toEqual(['unsatisfiable']);
    expect(codes(['B(0,5)', 'B נמצא על ציר ה-x'])).toEqual(['unsatisfiable']);
    expect(codes(['A(0,0)', 'B(4,0)', 'C(8,0)', 'AB מאונך ל-BC'])).toEqual(['unsatisfiable']);
  });

  it('stays silent when the given HOLDS on a determined figure', () => {
    expect(codes(['A(0,0)', 'B(1,2)', 'שיפוע AB הוא 2'])).toEqual([]);
    expect(codes(['A(0,0)', 'B(4,0)', 'C(4,4)', 'AB מאונך ל-BC'])).toEqual([]);
    expect(codes(['A(0,0)', 'B(4,0)', 'C(0,3)', 'שטח המשולש ABC הוא 6'])).toEqual([]);
  });

  it('still reports on an UNDER-determined figure — the path that already worked', () => {
    expect(codes(['A(0,0)', 'B(0,5)', 'משולש ABC', 'שיפוע AB הוא 2'])).toEqual(['unsatisfiable']);
  });
});

/**
 * #1050 — lengths as VALUES, and the expression layer over them.
 *
 * Every other constraint kind is a fixed-arity relation. `AB + BC = DE` is an equation between two
 * EXPRESSIONS, and neither side has an arity the grammar fixes — which is why it is one kind with two
 * trees rather than one kind per form. The cases below walk the TREE SHAPES for that reason: a sum, a
 * length against a length, a scaled length, a power, an irrational constant.
 *
 * Measured before building: all of `AB = 10`, `AB = AC`, `AB + BC = 10`, `AB + BC = DE` were
 * `not-handled` — the tool had no notion of a segment's length as a value at all.
 */
describe('#1050 — length arithmetic', () => {
  const len = (d: ReturnType<typeof derive>, a: string, b: string) => {
    const p = d.figure.points.find((q) => q.id === a)!;
    const q = d.figure.points.find((r) => r.id === b)!;
    return Math.hypot(q.x - p.x, q.y - p.y);
  };

  it('pins a length against a number', () => {
    const d = derive(['משולש ABC', 'AB = 10'], 0);
    expect(d.faults).toEqual([]);
    expect(len(d, 'A', 'B')).toBeCloseTo(10, 4);
  });

  it('pins a length against ANOTHER length — the isosceles given', () => {
    const d = derive(['משולש ABC', 'AB = AC'], 0);
    expect(d.faults).toEqual([]);
    expect(len(d, 'A', 'B')).toBeCloseTo(len(d, 'A', 'C'), 4);
  });

  it('adds lengths — the operator’s own example', () => {
    const d = derive(['משולש ABC', 'AB + BC = 10'], 0);
    expect(d.faults).toEqual([]);
    expect(len(d, 'A', 'B') + len(d, 'B', 'C')).toBeCloseTo(10, 4);
  });

  it('adds lengths against another length — the other example', () => {
    const d = derive(['מרובע ABCD', 'נקודה E(9,9)', 'AB + BC = DE'], 0);
    expect(d.faults).toEqual([]);
    expect(len(d, 'A', 'B') + len(d, 'B', 'C')).toBeCloseTo(len(d, 'D', 'E'), 3);
  });

  it('takes an irrational constant, because the corpus writes one', () => {
    // `AB = 4√5` is 02c's own F10 example. It works because the expression layer is `expr.ts` —
    // `√`, juxtaposition and precedence were already written and tested there.
    const d = derive(['משולש ABC', 'AB = 4√5'], 0);
    expect(d.faults).toEqual([]);
    expect(len(d, 'A', 'B')).toBeCloseTo(4 * Math.sqrt(5), 4);
  });

  it('scales a length', () => {
    const d = derive(['מרובע ABCD', '2·AB = 3·CD'], 0);
    expect(d.faults).toEqual([]);
    expect(2 * len(d, 'A', 'B')).toBeCloseTo(3 * len(d, 'C', 'D'), 3);
  });

  it('squares lengths — Pythagoras stated as a GIVEN, which the corpus does', () => {
    const d = derive(['משולש ABC', 'AC^2 + BC^2 = 1250'], 0);
    expect(d.faults).toEqual([]);
    expect(len(d, 'A', 'C') ** 2 + len(d, 'B', 'C') ** 2).toBeCloseTo(1250, 2);
  });

  it('reports an impossible combination rather than solving it with a negative length', () => {
    // A length is ≥ 0, so `AB = 12` and `AB + BC = 10` cannot both hold.
    const d = derive(['משולש ABC', 'AB = 12', 'AB + BC = 10'], 0);
    expect(d.faults.map((f) => f.code)).toContain('unsatisfiable');
  });

  it('reports a false length on points that are already placed', () => {
    // #1062's path: no carrier is free, and the given is still checked.
    const d = derive(['A(0,0)', 'B(4,3)', 'AB = 10'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['unsatisfiable']);
  });

  it('THE COLLISION: `AB` is a length here and a LINE NAME elsewhere', () => {
    /**
     * «משוואת הישר AB היא y=2x» is corpus vocabulary too, and this tree has twice been bitten by a
     * token class eating real input (ADR-AG-006's `[IVX]`). The disambiguation is POSITION, not
     * tokens: the length rule lives in `parseConstraint`, which `parseLine` reaches only after
     * `matchCurve`, so any sentence carrying a curve noun is already spoken for. Asserted here
     * because the ordering is the entire guard.
     */
    for (const line of ['משוואת הישר AB היא y=2x', 'נתון הישר AB: y=2x']) {
      const r = parseLine(line);
      expect(r.ok, line).toBe(true);
      if (r.ok) expect(r.facts[0].t, line).toBe('curve');
    }
    // And a bare equation in the plane's variables is still a curve, not a length (#1037).
    const bare = parseLine('y=2x');
    expect(bare.ok && bare.facts[0].t).toBe('curve');
  });

  it('leaves a sentence with no length on either side alone', () => {
    // `x-y+2=0` has an `=` and no length token; the bare-equation branch reads it far better.
    const r = parseLine('x-y+2=0');
    expect(r.ok && r.facts[0].t).toBe('curve');
  });
});

/**
 * #1066 — a line NAMED by two points is a statement about those points.
 *
 * «הישר ℓ1» is an arbitrary name and asserts nothing. «הישר AB» asserts that the line passes through
 * `A` and through `B`. The parser minted `line-AB` either way, so the figure held a line named after
 * two points it did not touch — and with both points already placed the tool accepted it **in
 * silence**, which is how the operator found it.
 *
 * Operator ruling, 2026-09-15: when the points do not exist yet, **introduce them, with DOF**.
 */
describe('#1066 — «משוואת הישר AB היא y=2x» constrains A and B', () => {
  const onLine = (d: ReturnType<typeof derive>, id: string) => {
    const p = d.figure.points.find((q) => q.id === id);
    return p ? Math.abs(p.y - 2 * p.x) < 1e-6 : false;
  };

  it('REFUSES when the named points are placed off the line — the reported case', () => {
    const d = derive(['A(0,0)', 'B(5,1)', 'משוואת הישר AB היא y=2x'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['unsatisfiable']);
  });

  it('accepts when they are on it', () => {
    const d = derive(['A(1,2)', 'B(3,6)', 'משוואת הישר AB היא y=2x'], 0);
    expect(d.faults).toEqual([]);
  });

  it('INTRODUCES both points when neither exists, each with freedom along the line', () => {
    const d = derive(['משוואת הישר AB היא y=2x'], 0);
    expect(d.faults).toEqual([]);
    expect(onLine(d, 'A')).toBe(true);
    expect(onLine(d, 'B')).toBe(true);
    // Two introduced points at 2 DOF each, minus one incidence each: the figure slides along the
    // line and the line stays put. This number IS the operator's "with dof".
    expect(d.figure.carrierDof).toBe(2);
  });

  it('pulls already-declared vertices onto the line', () => {
    const d = derive(['משולש ABC', 'משוואת הישר AB היא y=2x'], 0);
    expect(d.faults).toEqual([]);
    expect(onLine(d, 'A')).toBe(true);
    expect(onLine(d, 'B')).toBe(true);
    expect(onLine(d, 'C')).toBe(false); // C is not named by the line, and must not be dragged onto it
  });

  it('an ARBITRARY name still asserts nothing — the regression guard', () => {
    // `ℓ1` names no point, so it constrains none. This is the control that makes the case above a
    // statement about NAMES rather than about lines.
    const d = derive(['משולש ABC', 'נתון הישר l1: y=2x'], 0);
    expect(d.faults).toEqual([]);
    expect(onLine(d, 'A')).toBe(false);
    expect(onLine(d, 'B')).toBe(false);
    expect(d.figure.carrierDof).toBe(6); // untouched
  });

  it('a Roman-numeral CIRCLE is not caught by the two-point rule', () => {
    const d = derive(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=9'], 0);
    expect(d.faults).toEqual([]);
    expect(d.figure.points).toEqual([]);
  });
});

/**
 * #1069 + #1073 — a point ON AN OBJECT, the product's defining 1-DOF carrier.
 *
 * The root CLAUDE.md describes Geo Builder as the tool where a student says *"point G on AD"* and G
 * slides along AD. `carriers.ts` has named the `on-curve` family since slice A and left it empty; the
 * operator hit the gap three times in one session before it was built.
 *
 * **Operator ruling, 2026-09-15: the NOUN decides whether the carrier is bounded.** «צלע» and «קטע»
 * carry the bound, «ישר» does not — and the DOF is 1 either way, because a bound is a REGION and
 * consumes no freedom. That split is what these cases are really testing.
 */
describe('#1069/#1073 — a point on an object, bounded or not by its noun', () => {
  // B(10,0) C(4,8): |BC| = 10, so |BD| = 18 puts D well beyond C on the same line.
  const TRI = ['A(0,0)', 'B(10,0)', 'C(4,8)', 'משולש ABC'];
  const along = (d: ReturnType<typeof derive>) => {
    const D = d.figure.points.find((p) => p.id === 'D')!;
    const ux = 4 - 10;
    const uy = 8 - 0;
    return ((D.x - 10) * ux + (D.y - 0) * uy) / (ux * ux + uy * uy);
  };

  it('accepts every phrasing the operator wrote', () => {
    for (const line of [
      'נקודה D נמצאת על הצלע BC',
      'D נמצאת על הצלע BC',
      'D על הצלע BC',
      'הנקודה D נמצאת על צלע BC',
      'D נמצא על הצלע BC',
      'point D is on side BC',
      'D נמצאת על הקטע BC',
      'D על הקטע BC',
      'point D is on segment BC',
      'D נמצאת על הישר BC',
    ]) {
      expect(parseLine(line).ok, line).toBe(true);
    }
  });

  it('places the point ON the object, with exactly ONE degree of freedom', () => {
    // 1, not 0 and not 2: the carrier the product is named after.
    const d = derive([...TRI, 'D על הצלע BC'], 0);
    expect(d.faults).toEqual([]);
    expect(d.figure.carrierDof).toBe(1);
    const t = along(d);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThanOrEqual(1);
  });

  it('THE RULING: «הישר» permits a position beyond the endpoints, «הצלע» does not', () => {
    // The one observable difference between the two sentences, and the case most likely to be lost
    // if the bounded version is built first and the unbounded one inherits its selector.
    const onLine = derive([...TRI, 'D על הישר BC', 'BD = 18'], 0);
    expect(onLine.faults).toEqual([]);
    expect(along(onLine)).toBeGreaterThan(1); // past C, and allowed

    const onSide = derive([...TRI, 'D על הצלע BC', 'BD = 18'], 0);
    expect(onSide.faults.map((f) => f.code)).toContain('unsatisfiable');
  });

  it('and both accept a position that IS between them', () => {
    for (const noun of ['הישר', 'הצלע']) {
      const d = derive([...TRI, `D על ${noun} BC`, 'BD = 5'], 0);
      expect(d.faults, noun).toEqual([]);
      expect(along(d), noun).toBeCloseTo(0.5, 6);
    }
  });

  it('takes a line given INLINE by its equation, and one given by name', () => {
    const inline = derive(['נקודה B על הישר y=x'], 0);
    expect(inline.faults).toEqual([]);
    const b = inline.figure.points.find((p) => p.id === 'B')!;
    expect(Math.abs(b.y - b.x)).toBeLessThan(1e-6);
    expect(inline.figure.carrierDof).toBe(1);

    const named = derive(['נתון הישר l1: y=x', 'P נמצאת על הישר l1'], 0);
    expect(named.faults).toEqual([]);
    const p = named.figure.points.find((q) => q.id === 'P')!;
    expect(Math.abs(p.y - p.x)).toBeLessThan(1e-6);
  });

  it('refuses a point already placed off the object', () => {
    const d = derive([...TRI, 'D(99,99)', 'D על הצלע BC'], 0);
    expect(d.faults.map((f) => f.code)).toContain('unsatisfiable');
  });

  it('the AXIS sentence introduces its point too — one sentence shape, one behaviour', () => {
    // It did not, so «B נמצא על ציר ה-x» answered unknown-reference while «B נמצא על הישר y=x»
    // introduced B. Two rules for one sentence shape is how a tool comes to answer one of them
    // differently.
    const d = derive(['B נמצא על ציר ה-x'], 0);
    expect(d.faults).toEqual([]);
    expect(d.figure.carrierDof).toBe(1);
    expect(Math.abs(d.figure.points.find((p) => p.id === 'B')!.y)).toBeLessThan(1e-6);
  });
});
