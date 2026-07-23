/**
 * #295: a bare `מנסרה שבסיסה מקבילית` (parallelogram base, NO ישרה) builds an OBLIQUE `מקבילון`
 * (parallelepiped) — the lateral tilt is a free DOF (ADR-052: rightness is unstated, not defaulted to
 * right), and `המנסרה ישרה` (#289) pins it upright. `מנסרה ישרה שבסיסה מקבילית` stays a right `prism4`.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { freeDofCount3 } from '../engine/evaluate';
import { derive3, useGeo3 } from '../store/store3';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = () => derive3(state().facts, state().seed);
const dof = () => freeDofCount3(derived().construction, derived().resolved);

describe('#295 — bare parallelogram prism parses to an oblique parallelepiped', () => {
  it('«מנסרה שבסיסה מקבילית» → parallelepiped (default ABCD base)', () => {
    expect(parse3('מנסרה שבסיסה מקבילית')).toEqual({
      ok: true,
      commands: [{ type: 'solid', kind: 'parallelepiped', ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] }],
    });
  });

  it('«prism with a parallelogram base» → parallelepiped', () => {
    const r = parse3('prism with a parallelogram base');
    expect(r.ok).toBe(true);
    expect(r.ok && r.commands[0]).toMatchObject({ type: 'solid', kind: 'parallelepiped' });
  });

  it('labelled «מנסרה שבסיסה מקבילית ABCDA\'B\'C\'D\'» keeps the given ids', () => {
    expect(parse3("מנסרה שבסיסה מקבילית ABCDA'B'C'D'")).toEqual({
      ok: true,
      commands: [{ type: 'solid', kind: 'parallelepiped', ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] }],
    });
  });

  it('the ישרה form is NOT shadowed: «מנסרה ישרה שבסיסה מקבילית» stays a right prism4', () => {
    const r = parse3('מנסרה ישרה שבסיסה מקבילית');
    expect(r.ok).toBe(true);
    expect(r.ok && r.commands[0]).toMatchObject({ type: 'solid', kind: 'prism4' });
  });

  it('«מקבילון» is unchanged', () => {
    expect(parse3('מקבילון').ok).toBe(true);
  });

  it('a non-parallelogram base without ישרה stays the honest refusal', () => {
    expect(parse3('מנסרה שבסיסה משולש')).toEqual({ ok: false, reason: 'not-handled' });
  });
});

describe('#295 — the build → pin workflow', () => {
  beforeEach(reset);

  it('«מנסרה שבסיסה מקבילית» builds oblique (5 DOF); «המנסרה ישרה» pins it right (3 DOF, top above base)', () => {
    submit('מנסרה שבסיסה מקבילית');
    expect(state().lastError).toBeNull();
    expect(dof()).toBe(5); // parallelogram base (dx,dy) + free lateral vector (wx,wy,wz)
    submit('המנסרה ישרה');
    expect(state().lastError).toBeNull();
    expect(dof()).toBe(3);
    const pos = derived().positions;
    for (const [base, top] of [['A', "A'"], ['B', "B'"], ['C', "C'"], ['D', "D'"]] as const) {
      const b = pos.get(base)!;
      const tp = pos.get(top)!;
      expect(tp.x).toBeCloseTo(b.x, 9);
      expect(tp.y).toBeCloseTo(b.y, 9);
      expect(tp.z).toBeGreaterThan(b.z + 1e-6);
    }
  });
});
