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
