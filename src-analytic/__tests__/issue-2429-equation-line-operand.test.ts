/**
 * #2429 ([ADR-AG-328](../../docs/06c-decisions-analytic.md#adr-ag-328)) — a line given by its EQUATION is a line operand of
 * ∥, ⊥, a line through a point copying a direction, and the distance GIVEN; the operand line is drawn and named.
 *
 * Rulings: 2026-10-20 (*"2429 accept recommendations"*: ∥, ⊥ and «המרחק של A מהישר <eq>» accept a line given by its
 * equation, drawn and named under #2425); 2026-10-21 (*"2429 - no. dont accept"*: the distance ASK, slope, «מעל», the
 * perpendicular foot and the line–line distance keep refusing an equation operand); 2026-10-22, on T37 (*"we should
 * know from this, that m=2 and draw the line"*: the slope VALUE accepts one; the slope sign is not covered and stays). Measured before (main `37800b85`,
 * `decideSubmit`, no model call): every accepted row below was `bad-operand` (∥/⊥, the line through a point) or
 * `not-handled` (the distance given).
 *
 * Every row runs the student's entry point: `decideSubmit` per line, then `derive`.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit, type SubmitVerdict } from '../app/submit';
import { ask } from '../app/ask';
import { derive } from '../engine/derive';
import { fmtAnalytic } from '../format';
import q1 from './fixtures/exam-2379-q1-perpendicular-kl-2429.analytic.json';
import dist from './fixtures/issue-2429-distance-equation.analytic.json';

/** Submit every line but the last (each must record), and return the last line's verdict. */
function last(steps: readonly string[], seed = 0): { v: SubmitVerdict; held: string[] } {
  const held: string[] = [];
  for (const l of steps.slice(0, -1)) {
    const v = decideSubmit(l, held, seed);
    if (v.kind !== 'record') throw new Error(`«${l}» → ${v.kind}`);
    held.push(l);
  }
  return { v: decideSubmit(steps[steps.length - 1], held, seed), held };
}
/** Every line records, and the figure builds green; the derivation at `seed`. */
function built(steps: readonly string[], seed = 0) {
  const { v, held } = last(steps, seed);
  expect(v.kind, `«${steps[steps.length - 1]}» ${v.kind === 'refused' ? v.error.key : ''}`).toBe('record');
  const d = derive([...held, steps[steps.length - 1]], seed);
  expect(d.faults, steps.join(' · ')).toEqual([]);
  return d;
}
const key = (v: SubmitVerdict) => (v.kind === 'refused' ? `refused:${v.error.key}` : v.kind);
/** The drawn lines that carry a NAME (l, l1, l2…) — not a line through two points, a tangent or an unnamed line-at. */
const drawnLines = (d: ReturnType<typeof derive>) =>
  d.figure.curves.filter((c) => c.stated && c.curve.kind === 'line' && c.label.name !== '' && !/^[A-Z][0-9]?[A-Z][0-9]?$/.test(c.label.name)).map((c) => c.label.name);
const pt = (d: ReturnType<typeof derive>, id: string) => d.figure.points.find((p) => p.id === id)!;
const cross = (u: { x: number; y: number }, v: { x: number; y: number }) => u.x * v.y - u.y * v.x;
const dot = (u: { x: number; y: number }, v: { x: number; y: number }) => u.x * v.x + u.y * v.y;
const dirAB = (d: ReturnType<typeof derive>, a: string, b: string) => {
  const [p, q] = [pt(d, a), pt(d, b)];
  return { x: q.x - p.x, y: q.y - p.y };
};

const AB = ['נקודה A', 'נקודה B'];

describe('#2429 — ∥ and ⊥ with a line given by its equation (as object)', () => {
  const ROWS: ReadonlyArray<[string, 'par' | 'perp', { x: number; y: number }]> = [
    // the line 2x−y+3=0 has direction (1, 2); y=2x and y=2x+1 too
    ['הישר AB מקביל לישר 2x-y+3=0', 'par', { x: 1, y: 2 }],
    ['הישר AB מאונך לישר 2x-y+3=0', 'perp', { x: 1, y: 2 }],
    ['AB ∥ 2x-y+3=0', 'par', { x: 1, y: 2 }],
    ['AB ⊥ 2x-y+3=0', 'perp', { x: 1, y: 2 }],
    ['AB מקביל ל-y=2x', 'par', { x: 1, y: 2 }],
    ['the line AB is parallel to the line 2x-y+3=0', 'par', { x: 1, y: 2 }],
    ['AB is perpendicular to y=2x+1', 'perp', { x: 1, y: 2 }],
  ];
  it.each(ROWS)('«%s» records; the relation holds at every seed; the operand line is drawn and named l1', (line, rel, w) => {
    for (const seed of [0, 1, 2, 3]) {
      const d = built([...AB, line], seed);
      expect(drawnLines(d), `seed ${seed}`).toEqual(['l1']);
      const u = dirAB(d, 'A', 'B');
      const n = Math.hypot(u.x, u.y) * Math.hypot(w.x, w.y);
      expect(Math.abs(rel === 'par' ? cross(u, w) : dot(u, w)) / n, `seed ${seed}`).toBeLessThan(1e-6);
    }
  });
});

describe('#2429 — the equation as SUBJECT: exam Q1 ב(1), «הישר 4x+y+3=0 מאונך ל-KL»', () => {
  const upTo11 = q1.lines.slice(0, 11);
  it('the fixture records line by line and builds green', () => {
    built(q1.lines);
  });
  it.each([['הישר 4x+y+3=0 מאונך ל-KL'], ['הישר 4x+y+3=0 מאונך לישר KL'], ['the line 4x+y+3=0 is perpendicular to KL']])(
    '«%s»: the carrier from «M על הישר 4x+y+3=0» is PROMOTED — one object, now drawn and named l1, and M stays on it',
    (line) => {
      const before = derive(upTo11, 0);
      const carrier = before.construction.objects.filter((o) => o.kind === 'curve' && !o.stated);
      expect(carrier).toHaveLength(1);
      const d = built([...upTo11, line]);
      const eqLines = d.construction.objects.filter((o) => o.kind === 'curve' && o.id === carrier[0].id);
      expect(eqLines).toHaveLength(1);
      expect(drawnLines(d)).toEqual(['l1']);
      expect(d.construction.constraints.some((k) => k.t === 'on-curve' && k.id === 'M' && k.curve === carrier[0].id)).toBe(true);
    },
  );
  it('a WRONG line («4x−y+3=0») is refused as contradictory, naming the sentence', () => {
    const line = 'הישר 4x-y+3=0 מאונך ל-KL';
    const { v } = last([...upTo11, line]);
    expect(key(v)).toBe('refused:unsatisfiable');
    if (v.kind === 'refused') expect(v.error.detail).toBe(line);
  });
});

describe('#2429 — two equations in one sentence; a parameter pinned', () => {
  it('«הישר 2x-y+3=0 מקביל לישר y=2x»: both lines drawn, l1 and l2 in written order', () => {
    const d = built(['הישר 2x-y+3=0 מקביל לישר y=2x']);
    expect(drawnLines(d)).toEqual(['l1', 'l2']);
    expect(d.figure.curves.find((c) => c.label.name === 'l1')!.label.eqSrc).toBe('2x-y+3=0');
  });
  it('«הישר y=mx+1 מקביל לישר 2x-y+3=0» pins m = 2 at every seed', () => {
    for (const seed of [0, 1, 2, 3, 4, 5]) expect(built(['הישר y=mx+1 מקביל לישר 2x-y+3=0'], seed).figure.env.m).toBeCloseTo(2, 6);
  });
});

describe('#2429 — identity: a line the figure already has IS the operand', () => {
  it('a named line keeps its name: no second line, no l1', () => {
    const d = built(['נתון הישר l: 2x-y+3=0', ...AB, 'AB ∥ 2x-y+3=0']);
    expect(drawnLines(d)).toEqual(['l']);
    expect(d.construction.objects.filter((o) => o.kind === 'curve')).toHaveLength(1);
  });
  it('a declared unnamed line: still one line, l1', () => {
    const d = built(['נתון ישר 2x-y+3=0', ...AB, 'הישר AB מקביל לישר 2x-y+3=0']);
    expect(drawnLines(d)).toEqual(['l1']);
  });
  it('a scaled spelling of the same line is the same line', () => {
    const d = built(['נתון הישר l: 2x-y+3=0', ...AB, 'AB ∥ 4x-2y+6=0']);
    expect(drawnLines(d)).toEqual(['l']);
  });
  it('the same relation twice is «כבר ידוע»', () => {
    const { v } = last([...AB, 'AB ∥ 2x-y+3=0', 'AB ∥ 2x-y+3=0']);
    expect(v.kind).toBe('already-known');
  });
  it('«M על הישר 4x+y+3=0» alone still draws nothing (the #2423 ruling)', () => {
    const d = built(['נקודה M', 'M על הישר 4x+y+3=0']);
    expect(drawnLines(d)).toEqual([]);
  });
});

describe('#2429 — a line through a point copying the direction of a line given by its equation', () => {
  it.each([['ישר דרך A מקביל לישר y=2x'], ['דרך A עובר ישר מקביל לישר y=2x'], ['a line through A parallel to y=2x']])(
    '«%s» builds the line through A with slope 2; the operand line is drawn, l1; the new line stays unnamed',
    (line) => {
      const d = built(['A(1,2)', line]);
      expect(drawnLines(d)).toEqual(['l1']);
      const lineAt = d.construction.objects.find((o) => o.kind === 'line-at');
      expect(lineAt && lineAt.kind === 'line-at' && lineAt.name).toBeFalsy();
      const through = d.figure.curves.find((c) => c.id === lineAt!.id)!;
      expect(through.curve.kind).toBe('line');
      const l = through.curve as unknown as { a: number; b: number; c: number };
      // through A(1,2), and parallel to y = 2x: a·1 + b·2 + c = 0 and −a/b = 2
      expect(Math.abs(l.a * 1 + l.b * 2 + l.c)).toBeLessThan(1e-9);
      expect(-l.a / l.b).toBeCloseTo(2, 9);
    },
  );
  it('«ישר דרך A מאונך לישר y=2x»: slope −1/2', () => {
    const d = built(['A(1,2)', 'ישר דרך A מאונך לישר y=2x']);
    const lineAt = d.construction.objects.find((o) => o.kind === 'line-at')!;
    const l = d.figure.curves.find((c) => c.id === lineAt.id)!.curve as unknown as { a: number; b: number };
    expect(-l.a / l.b).toBeCloseTo(-0.5, 9);
  });
  it('stability: building it moves no existing point', () => {
    const before = derive(['A(1,2)', 'נקודה B'], 0).figure;
    const after = built(['A(1,2)', 'נקודה B', 'ישר דרך A מקביל לישר y=2x']).figure;
    for (const id of ['A', 'B']) {
      const [p, q] = [before.points.find((x) => x.id === id)!, after.points.find((x) => x.id === id)!];
      expect(q.x).toBeCloseTo(p.x, 9);
      expect(q.y).toBeCloseTo(p.y, 9);
    }
  });
});

describe('#2429 — the distance GIVEN to a line given by its equation', () => {
  it.each([
    ['המרחק של A מהישר 3x+4y=25 הוא 5'],
    ['המרחק בין הנקודה A לישר 3x+4y=25 הוא 5'],
    ['המרחק מ-A לישר 3x+4y=25 = 5'],
    ['המרחק של A מהישר 3x + 4y = 25 הוא 5'],
    ['המרחק של הישר 3x+4y=25 מ-A הוא 5'],
    ['the distance from A to the line 3x+4y=25 = 5'],
  ])('«%s»: A is at distance 5 from 3x+4y=25 at every seed; the line is drawn, l1', (line) => {
    for (const seed of [0, 1, 2, 3]) {
      const d = built(['נקודה A', line], seed);
      expect(drawnLines(d), `seed ${seed}`).toEqual(['l1']);
      const a = pt(d, 'A');
      expect(Math.abs(3 * a.x + 4 * a.y - 25) / 5, `seed ${seed}`).toBeCloseTo(5, 6);
    }
  });
  it('the fixture builds green', () => {
    built(dist.lines);
  });
  it('on a named line, the equation spelling refers to it: no second line', () => {
    const d = built(['נתון הישר l: 3x+4y=25', 'נקודה A', 'המרחק של A מהישר 3x+4y=25 הוא 5']);
    expect(drawnLines(d)).toEqual(['l']);
  });
  it('a later rename («נתון הישר l5: 3x+4y=25», R187) does not strand the term: the line is l5 and the distance still holds', () => {
    for (const seed of [0, 1, 2]) {
      const d = built(['נקודה A', 'המרחק של A מהישר 3x+4y=25 הוא 5', 'נתון הישר l5: 3x+4y=25'], seed);
      expect(drawnLines(d)).toEqual(['l5']);
      const a = pt(d, 'A');
      expect(Math.abs(3 * a.x + 4 * a.y - 25) / 5).toBeCloseTo(5, 6);
    }
  });
  it('the applied term holds the resolved line by ID, its equation stripped (a later rename cannot strand it)', () => {
    const d = built(['נקודה A', 'המרחק של A מהישר 3x+4y=25 הוא 5']);
    const id = d.figure.curves.find((c) => c.label.name === 'l1')!.id;
    const k = d.construction.constraints.find((c) => c.t === 'length-eq');
    const term = k && k.t === 'length-eq' ? k.left.terms[0] : null;
    expect(term).toMatchObject({ kind: 'point-line', p: 'A', curve: id });
    expect(term && 'eq' in term).toBe(false);
  });
});

describe('#2429 — the slope given to a line given by its equation (ruling 2026-10-22, ADR-AG-328 Am. 1)', () => {
  /** The line l1's slope and y-intercept, from its drawn coefficients. */
  const l1 = (d: ReturnType<typeof derive>) => {
    const l = d.figure.curves.find((c) => c.label.name === 'l1')!.curve as unknown as { a: number; b: number; c: number };
    return { slope: -l.a / l.b, intercept: -l.c / l.b };
  };
  it('the play case, exactly: «A(1,2)» · «שיפוע הישר y=mx+1 הוא 2» → m = 2; y = 2x + 1 is drawn and named l1', () => {
    const d = built(['A(1,2)', 'שיפוע הישר y=mx+1 הוא 2']);
    expect(d.figure.env.m).toBeCloseTo(2, 9);
    expect(drawnLines(d)).toEqual(['l1']);
    expect(d.figure.curves.find((c) => c.label.name === 'l1')!.label.eqSrc).toBe('y=mx+1');
    expect(l1(d).slope).toBeCloseTo(2, 9);
    expect(l1(d).intercept).toBeCloseTo(1, 9);
  });
  it('the parameter pin holds at every one of 24 seeds', () => {
    for (let seed = 0; seed < 24; seed++) {
      const d = built(['A(1,2)', 'שיפוע הישר y=mx+1 הוא 2'], seed);
      expect(d.figure.env.m, `seed ${seed}`).toBeCloseTo(2, 6);
      expect(l1(d).slope, `seed ${seed}`).toBeCloseTo(2, 6);
      expect(l1(d).intercept, `seed ${seed}`).toBeCloseTo(1, 6);
    }
  });
  it.each([
    ['שיפוע הישר y=mx+1 הוא 2'],
    ['השיפוע של הישר y=mx+1 הוא 2'],
    ['שיפוע y=mx+1 הוא 2'],
    ['שיפוע הישר y = mx + 1 שווה ל-2'],
    ['the slope of the line y=mx+1 is 2'],
    ['the slope of y=mx+1 is 2'],
  ])('«%s» pins m = 2 and draws l1 (the spellings the named-line slope reads)', (line) => {
    const d = built([line]);
    expect(d.figure.env.m).toBeCloseTo(2, 9);
    expect(drawnLines(d)).toEqual(['l1']);
  });
  it('on a named line, the equation spelling refers to it: no second line', () => {
    const d = built(['נתון הישר l: y=mx+1', 'שיפוע הישר y=mx+1 הוא 2']);
    expect(d.figure.env.m).toBeCloseTo(2, 9);
    expect(drawnLines(d)).toEqual(['l']);
  });
  it('the same slope twice is «כבר ידוע»', () => {
    expect(last(['שיפוע הישר y=mx+1 הוא 2', 'שיפוע הישר y=mx+1 הוא 2']).v.kind).toBe('already-known');
  });
  it('a slope that contradicts the equation is refused, nothing drawn', () => {
    expect(key(last(['A(1,2)', 'שיפוע הישר y=2x+1 הוא 3']).v)).toBe('refused:unsatisfiable');
  });
  it('stability: stating it moves no existing point', () => {
    const before = derive(['A(1,2)', 'נקודה B'], 0).figure;
    const after = built(['A(1,2)', 'נקודה B', 'שיפוע הישר y=mx+1 הוא 2']).figure;
    for (const id of ['A', 'B']) {
      const [p, q] = [before.points.find((x) => x.id === id)!, after.points.find((x) => x.id === id)!];
      expect(q.x).toBeCloseTo(p.x, 9);
      expect(q.y).toBeCloseTo(p.y, 9);
    }
  });
});

describe('#2429 — what stays refused (the 2026-10-21 ruling; the slope SIGN is not covered by 2026-10-22)', () => {
  it.each([
    [['A(1,2)', 'שיפוע הישר y=mx+1 חיובי'], 'refused:bad-operand'],
    [['A(1,2)', 'שיפוע הישר x^2+y^2=9 הוא 2'], 'refused:bad-operand'],
    [['A(1,2)', 'A מעל הישר y=2x'], 'refused:bad-operand'],
    [['A(1,2)', 'האנך מ-A לישר y=2x'], 'refused:bad-operand'],
    [['המרחק בין הישר 3x+4y=0 לישר 3x+4y=25 הוא 5'], 'refused:not-handled'],
    // a circle's equation is no direction
    [[...AB, 'AB ∥ x^2+y^2=9'], 'refused:bad-operand'],
    [[...AB, 'הישר AB מאונך לישר (x-1)^2+y^2=4'], 'refused:bad-operand'],
  ])('%j → %s', (steps, want) => {
    expect(key(last(steps).v)).toBe(want);
  });
  it('the distance ASK with an equation stays unanswered (no value), while the named line answers', () => {
    const d = derive(['A(1,2)'], 0);
    expect(ask(d, 'המרחק של A מהישר 3x+4y=25', fmtAnalytic).value).toBeFalsy();
    const named = derive(['A(1,2)', 'נתון הישר l: 3x+4y=25'], 0);
    expect(ask(named, 'המרחק של A מהישר l', fmtAnalytic).value).toBe('14/5');
  });
});
