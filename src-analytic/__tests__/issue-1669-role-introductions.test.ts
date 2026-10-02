/**
 * #1669 (ADR-AG-204) — a ROLE sentence introduces the points it names, and a chord or diameter with no circle states it.
 *
 * Operator, 2026-10-02 (playing round B T16): *"currently i need to place A and B on the circle to get the diameter. In
 * 2d it is enough to say AB קוטר even without a circle and it understands."* Ruling the same day: *"analytic should
 * mimic 2d behavior … analytics and 2d should have same user experience"* — a chord/diameter sentence with NO circle
 * creates it (centre unnamed until named), one circle binds, several ask, and a radius on an unnamed centre stays
 * refused.
 *
 * The class (docs/17): the chord predicate («מיתר AB») and the inscribed shape minted their ends; every diameter
 * spelling, every role-noun operand («המיתר AB …», «הקוטר AB …», ADR-AG-200's `claimFacts`) and the radius did not, and
 * were refused `unknown-reference`. The introductions are now declared at ONE place (`withRoleIntroductions`, every
 * clause), read off the clause's role facts.
 *
 * 2-D's verdicts for the same sequences (measured through 2-D's `runSubmit`, model mocked, on `main` c6a412aa) are
 * recorded in ADR-AG-204 for the #1649 parity lock — product trees never import each other.
 */
import { describe, expect, it } from 'vitest';
import { derive, type Derivation } from '../engine/derive';
import { decideSubmit } from '../app/submit';

/** Type the lines through the submit gate; every verdict, and the lines it kept. */
function typed(lines: readonly string[], seed = 0): { kinds: string[]; recorded: string[] } {
  const recorded: string[] = [];
  const kinds: string[] = [];
  for (const l of lines) {
    const v = decideSubmit(l, recorded, seed);
    kinds.push(v.kind === 'refused' ? `refused:${v.error.key}` : v.kind);
    if (v.kind === 'record') recorded.push(l);
  }
  return { kinds, recorded };
}
const pt = (d: Derivation, id: string) => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id}`);
  return p;
};
const circles = (d: Derivation) =>
  d.figure.curves.flatMap((c) => (c.curve.kind === 'circle' ? [{ id: c.id, cx: c.curve.cx, cy: c.curve.cy, r: c.curve.r }] : []));
const theCircle = (d: Derivation) => {
  const cs = circles(d);
  expect(cs).toHaveLength(1);
  return cs[0];
};
const close = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
const SEEDS = Array.from({ length: 24 }, (_, i) => i);

/** A and B are the two ends of a diameter of the figure's one circle: both on it, |AB| = 2r, the midpoint its centre. */
function expectDiameter(d: Derivation, a = 'A', b = 'B') {
  expect(d.faults).toEqual([]);
  const c = theCircle(d);
  const [p, q] = [pt(d, a), pt(d, b)];
  expect(close(Math.hypot(p.x - c.cx, p.y - c.cy), c.r)).toBe(true);
  expect(close(Math.hypot(q.x - c.cx, q.y - c.cy), c.r)).toBe(true);
  expect(close(Math.hypot(p.x - q.x, p.y - q.y), 2 * c.r)).toBe(true);
  expect(close((p.x + q.x) / 2, c.cx) && close((p.y + q.y) / 2, c.cy)).toBe(true);
}

// ---------------------------------------------------------------------------------------------------------------
// The issue's measured table — every row records
// ---------------------------------------------------------------------------------------------------------------

const TABLE: string[][] = [
  ['x^2+y^2=25', 'AB קוטר במעגל'],
  ['x^2+y^2=25', 'AB קוטר'],
  ['x^2+y^2=25', 'הקוטר AB מקביל לציר ה-y'],
  ['נתון מעגל שמרכזו M', 'AB קוטר במעגל'],
  ['x^2+y^2=25', 'A על המעגל', 'AB קוטר במעגל'],
  ['x^2+y^2=25', 'המיתר AB מקביל לציר ה-x'],
  // x²+y²=25's centre is named O by the tool (ADR-AG-184), so the radius has its centre end
  ['x^2+y^2=25', 'OA רדיוס'],
  ['AB קוטר'],
  ['AB קוטר במעגל'],
  // the controls that already minted their points
  ['x^2+y^2=25', 'מיתר AB'],
  ['x^2+y^2=25', 'AB מיתר במעגל'],
  ['x^2+y^2=25', 'AB משיק למעגל בנקודה A'],
  ['x^2+y^2=25', 'משולש ABC חסום במעגל'],
];
/** The neighbours of the same class: the other role spellings, the defining diameter, the chord with no circle. */
const NEIGHBOURS: string[][] = [
  ['נתון מעגל שמרכזו O', 'OA רדיוס'],
  ['נתון מעגל שמרכזו O', 'הרדיוס OA'],
  ['נתון מעגל שמרכזו O', 'הרדיוס OA מקביל לציר ה-x'],
  ['נתון מעגל שמרכזו O', 'OA is a radius'],
  ['נתון מעגל שקוטרו AB'],
  ['x^2+y^2=25', 'AB is a diameter of the circle'],
  ['x^2+y^2=25', 'the chord AB is parallel to the x-axis'],
  ['מיתר AB'],
  ['המיתר AB מקביל לציר ה-x'],
  ['AB קוטר', 'O מרכז המעגל'],
];

describe('#1669 — the measured table: every role sentence records', () => {
  it.each(TABLE.map((s) => [s.join(' · '), s] as const))('%s', (_n, lines) => {
    expect(typed(lines).kinds.every((k) => k === 'record')).toBe(true);
    expect(derive(lines, 0).faults).toEqual([]);
  });
  it.each(NEIGHBOURS.map((s) => [s.join(' · '), s] as const))('neighbour: %s', (_n, lines) => {
    expect(typed(lines).kinds.every((k) => k === 'record')).toBe(true);
    expect(derive(lines, 0).faults).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The geometry the role promises
// ---------------------------------------------------------------------------------------------------------------

describe('#1669 — an introduced diameter is a diameter', () => {
  it.each([
    [['x^2+y^2=25', 'AB קוטר במעגל']],
    [['x^2+y^2=25', 'AB קוטר']],
    [['x^2+y^2=25', 'הקוטר AB מקביל לציר ה-y']],
    [['נתון מעגל שמרכזו M', 'AB קוטר במעגל']],
    [['x^2+y^2=25', 'A על המעגל', 'AB קוטר במעגל']],
    [['AB קוטר']],
    [['נתון מעגל שקוטרו AB']],
  ])('%j — antipodal ends at four seeds', (lines) => {
    for (const seed of [0, 1, 2, 3]) expectDiameter(derive(lines, seed));
  });

  it('the vertical noun form holds its relation: AB ∥ the y-axis, ends (0, ±5)', () => {
    const d = derive(['x^2+y^2=25', 'הקוטר AB מקביל לציר ה-y'], 0);
    const [a, b] = [pt(d, 'A'), pt(d, 'B')];
    expect(close(a.x, 0) && close(b.x, 0)).toBe(true);
    expect(close(Math.abs(a.y), 5) && close(Math.abs(b.y), 5)).toBe(true);
  });

  it('a centre letter is the midpoint: «נתון מעגל שמרכזו M» · «AB קוטר במעגל»', () => {
    for (const seed of [0, 5, 11]) {
      const d = derive(['נתון מעגל שמרכזו M', 'AB קוטר במעגל'], seed);
      const [a, b, m] = [pt(d, 'A'), pt(d, 'B'), pt(d, 'M')];
      expect(close((a.x + b.x) / 2, m.x) && close((a.y + b.y) / 2, m.y)).toBe(true);
    }
  });

  it('a PLACED A keeps its place and B is its antipode: A(3,4) → B(−3,−4)', () => {
    const lines = ['x^2+y^2=25', 'A(3,4)', 'AB קוטר במעגל'];
    expect(typed(lines).kinds).toEqual(['record', 'record', 'record']);
    for (const seed of [0, 1, 2, 3]) {
      const d = derive(lines, seed);
      const [a, b] = [pt(d, 'A'), pt(d, 'B')];
      expect(close(a.x, 3) && close(a.y, 4)).toBe(true);
      expect(close(b.x, -3) && close(b.y, -4)).toBe(true);
    }
  });

  it('the chord operand puts both ends on the circle, distinct: «המיתר AB מקביל לציר ה-x»', () => {
    for (const seed of [0, 1, 2, 3]) {
      const d = derive(['x^2+y^2=25', 'המיתר AB מקביל לציר ה-x'], seed);
      expect(d.faults).toEqual([]);
      const [a, b] = [pt(d, 'A'), pt(d, 'B')];
      expect(close(Math.hypot(a.x, a.y), 5) && close(Math.hypot(b.x, b.y), 5)).toBe(true);
      expect(close(a.y, b.y)).toBe(true);
      expect(Math.abs(a.x - b.x)).toBeGreaterThan(1e-3);
    }
  });

  it('the radius with its centre named puts the other end on the circle: «נתון מעגל שמרכזו O» · «OA רדיוס»', () => {
    for (const seed of [0, 1, 2, 3]) {
      const d = derive(['נתון מעגל שמרכזו O', 'OA רדיוס'], seed);
      expect(d.faults).toEqual([]);
      const c = theCircle(d);
      const [o, a] = [pt(d, 'O'), pt(d, 'A')];
      expect(close(o.x, c.cx) && close(o.y, c.cy)).toBe(true);
      expect(close(Math.hypot(a.x - o.x, a.y - o.y), c.r)).toBe(true);
    }
  });

  it('«OA רדיוס» ≡ «הרדיוס OA» — the predicate is the role, not "the radius equals |OA|"', () => {
    for (const seed of [0, 3]) {
      const p = derive(['נתון מעגל שמרכזו O', 'OA רדיוס'], seed).figure.points;
      const q = derive(['נתון מעגל שמרכזו O', 'הרדיוס OA'], seed).figure.points;
      expect(p.map((x) => [x.id, x.x, x.y])).toEqual(q.map((x) => [x.id, x.x, x.y]));
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// No circle → the sentence states it; several → it asks; the radius on an unnamed centre → refused
// ---------------------------------------------------------------------------------------------------------------

describe('#1669 — which circle (the operator ruling)', () => {
  it('a diameter with no circle states the circle on it; «O מרכז המעגל» then names its centre — the midpoint', () => {
    const lines = ['AB קוטר', 'O מרכז המעגל'];
    expect(typed(lines).kinds).toEqual(['record', 'record']);
    expect(derive(['AB קוטר'], 0).figure.points.map((p) => p.id).sort()).toEqual(['A', 'B']); // the centre is unnamed
    for (const seed of [0, 1, 2]) {
      const d = derive(lines, seed);
      expectDiameter(d);
      const [a, b, o] = [pt(d, 'A'), pt(d, 'B'), pt(d, 'O')];
      expect(close((a.x + b.x) / 2, o.x) && close((a.y + b.y) / 2, o.y)).toBe(true);
    }
  });

  it('a chord with no circle states the circle (centre unnamed); «O מרכז המעגל» then names it — |OA| = |OB| = r', () => {
    const lines = ['מיתר AB', 'O מרכז המעגל'];
    expect(typed(lines).kinds).toEqual(['record', 'record']);
    expect(derive(['מיתר AB'], 0).figure.points.map((p) => p.id).sort()).toEqual(['A', 'B']);
    for (const seed of [0, 1, 2]) {
      const d = derive(lines, seed);
      expect(d.faults).toEqual([]);
      const c = theCircle(d);
      const [a, b, o] = [pt(d, 'A'), pt(d, 'B'), pt(d, 'O')];
      expect(close(o.x, c.cx) && close(o.y, c.cy)).toBe(true);
      expect(close(Math.hypot(a.x - o.x, a.y - o.y), c.r) && close(Math.hypot(b.x - o.x, b.y - o.y), c.r)).toBe(true);
    }
  });

  it('the role-noun chord with no circle states one too: «המיתר AB מקביל לציר ה-x»', () => {
    const d = derive(['המיתר AB מקביל לציר ה-x'], 0);
    expect(d.faults).toEqual([]);
    const c = theCircle(d);
    const [a, b] = [pt(d, 'A'), pt(d, 'B')];
    expect(close(Math.hypot(a.x - c.cx, a.y - c.cy), c.r) && close(Math.hypot(b.x - c.cx, b.y - c.cy), c.r)).toBe(true);
    expect(close(a.y, b.y)).toBe(true);
  });

  it('the chord circle takes the equation stated after it (corpus 11/5\'s order): one circle, the ends on it', () => {
    const lines = ['במעגל המיתרים AC ו-BD נפגשים בנקודה E', 'משוואת המעגל הנתון היא: (x-3)² + (y+2)² = 25', 'הנקודות A ו-B נמצאות על ציר ה-y'];
    expect(typed(lines).kinds).toEqual(['record', 'record', 'record']);
    const d = derive(lines, 0);
    expect(d.faults).toEqual([]);
    const c = theCircle(d);
    expect(close(c.cx, 3) && close(c.cy, -2) && close(c.r, 5)).toBe(true);
    for (const id of ['A', 'B', 'C', 'D']) {
      const p = pt(d, id);
      expect(close(Math.hypot(p.x - 3, p.y + 2), 5)).toBe(true);
    }
    expect(close(pt(d, 'A').x, 0) && close(pt(d, 'B').x, 0)).toBe(true);
  });

  it('the tangency-created circle takes its equation too (was conflicting-restatement)', () => {
    const lines = ['הישר AB משיק למעגל בנקודה A', 'משוואת המעגל היא x^2+y^2=25'];
    expect(typed(lines).kinds).toEqual(['record', 'record']);
    const d = derive(lines, 0);
    expect(d.faults).toEqual([]);
    const c = theCircle(d);
    expect(close(c.cx, 0) && close(c.cy, 0) && close(c.r, 5)).toBe(true);
    expect(close(Math.hypot(pt(d, 'A').x, pt(d, 'A').y), 5)).toBe(true);
  });

  it('…and a placed end the equation contradicts is refused on the equation line', () => {
    expect(typed(['A(10,10)', 'מיתר AB', 'משוואת המעגל היא x^2+y^2=25']).kinds).toEqual(['record', 'record', 'refused:unsatisfiable']);
  });

  it('two circles → asks which, for the diameter and for the chord operand', () => {
    expect(typed(['x^2+y^2=25', 'x^2+y^2=4', 'AB קוטר במעגל']).kinds.at(-1)).toBe('refused:ambiguous-shape');
    expect(typed(['x^2+y^2=25', 'x^2+y^2=4', 'המיתר AB מקביל לציר ה-x']).kinds.at(-1)).toBe('refused:ambiguous-shape');
    expect(typed(['x^2+y^2=25', 'x^2+y^2=4', 'הקוטר AB מקביל לציר ה-y']).kinds.at(-1)).toBe('refused:ambiguous-shape');
  });

  it.each([
    [['AB קוטר', 'OB רדיוס'], 'refused:out-of-scope'],
    [['AB קוטר', 'הרדיוס OB'], 'refused:out-of-scope'],
    [['מיתר AB', 'OA רדיוס'], 'refused:out-of-scope'],
    [['(x-1)^2+(y-2)^2=9', 'OA רדיוס'], 'refused:out-of-scope'],
    [['הרדיוס OB'], 'refused:ambiguous-shape'],
    [['OB רדיוס'], 'refused:ambiguous-shape'],
  ])('REFUSAL — a radius on an unnamed or absent centre stays refused: %j', (lines, verdict) => {
    expect(typed(lines).kinds.at(-1)).toBe(verdict);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// ADR-052 — an introduced end is a FREE DOF
// ---------------------------------------------------------------------------------------------------------------

describe('#1669 — the introduced ends are free (24-seed sweep)', () => {
  const distinctPlaces = (lines: string[], id: string) => {
    const seen: Array<[number, number]> = [];
    for (const seed of SEEDS) {
      const d = derive(lines, seed);
      expect(d.faults, `seed ${seed}`).toEqual([]);
      const p = pt(d, id);
      if (!seen.some(([x, y]) => Math.hypot(x - p.x, y - p.y) < 1e-3)) seen.push([p.x, p.y]);
    }
    return seen.length;
  };

  it('«x^2+y^2=25» · «AB קוטר במעגל»: B moves along the circle and stays A’s antipode at 24/24', () => {
    const lines = ['x^2+y^2=25', 'AB קוטר במעגל'];
    for (const seed of SEEDS) expectDiameter(derive(lines, seed));
    expect(distinctPlaces(lines, 'B')).toBeGreaterThanOrEqual(12);
  });

  it('«AB קוטר» with no circle: the free ends vary', () => {
    expect(distinctPlaces(['AB קוטר'], 'B')).toBeGreaterThanOrEqual(12);
  });

  it('«מיתר AB» with no circle: the created circle and its chord vary', () => {
    expect(distinctPlaces(['מיתר AB'], 'A')).toBeGreaterThanOrEqual(12);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The 2-D-built neighbours (corpus-2 :315, :499 — the plane-geometry part)
// ---------------------------------------------------------------------------------------------------------------

describe('#1669 — 2-D’s diameter-then-chord sequences build here too', () => {
  it('«AB קוטר» · «C על המעגל» · «BD מיתר» — every point on the one circle, AB a diameter', () => {
    const lines = ['AB קוטר', 'C על המעגל', 'BD מיתר'];
    expect(typed(lines).kinds).toEqual(['record', 'record', 'record']);
    for (const seed of [0, 1, 2, 3]) {
      const d = derive(lines, seed);
      expectDiameter(d);
      const c = theCircle(d);
      for (const id of ['C', 'D']) {
        const p = pt(d, id);
        expect(close(Math.hypot(p.x - c.cx, p.y - c.cy), c.r)).toBe(true);
      }
    }
  });

  it('«מעגל O» · «AB קוטר» · «BD מיתר» — O the midpoint of AB, D on the circle', () => {
    const lines = ['מעגל O', 'AB קוטר', 'BD מיתר'];
    expect(typed(lines).kinds).toEqual(['record', 'record', 'record']);
    for (const seed of [0, 1, 2, 3]) {
      const d = derive(lines, seed);
      expectDiameter(d);
      const [a, b, o] = [pt(d, 'A'), pt(d, 'B'), pt(d, 'O')];
      expect(close((a.x + b.x) / 2, o.x) && close((a.y + b.y) / 2, o.y)).toBe(true);
    }
  });

  it('«מיתר AB» · «C על המעגל» · «AC קוטר» — C’s place makes AC a diameter of the created circle', () => {
    const lines = ['מיתר AB', 'C על המעגל', 'AC קוטר'];
    expect(typed(lines).kinds).toEqual(['record', 'record', 'record']);
    for (const seed of [0, 1, 2]) expectDiameter(derive(lines, seed), 'A', 'C');
  });
});
