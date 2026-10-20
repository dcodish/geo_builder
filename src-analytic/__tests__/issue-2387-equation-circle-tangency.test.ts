/**
 * #2387 ([ADR-AG-306](../../docs/06c-decisions-analytic.md#adr-ag-306)) — TWO CIRCLES GIVEN BY THEIR EQUATIONS CAN BE
 * TANGENT.
 *
 * Operator (#2379): *"this is an exam I give my students and i want the tool to support it"* — Q2 (summer 2022) states
 * both circles by equation, «(x−a)²+y²=r²» and «(x−13)²+y²=R²», and says they touch externally. `tangent-circles` used to
 * require both circles to be `circle-at`, so every such sentence was refused `out-of-scope`. Each side of the touch is now
 * a circle REFERENCE: a centred circle's point and radius, or an equation circle read off its resolved curve (the
 * `tangent-curve` reading, ADR-AG-195), so the equation's parameters are what the touch pins.
 *
 * Every assertion calls the decision: `decideSubmit`, `derive`, `panelKnowledge`, and the drawn figure's own circles.
 */
import { describe, expect, it } from 'vitest';
import { decideSubmit } from '../app/submit';
import { derive } from '../engine/derive';
import { panelKnowledge } from '../app/panelRows';
import { paramRegister } from '../engine/carriers';
import q2 from './fixtures/issue-2387-q2-equation-circles.analytic.json';
import q2he from './fixtures/issue-2387-q2-section-he.analytic.json';

type Verdict = { kind: string; line?: string; error?: { key?: string } };
type Circle = { cx: number; cy: number; r: number };

function submitAll(lines: readonly string[]): string[] {
  const recorded: string[] = [];
  for (const line of lines) {
    const v = decideSubmit(line, recorded, 0) as Verdict;
    if (v.kind === 'record') recorded.push(v.line ?? line);
    else if (v.kind !== 'already-follows' && v.kind !== 'already-known') throw new Error(`«${line}» → ${v.kind} ${v.error?.key ?? ''}`);
  }
  return recorded;
}

function lastVerdict(lines: readonly string[]): Verdict {
  const recorded = submitAll(lines.slice(0, -1));
  return decideSubmit(lines[lines.length - 1], recorded, 0) as Verdict;
}

/** The drawn circles of a derivation, by id. */
function circles(lines: readonly string[], seed: number): Map<string, Circle> {
  const d = derive(lines, seed);
  expect(d.faults).toEqual([]);
  expect(d.figure.unsatisfied).toEqual([]);
  const out = new Map<string, Circle>();
  for (const c of d.figure.curves) if (c.curve.kind === 'circle') out.set(c.id, { cx: c.curve.cx, cy: c.curve.cy, r: c.curve.r });
  return out;
}

/** Which touch the drawn pair makes — the formula sheet's two cases, measured on the figure. */
function touch(p: Circle, q: Circle): 'external' | 'internal' | null {
  const d = Math.hypot(q.cx - p.cx, q.cy - p.cy);
  const tol = 1e-6 * Math.max(1, p.r, q.r);
  if (Math.abs(d - (p.r + q.r)) < tol) return 'external';
  if (d > tol && Math.abs(d - Math.abs(p.r - q.r)) < tol) return 'internal';
  return null;
}

const SEEDS = Array.from({ length: 12 }, (_, i) => i);

/** The pairs: {equation–equation, equation–centre, centre–equation}, each with the two circles' drawn ids. */
const PAIRS: Array<[string, string[], string, string, string]> = [
  ['equation – equation', ['נתון מעגל I שמשוואתו x^2+y^2=4', 'נתון מעגל II שמשוואתו (x-k)^2+y^2=1'], 'circle-I', 'circle-II', 'מעגל I ומעגל II משיקים'],
  ['equation – centre', ['נתון מעגל I שמשוואתו x^2+y^2=4', 'נתון מעגל שמרכזו N ורדיוסו 1'], 'circle-I', 'circle-at-N', 'מעגל I משיק למעגל N'],
  ['centre – equation', ['נתון מעגל שמרכזו N ורדיוסו 1', 'נתון מעגל I שמשוואתו x^2+y^2=4'], 'circle-at-N', 'circle-I', 'מעגל N משיק למעגל I'],
];

describe('#2387 (1) — every pair, every branch: the drawn circles touch as stated, at every seed', () => {
  for (const [name, ctx, a, b, sentence] of PAIRS) {
    it.each([
      ['מבחוץ', 'external'],
      ['מבפנים', 'internal'],
    ] as const)(`${name}: «${sentence} %s»`, (word, branch) => {
      const lines = [...ctx, `${sentence} ${word}`];
      expect(submitAll(lines)).toEqual(lines);
      for (const seed of SEEDS) {
        const cs = circles(lines, seed);
        expect(touch(cs.get(a)!, cs.get(b)!), `seed ${seed}`).toBe(branch);
      }
    });

    it(`${name}: «${sentence}» with no branch word draws a touch at every seed, and «הציגו תצורה אחרת» reaches both`, () => {
      const lines = [...ctx, sentence];
      expect(submitAll(lines)).toEqual(lines);
      const seen = new Set<string>();
      for (const seed of SEEDS) {
        const cs = circles(lines, seed);
        const t = touch(cs.get(a)!, cs.get(b)!);
        expect(t, `seed ${seed}`).not.toBeNull();
        seen.add(t!);
      }
      expect([...seen].sort()).toEqual(['external', 'internal']);
    });

    it(`${name}: «${sentence} בנקודה T» — T is on both circles`, () => {
      const lines = [...ctx, `${sentence} בנקודה T`];
      expect(submitAll(lines)).toEqual(lines);
      for (const seed of SEEDS) {
        const d = derive(lines, seed);
        expect(d.faults).toEqual([]);
        const T = d.figure.points.find((p) => p.id === 'T')!;
        const cs = circles(lines, seed);
        for (const id of [a, b]) {
          const c = cs.get(id)!;
          expect(Math.hypot(T.x - c.cx, T.y - c.cy)).toBeCloseTo(c.r, 6);
        }
      }
    });
  }

  it('the contextual «המעגלים משיקים מבחוץ» over two equation circles is the same statement', () => {
    const lines = ['נתון מעגל I שמשוואתו x^2+y^2=4', 'נתון מעגל II שמשוואתו (x-k)^2+y^2=1', 'המעגלים משיקים מבחוץ'];
    expect(submitAll(lines)).toEqual(lines);
    for (const seed of SEEDS) {
      const cs = circles(lines, seed);
      expect(touch(cs.get('circle-I')!, cs.get('circle-II')!)).toBe('external');
    }
  });

  it('constant equations that already touch: «זה כבר נובע», and a pair that cannot: refused', () => {
    const touching = ['נתון מעגל I שמשוואתו x^2+y^2=25', 'נתון מעגל II שמשוואתו (x-15)^2+y^2=100'];
    expect(lastVerdict([...touching, 'המעגלים משיקים מבחוץ']).kind).toBe('already-follows');
    expect(lastVerdict([...touching, 'המעגלים משיקים מבפנים']).error?.key).toBe('unsatisfiable');
  });

  it('the mixed pair: a centred circle with a stated radius pins the equation’s parameter (|k| = 15)', () => {
    const lines = ['נתון מעגל שמרכזו M(0,0) ורדיוסו 5', 'נתון מעגל II שמשוואתו (x-k)^2+y^2=100', 'המעגלים משיקים מבחוץ'];
    expect(submitAll(lines)).toEqual(lines);
    for (const seed of SEEDS) {
      const d = derive(lines, seed);
      expect(d.faults).toEqual([]);
      expect(Math.abs(d.figure.env.k)).toBeCloseTo(15, 6);
    }
  });
});

describe('#2387 (2) — refusals, never a silent drop', () => {
  const CONCENTRIC = ['נתון מעגל I שמשוואתו x^2+y^2=4', 'נתון מעגל II שמשוואתו x^2+y^2=r^2'];
  it.each(['המעגלים משיקים', 'המעגלים משיקים מבפנים', 'המעגלים משיקים מבחוץ', 'מעגל I ומעגל II משיקים', 'מעגל I משיק למעגל II מבפנים'])(
    'concentric equation circles are never tangent: «%s» refused unsatisfiable (operator 2026-09-29)',
    (s) => {
      expect(lastVerdict([...CONCENTRIC, s]).error?.key).toBe('unsatisfiable');
    },
  );
  it('an equation circle and a circle on the same stated centre: refused', () => {
    expect(lastVerdict(['נתון מעגל I שמשוואתו x^2+y^2=4', 'נתון מעגל שמרכזו O(0,0)', 'המעגלים משיקים מבפנים']).error?.key).toBe('unsatisfiable');
  });
  it('a circle is not tangent to itself', () => {
    expect(lastVerdict(['נתון מעגל I שמשוואתו x^2+y^2=4', 'מעגל I משיק למעגל I']).error?.key).toBe('unsatisfiable');
  });
  it('the contextual «המעגלים משיקים» over three circles asks which', () => {
    const v = lastVerdict(['נתון מעגל I שמשוואתו x^2+y^2=4', 'נתון מעגל II שמשוואתו (x-k)^2+y^2=1', 'נתון מעגל שמרכזו N ורדיוסו 1', 'המעגלים משיקים']);
    expect(v.error?.key).toBe('ambiguous-shape');
  });
  it('an equation circle tangent to an AXIS stays out of scope (ADR-AG-195)', () => {
    expect(lastVerdict(['נתון מעגל I שמשוואתו (x-3)^2+(y-4)^2=r^2', 'מעגל I משיק לציר ה-x']).error?.key).toBe('out-of-scope');
  });
  it('a computed circle (through three points) tangent to a circle stays out of scope: not asked', () => {
    expect(lastVerdict(['A(0,0)', 'B(4,0)', 'C(0,4)', 'מעגל ABC', 'נתון מעגל שמרכזו N ורדיוסו 1', 'המעגלים משיקים']).error?.key).toBe('out-of-scope');
  });
});

describe('#2387 — Q2 (summer 2022) in the exam’s equation form', () => {
  it('section א: a = 4 and both equations known; r is printed only once its sign is known (honest «?»)', () => {
    expect(submitAll(q2.lines)).toEqual(q2.lines);
    const d = derive(q2.lines, q2.seed);
    expect(d.faults).toEqual([]);
    const pk = panelKnowledge(d);
    const a = pk.params.find((p) => p.sym === 'a')!.k;
    // a = 4 (and, once the pin keeps its distant root (#2380), 22 beside it).
    const values = a.known ? [a.value] : [...(a.options ?? [])];
    expect(values.some((v) => Math.abs(v - 4) < 1e-5), JSON.stringify(values)).toBe(true);
    for (const c of pk.curves) expect(c.known !== null || (c.options?.length ?? 0) > 0, c.id).toBe(true);
    for (const id of ['M', 'N']) {
      const p = pk.points.find((q) => q.id === id)!;
      expect(p.y.known).toBe(true);
    }
    expect(paramRegister(d.construction).map((p) => p.sym).sort()).toEqual(['a', 'r']);
  });

  it('section ה: circles III and IV touch externally, |k − t| = 9 at every seed (one honest DOF left)', () => {
    expect(submitAll(q2he.lines)).toEqual(q2he.lines);
    for (const seed of SEEDS) {
      const d = derive(q2he.lines, seed);
      expect(d.faults).toEqual([]);
      expect(d.figure.unsatisfied).toEqual([]);
      const cs = circles(q2he.lines, seed);
      expect(touch(cs.get('circle-III')!, cs.get('circle-IV')!)).toBe('external');
      expect(touch(cs.get('circle-I')!, cs.get('circle-II')!)).toBe('external');
    }
  });
});
