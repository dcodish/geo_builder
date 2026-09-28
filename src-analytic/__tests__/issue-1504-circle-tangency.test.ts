/**
 * CIRCLE-TO-CIRCLE TANGENCY (#1504, ADR-AG-167) — the third member of the tangency family.
 *
 * Operator, playing PR #1502's T9 (2026-09-28): *"passes but when i do build both circles, its
 * still refused."* T9's pass condition WAS the honest refusal — ADR-AG-165 pre-declared this its
 * own capability — and the report is the go-ahead.
 *
 * One equation with a DISCRETE unstated choice: |MK| = r+R (external) or |MK| = |r−R| (internal).
 * The choice cycles under «הציגו תצורה אחרת» (#1049) — never a silently picked seat (ADR-052) —
 * and a branch word collapses it. Seed sweep per ADR-AG-144: a 2/24 pass must not read as done.
 */
import { describe, expect, it } from 'vitest';
import { derive } from '../engine/derive';
import { reportedDof } from '../engine/carriers';

const SEEDS = 12;

const build = (lines: string[], seed = 0) => {
  const d = derive(lines, seed);
  const pt = (id: string) => d.figure.points.find((p) => p.id === id) ?? null;
  const radii = () => d.figure.curves.map((c) => c.curve).filter((c) => c.kind === 'circle').map((c) => (c as { r: number }).r);
  return { d, pt, radii, dof: reportedDof(d.construction, d.figure.carrierDof) };
};

/** Which touch this configuration drew — measured off the figure, not off internals. */
const branchOf = (f: ReturnType<typeof build>) => {
  const [r1, r2] = f.radii();
  const a = f.pt('M')!;
  const b = f.pt('K')!;
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  if (Math.abs(d - (r1 + r2)) < 1e-5 * Math.max(1, d)) return 'external';
  if (Math.abs(d - Math.abs(r1 - r2)) < 1e-5 * Math.max(1, d)) return 'internal';
  return `neither (d=${d}, r=${r1},${r2})`;
};

describe('#1504 — «מעגל M משיק למעגל K» holds one of the two touch equations, at every seed', () => {
  it("the operator's sentence: |MK| = r+R or |r−R| at 12/12 seeds, and BOTH branches are reached", () => {
    const seen = new Set<string>();
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const f = build(['נתון מעגל K', 'נתון מעגל M', 'מעגל M משיק למעגל K'], seed);
      expect(f.d.faults, `seed ${seed}`).toEqual([]);
      const br = branchOf(f);
      expect(['external', 'internal'], `seed ${seed}: ${br}`).toContain(br);
      seen.add(br);
    }
    // The unstated choice CYCLES — landing on one branch at every seed would be a silently
    // chosen seat, the thing the choice kind exists to prevent.
    expect([...seen].sort()).toEqual(['external', 'internal']);
  });

  it('one equation consumed: two free circles hold 6 DOF, the tangency leaves 5', () => {
    const f = build(['נתון מעגל K', 'נתון מעגל M', 'מעגל M משיק למעגל K']);
    expect(f.d.faults).toEqual([]);
    expect(f.dof).toBe(5);
  });

  it('a branch word PINS the touch — «מבחוץ» external at every seed, «מבפנים» internal', () => {
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const out = build(['נתון מעגל K', 'נתון מעגל M', 'מעגל M משיק למעגל K מבחוץ'], seed);
      expect(out.d.faults, `מבחוץ seed ${seed}`).toEqual([]);
      expect(branchOf(out), `seed ${seed}`).toBe('external');
      const inn = build(['נתון מעגל K', 'נתון מעגל M', 'מעגל M משיק למעגל K מבפנים'], seed);
      expect(inn.d.faults, `מבפנים seed ${seed}`).toEqual([]);
      expect(branchOf(inn), `seed ${seed}`).toBe('internal');
    }
  });
});

describe('#1504 — every order and the contextual forms', () => {
  it.each([
    ['המעגל M משיק למעגל K', ['נתון מעגל K']],
    ['המעגל משיק למעגל K', ['נתון מעגל K', 'נתון מעגל M']],
    ['המעגלים משיקים', ['נתון מעגל K', 'נתון מעגל M']],
    ['שני המעגלים משיקים זה לזה', ['נתון מעגל K', 'נתון מעגל M']],
    ['circle M is tangent to circle K', ['נתון מעגל K']],
    ['the circles are tangent', ['נתון מעגל K', 'נתון מעגל M']],
  ])('«%s» builds and touches', (line, pre) => {
    const f = build([...pre, line]);
    expect(f.d.faults).toEqual([]);
    expect(['external', 'internal']).toContain(branchOf(f));
  });

  it('«המעגלים משיקים מבחוץ» — the plural subject takes the branch word too', () => {
    const f = build(['נתון מעגל K', 'נתון מעגל M', 'המעגלים משיקים מבחוץ']);
    expect(f.d.faults).toEqual([]);
    expect(branchOf(f)).toBe('external');
  });

  it('restating the tangency is idempotent — the same statement, not a second equation', () => {
    const f = build(['נתון מעגל K', 'נתון מעגל M', 'מעגל M משיק למעגל K', 'מעגל K משיק למעגל M']);
    expect(f.dof).toBe(5); // undirected: the restatement consumed nothing
  });
});

describe('#1504 — refusals, never silent drops', () => {
  it('tangency to an EQUATION circle is out of scope, by name — no centre and no radius to pull on', () => {
    const d = derive(['נתון מעגל I שמשוואתו x^2+y^2=9', 'מעגל M משיק למעגל I'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['out-of-scope']);
  });

  it('a circle named that does not exist is unknown-reference', () => {
    const d = derive(['נתון מעגל M', 'מעגל M משיק למעגל K'], 0);
    // K is minted by the SENTENCE only when it is the subject; as a target it must exist.
    expect(d.faults.map((f) => f.code)).toEqual(['unknown-reference']);
  });

  it('«המעגלים משיקים» with three circles is ambiguous, with one circle too', () => {
    const three = derive(['נתון מעגל K', 'נתון מעגל M', 'נתון מעגל O', 'המעגלים משיקים'], 0);
    expect(three.faults.map((f) => f.code)).toEqual(['ambiguous-shape']);
    const one = derive(['נתון מעגל K', 'המעגלים משיקים'], 0);
    expect(one.faults.map((f) => f.code)).toEqual(['ambiguous-shape']);
  });

  it('a circle is not tangent to itself', () => {
    const d = derive(['נתון מעגל M', 'המעגל M משיק למעגל M'], 0);
    expect(d.faults.map((f) => f.code)).toEqual(['unsatisfiable']);
  });
});

describe('#1504 — the line and axis tangency family is untouched', () => {
  it('«מעגל M משיק לישר l1» still reads distance = radius', () => {
    const f = build(['נתון הישר l1: y=2x+5', 'מעגל M משיק לישר l1']);
    expect(f.d.faults).toEqual([]);
  });

  it('a mixed list — «מעגל M משיק לציר ה-x ולמעגל K» — is the axis AND the circle', () => {
    const f = build(['נתון מעגל K', 'מעגל M משיק לציר ה-x ולמעגל K']);
    expect(f.d.faults).toEqual([]);
    const m = f.pt('M')!;
    const rM = f.radii()[1]; // K declared first, M minted by the tangency sentence
    expect(Math.abs(Math.abs(m.y) - rM)).toBeLessThan(1e-5);
    expect(['external', 'internal']).toContain(branchOf(f));
  });
});
