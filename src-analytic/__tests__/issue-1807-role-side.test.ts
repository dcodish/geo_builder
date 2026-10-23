/**
 * #1807 (ADR-AG-266) — A SIDE NAMED BY ITS ROLE ALONE: «משוואת הבסיס היא x-2y+6=0».
 *
 * Operator, 2026-10-06: *"משוואת הבסיס should be understood. if the user defined the equal sides, this is easy to know
 * what the base is but if he didn't the sentence can be used with dof"*. Analytic read the role only WITH its letters
 * («משוואת הבסיס BC היא …»); the role alone was `not-handled` (measured at `c6818ccb`). The class: *a side named by its
 * role with no letters had no resolver* — the base, a leg, the hypotenuse, a trapezoid's base, in the equation and the
 * incidence forms.
 *
 * Settled role → that side, exactly as its letters; open role → the statement on every option of the noun's own
 * choice, so one cycle draws a different side on the line and the side always matches the drawn apex. Every case
 * runs through the real `decideSubmit` and `derive`, and reads the DRAWN figure: which two vertices lie on the line.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit, type SubmitVerdict } from '../app/submit';
import { derive, type Derivation } from '../engine/derive';
import { errorText } from '../app/errorText';
import { analyticI18n } from '../i18n';

type T = (k: string, o?: Record<string, unknown>) => string;
const plain = (f: T): T => (k, o) => f(k, o).replace(/[⁦-⁩]/g, '');
const t = plain(analyticI18n.getFixedT('he') as unknown as T);

const SEEDS = [0, 1, 2, 3, 4, 5];
const LINE = 'x-2y+6=0';
const onLine = (p: { x: number; y: number }) => Math.abs(p.x - 2 * p.y + 6) / Math.sqrt(5) < 1e-5;

function submit(lines: readonly string[]): SubmitVerdict[] {
  const kept: string[] = [];
  return lines.map((line) => {
    const v = decideSubmit(line, kept, 0);
    if (v.kind === 'record') kept.push(v.line);
    return v;
  });
}
function built(lines: readonly string[], seed: number): Derivation {
  submit(lines).forEach((v, i) => expect(v.kind, `${lines[i]} → ${JSON.stringify(v)}`).toBe('record'));
  const d = derive(lines, seed);
  expect(d.faults, JSON.stringify(d.faults)).toEqual([]);
  return d;
}
const P = (d: Derivation, id: string) => {
  const p = d.figure.points.find((q) => q.id === id);
  if (!p) throw new Error(`no point ${id}`);
  return p;
};
/** The ring's vertices that lie on the stated line, sorted — the side the figure put there. */
const sideOnLine = (d: Derivation, ring: string): string =>
  [...ring].filter((id) => onLine(P(d, id))).sort().join('');
const len = (d: Derivation, a: string, b: string) => Math.hypot(P(d, a).x - P(d, b).x, P(d, a).y - P(d, b).y);
/** The apex of an isosceles ABC as drawn: the vertex whose two sides are equal. */
const apexOf = (d: Derivation): string[] =>
  ['A', 'B', 'C'].filter((v) => {
    const [p, q] = ['A', 'B', 'C'].filter((x) => x !== v);
    return Math.abs(len(d, v, p) - len(d, v, q)) < 1e-4 * (len(d, v, p) + len(d, v, q));
  });
const choices = (d: Derivation) => d.construction.constraints.filter((k) => k.t === 'choice').length;

describe('#1807 — the operator’s run, and the base a stated equal pair settles', () => {
  it('«משולש שווה שוקיים» · «AB=AC» · «משוואת הבסיס היא x-2y+6=0» · «A(3,2)» · «d_{BC}=6√5» — B and C on the line, |BC| = 6√5', () => {
    const lines = ['משולש שווה שוקיים', 'AB=AC', `משוואת הבסיס היא ${LINE}`, 'A(3,2)', 'd_{BC}=6√5'];
    for (const seed of SEEDS) {
      const d = built(lines, seed);
      expect(sideOnLine(d, 'ABC')).toBe('BC');
      expect(P(d, 'A').x).toBeCloseTo(3, 6);
      expect(P(d, 'A').y).toBeCloseTo(2, 6);
      expect(len(d, 'B', 'C')).toBeCloseTo(6 * Math.sqrt(5), 4);
      expect(len(d, 'A', 'B')).toBeCloseTo(len(d, 'A', 'C'), 4);
    }
  });

  for (const line of [`משוואת הבסיס היא ${LINE}`, `הבסיס מונח על הישר ${LINE}`, `הבסיס נמצא על הישר ${LINE}`, `the base lies on the line ${LINE}`]) {
    it(`«AB=AC» settles it: «${line}» is the base BC at every seed, as if its letters were typed`, () => {
      for (const seed of SEEDS) {
        const d = built(['משולש שווה שוקיים ABC', 'AB=AC', line], seed);
        expect(sideOnLine(d, 'ABC')).toBe('BC');
        expect(choices(d)).toBe(0);
      }
    });
  }

  it('the settled role lowers exactly as its lettered twin — the same constraints', () => {
    const role = derive(['משולש שווה שוקיים ABC', 'AB=AC', `משוואת הבסיס היא ${LINE}`], 0).construction.constraints;
    const lettered = derive(['משולש שווה שוקיים ABC', 'AB=AC', `משוואת הבסיס BC היא ${LINE}`], 0).construction.constraints;
    expect(role).toEqual(lettered);
  });
});

describe('#1807 — an OPEN role is a degree of freedom: one cycle, the side always opposite the drawn apex', () => {
  for (const line of [`משוואת הבסיס היא ${LINE}`, `הבסיס מונח על הישר ${LINE}`]) {
    it(`«משולש שווה שוקיים ABC» · «${line}» — the base on the line is opposite the apex at every seed, and the seeds draw all three`, () => {
      const seen = new Set<string>();
      for (const seed of SEEDS) {
        const d = built(['משולש שווה שוקיים ABC', line], seed);
        const side = sideOnLine(d, 'ABC');
        expect(side).toHaveLength(2);
        const apex = 'ABC'.replace(side[0], '').replace(side[1], '');
        expect(apexOf(d)).toContain(apex);
        expect(choices(d)).toBe(1); // ONE cycle — the noun's choice, carrying the line; never 3 × 3
        seen.add(side);
      }
      expect([...seen].sort()).toEqual(['AB', 'AC', 'BC']);
    });
  }

  it('a later «AB=AC» collapses the cycle onto its own option: the base BC, at every seed', () => {
    for (const seed of SEEDS) {
      const d = built(['משולש שווה שוקיים ABC', `משוואת הבסיס היא ${LINE}`, 'AB=AC'], seed);
      expect(sideOnLine(d, 'ABC')).toBe('BC');
      expect(choices(d)).toBe(0);
    }
  });

  it('a leg: «משוואת השוק היא …» — a side through the drawn apex, cycled; settled apex → one of its two legs', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const d = built(['משולש שווה שוקיים ABC', `משוואת השוק היא ${LINE}`], seed);
      const side = sideOnLine(d, 'ABC');
      expect(side).toHaveLength(2);
      expect(apexOf(d).some((a) => side.includes(a))).toBe(true);
      seen.add(side);
    }
    expect(seen.size).toBeGreaterThan(1);
    for (const seed of SEEDS) {
      const d = built(['משולש שווה שוקיים ABC', 'AB=AC', `משוואת השוק היא ${LINE}`], seed);
      expect(['AB', 'AC']).toContain(sideOnLine(d, 'ABC'));
    }
  });

  it('the hypotenuse: open on «משולש ישר זווית» — opposite the drawn right angle, cycled; a stated «זווית A = 90» settles BC', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const d = built(['משולש ישר זווית ABC', `משוואת היתר היא ${LINE}`], seed);
      const side = sideOnLine(d, 'ABC');
      const right = 'ABC'.replace(side[0], '').replace(side[1], '');
      const [u, v] = [P(d, side[0]), P(d, side[1])];
      const r = P(d, right);
      expect(Math.abs((u.x - r.x) * (v.x - r.x) + (u.y - r.y) * (v.y - r.y))).toBeLessThan(1e-4 * len(d, side[0], side[1]) ** 2);
      seen.add(side);
    }
    expect(seen.size).toBe(3);
    for (const seed of SEEDS) expect(sideOnLine(built(['משולש ABC', 'זווית A = 90', `משוואת היתר היא ${LINE}`], seed), 'ABC')).toBe('BC');
  });

  it('a trapezoid’s base: one of its two parallel sides, cycled, and the pair stays parallel', () => {
    const seen = new Set<string>();
    for (const seed of SEEDS) {
      const d = built(['טרפז ABCD', `משוואת הבסיס היא ${LINE}`], seed);
      const side = sideOnLine(d, 'ABCD');
      expect(['AB', 'CD']).toContain(side);
      const [A, B, C, D] = ['A', 'B', 'C', 'D'].map((id) => P(d, id));
      expect(Math.abs((B.x - A.x) * (C.y - D.y) - (B.y - A.y) * (C.x - D.x))).toBeLessThan(1e-4 * len(d, 'A', 'B') * len(d, 'C', 'D'));
      seen.add(side);
    }
    expect([...seen].sort()).toEqual(['AB', 'CD']);
  });

  it('a second role sentence joins the same cycle — the base and a leg on two lines, one choice', () => {
    for (const seed of SEEDS) {
      const d = built(['משולש שווה שוקיים ABC', `משוואת הבסיס היא ${LINE}`, 'משוואת השוק היא y=3x'], seed);
      expect(choices(d)).toBe(1);
      const base = sideOnLine(d, 'ABC');
      const apex = 'ABC'.replace(base[0], '').replace(base[1], '');
      expect(apexOf(d)).toContain(apex);
      const onLeg = ['A', 'B', 'C'].filter((id) => Math.abs(P(d, id).y - 3 * P(d, id).x) < 1e-5 * (1 + Math.abs(P(d, id).y)));
      expect(onLeg).toContain(apex);
    }
  });
});

describe('#1807 — no shape gives the role a content: the contextual refusal, naming the sentence', () => {
  for (const shape of ['מקבילית ABCD', 'משולש ABC']) {
    it(`«${shape}» · «משוואת הבסיס היא …» is refused (operator 2026-10-06: "there is no base in parallelogram")`, () => {
      const v = submit([shape, `משוואת הבסיס היא ${LINE}`])[1];
      expect(v.kind).toBe('refused');
      if (v.kind !== 'refused') return;
      expect(v.error.key).toBe('ambiguous-shape');
      expect(errorText(v.error, t)).toContain(`«משוואת הבסיס היא ${LINE}»`);
    });
  }
  it('two isosceles triangles: which base is not said — refused, never a pick', () => {
    expect(submit(['משולש שווה שוקיים ABC', 'משולש שווה שוקיים DEF', `משוואת הבסיס היא ${LINE}`])[2].kind).toBe('refused');
  });
  it('a sentence with no line for the side to lie on is left as it was («D על הבסיס», «אורך הבסיס הוא 6»)', () => {
    for (const line of ['D על הבסיס', 'אורך הבסיס הוא 6']) {
      const v = submit(['משולש שווה שוקיים ABC', line])[1];
      expect(v.kind === 'refused' && v.error.key).toBe('not-handled');
    }
  });
});
