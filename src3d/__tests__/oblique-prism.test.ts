/**
 * #295: a bare `מנסרה שבסיסה מקבילית` (parallelogram base, NO ישרה) builds an OBLIQUE prism — the lateral
 * tilt is a free DOF (ADR-052: rightness is unstated, not defaulted to right), and `המנסרה ישרה` (#289)
 * pins it upright. `מנסרה ישרה שבסיסה מקבילית` stays a right `prism4`.
 *
 * #321 (ADR-3D-078): the bare form covers the whole parallelogram FAMILY — a rhombus / rectangle /
 * square base lowers to the same oblique prism plus the base's defining constraints (equal adjacent
 * sides / a right base angle / both), driven by the pivot at every seed; `המנסרה ישרה` still pins the
 * tilt, landing the right prism over that base.
 *
 * #349 (ADR-3D-089): obliqueness became a MODIFIER (`oblique: true`) of any prism kind rather than the
 * base-specific `parallelepiped` template, so these parses now read `prism4` + `oblique` — the same solid,
 * one mechanism — and the bases that used to be refused (triangle, general quad) build oblique too.
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
      commands: [{ type: 'solid', kind: 'prism4', oblique: true, ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] }],
    });
  });

  it('«prism with a parallelogram base» → parallelepiped', () => {
    const r = parse3('prism with a parallelogram base');
    expect(r.ok).toBe(true);
    expect(r.ok && r.commands[0]).toMatchObject({ type: 'solid', kind: 'prism4', oblique: true });
  });

  it('labelled «מנסרה שבסיסה מקבילית ABCDA\'B\'C\'D\'» keeps the given ids', () => {
    expect(parse3("מנסרה שבסיסה מקבילית ABCDA'B'C'D'")).toEqual({
      ok: true,
      commands: [{ type: 'solid', kind: 'prism4', oblique: true, ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] }],
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

  // #349 (ADR-3D-089) INVERTED this lock deliberately: a triangle / general-quad base has an honest
  // oblique model now (the tilt is a free DOF), so it BUILDS instead of being refused. What still gets
  // the guidance is a base whose only template would assert an unstated given — see scope3.test.ts.
  it('#349: a triangle / general-quad base without ישרה now BUILDS oblique (was the honest refusal)', () => {
    expect(parse3('מנסרה שבסיסה משולש')).toEqual({
      ok: true,
      commands: [{ type: 'solid', kind: 'prism3', oblique: true, ids: ['A', 'B', 'C', "A'", "B'", "C'"] }],
    });
    expect(parse3('מנסרה שבסיסה מרובע')).toEqual({
      ok: true,
      commands: [{ type: 'solid', kind: 'prism4g', oblique: true, ids: ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"] }],
    });
  });
});

describe('#321 — the parallelogram FAMILY builds oblique: base noun → מקבילון + its constraints', () => {
  const IDS = ['A', 'B', 'C', 'D', "A'", "B'", "C'", "D'"];
  const SOLID = { type: 'solid', kind: 'prism4', oblique: true, ids: IDS };
  const EQUAL_SIDES = { type: 'length-rel', a1: 'A', b1: 'B', rhs: { pair: ['A', 'D'] }, c: 1 };
  const RIGHT_CORNER = {
    type: 'cos-angle',
    u: { kind: 'pair', from: 'A', to: 'B' },
    v: { kind: 'pair', from: 'A', to: 'D' },
    cos: 0,
  };

  it('«מנסרה שבסיסה מעוין» → parallelepiped + equal adjacent sides', () => {
    expect(parse3('מנסרה שבסיסה מעוין')).toEqual({ ok: true, commands: [SOLID, EQUAL_SIDES] });
  });

  it('the double-yod spelling «מנסרה שבסיסה מעויין» and the En mirror parse the same', () => {
    expect(parse3('מנסרה שבסיסה מעויין')).toEqual({ ok: true, commands: [SOLID, EQUAL_SIDES] });
    expect(parse3('prism whose base is a rhombus')).toEqual({ ok: true, commands: [SOLID, EQUAL_SIDES] });
  });

  it('«מנסרה שבסיסה מלבן» → parallelepiped + a right base angle', () => {
    expect(parse3('מנסרה שבסיסה מלבן')).toEqual({ ok: true, commands: [SOLID, RIGHT_CORNER] });
  });

  it('«מנסרה שבסיסה ריבוע» → parallelepiped + both constraints', () => {
    expect(parse3('מנסרה שבסיסה ריבוע')).toEqual({ ok: true, commands: [SOLID, EQUAL_SIDES, RIGHT_CORNER] });
  });

  it('labelled «מנסרה שבסיסה מעוין KLMN» keeps the given ids in the constraint too', () => {
    const r = parse3('מנסרה שבסיסה מעוין KLMN');
    expect(r.ok).toBe(true);
    expect(r.ok && r.commands[1]).toEqual({ type: 'length-rel', a1: 'K', b1: 'L', rhs: { pair: ['K', 'N'] }, c: 1 });
  });

  it('«מקבילון שבסיסו מעוין» — the NAMED oblique solid also takes the base constraint', () => {
    expect(parse3('מקבילון שבסיסו מעוין')).toEqual({ ok: true, commands: [SOLID, EQUAL_SIDES] });
  });

  it('the ישרה forms are NOT shadowed: מעוין → prism4r, ריבוע → prism4sq, מלבן → box', () => {
    for (const [u, kind] of [
      ['מנסרה ישרה שבסיסה מעוין', 'prism4r'],
      ['מנסרה ישרה שבסיסה ריבוע', 'prism4sq'],
      ['מנסרה ישרה שבסיסה מלבן', 'box'],
    ] as const) {
      const r = parse3(u);
      expect(r.ok, u).toBe(true);
      expect(r.ok && r.commands[0]).toMatchObject({ type: 'solid', kind });
      expect(r.ok && r.commands.length, u).toBe(1); // the right-prism kinds carry their base structurally
    }
  });
});

describe('#321 — the constraints DRIVE the base shape at every seed, and «המנסרה ישרה» pins the tilt', () => {
  beforeEach(reset);
  const at = (pos: Map<string, { x: number; y: number; z: number }>, id: string) => pos.get(id)!;
  const sub = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) => ({
    x: p.x - q.x, y: p.y - q.y, z: p.z - q.z,
  });
  const len = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);
  const dot = (v: { x: number; y: number; z: number }, w: { x: number; y: number; z: number }) =>
    v.x * w.x + v.y * w.y + v.z * w.z;
  const baseVecs = (seed: number) => {
    const pos = derive3(state().facts, seed).positions;
    return { ab: sub(at(pos, 'B'), at(pos, 'A')), ad: sub(at(pos, 'D'), at(pos, 'A')), aa: sub(at(pos, "A'"), at(pos, 'A')) };
  };

  it('«מנסרה שבסיסה מעוין» — |AB| = |AD| at every seed, the base ANGLE stays free/oblique (4 DOF)', () => {
    submit('מנסרה שבסיסה מעוין');
    expect(state().lastError).toBeNull();
    expect(dof()).toBe(4); // parallelepiped's 5 dims − the equal-sides drive
    for (const seed of [0, 1, 2, 3]) {
      const { ab, ad } = baseVecs(seed);
      expect(len(ad) / len(ab), `seed ${seed}`).toBeCloseTo(1, 3);
      // a rhombus is NOT silently a square — the seeded oblique corner survives the drive
      expect(Math.abs(dot(ab, ad)) / (len(ab) * len(ad)), `seed ${seed}`).toBeGreaterThan(0.05);
    }
  });

  it('«מנסרה שבסיסה ריבוע» — square base at every seed (3 DOF: the free lateral vector)', () => {
    submit('מנסרה שבסיסה ריבוע');
    expect(state().lastError).toBeNull();
    expect(dof()).toBe(3); // 5 dims − equal-sides − right-corner
    for (const seed of [0, 1, 2]) {
      const { ab, ad } = baseVecs(seed);
      expect(len(ad) / len(ab), `seed ${seed}`).toBeCloseTo(1, 3);
      expect(Math.abs(dot(ab, ad)) / (len(ab) * len(ad)), `seed ${seed}`).toBeLessThan(1e-3);
    }
  });

  it('«מנסרה שבסיסה מלבן» — right base corner at every seed, sides free (4 DOF)', () => {
    submit('מנסרה שבסיסה מלבן');
    expect(state().lastError).toBeNull();
    expect(dof()).toBe(4);
    for (const seed of [0, 1, 2]) {
      const { ab, ad } = baseVecs(seed);
      expect(Math.abs(dot(ab, ad)) / (len(ab) * len(ad)), `seed ${seed}`).toBeLessThan(1e-3);
    }
  });

  it('«מנסרה שבסיסה מעוין» → «המנסרה ישרה» = the right rhombus prism (2 DOF ≡ prism4r: base angle + height)', () => {
    submit('מנסרה שבסיסה מעוין');
    submit('המנסרה ישרה');
    expect(state().lastError).toBeNull();
    expect(dof()).toBe(2); // prism4's 3 dims − the equal-sides drive
    const { ab, ad, aa } = baseVecs(state().seed);
    expect(len(ad) / len(ab)).toBeCloseTo(1, 3); // the base constraint SURVIVES the kind conversion
    // the lateral edge is ⟂ the base plane (rotation-safe assert — no dependence on the world frame)
    expect(Math.abs(dot(aa, ab)) / (len(aa) * len(ab))).toBeLessThan(1e-5);
    expect(Math.abs(dot(aa, ad)) / (len(aa) * len(ad))).toBeLessThan(1e-5);
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
