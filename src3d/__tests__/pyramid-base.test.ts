/**
 * The 4-base pyramid family (operator correction, 2026-07-07): rightness (ישרה —
 * apex above the base centre) and base shape are INDEPENDENT stated givens
 * (ADR-052). `פירמידה ישרה` alone does NOT mean a square base — the aspect stays
 * a free DOF until שבסיסה ריבוע is stated. Plus the הבסיס/"the base" plane
 * sentinel: `AS ניצב לבסיס` resolves the plane from the figure's single solid.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { parse3 } from '../parser/parse3';
import { derive3, useGeo3 } from '../store/store3';
import { freeDofCount3 } from '../engine/evaluate';

function reset() {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
}
const submit = (u: string) => useGeo3.getState().submit(u);
const state = () => useGeo3.getState();
const derived = (seed = state().seed) => derive3(state().facts, seed);
function expectAllOk() {
  const d = derived();
  for (const f of state().facts) expect(d.status[f.id], f.utterance).toBe('ok');
  expect(state().lastError).toBeNull();
}
const dist = (p: { x: number; y: number; z: number }, q: { x: number; y: number; z: number }) =>
  Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);

describe('pyramid base shape is a stated given, not a default', () => {
  beforeEach(reset);

  it('parses all four variants (He + En)', () => {
    const kindOf = (u: string) => {
      const r = parse3(u);
      if (!r.ok) throw new Error(u);
      return (r.commands[0] as { kind: string }).kind;
    };
    expect(kindOf('פירמידה ישרה ABCDS שבסיסה ריבוע')).toBe('pyramid4');
    expect(kindOf('פירמידה ישרה ABCDS')).toBe('pyramid4r');
    expect(kindOf('פירמידה ABCDS שבסיסה ריבוע')).toBe('pyramid4g');
    expect(kindOf('פירמידה ABCDS')).toBe('pyramid4gr');
    expect(kindOf('right pyramid ABCDS with a square base')).toBe('pyramid4');
    expect(kindOf('pyramid ABCDS with a square base')).toBe('pyramid4g');
  });

  it('label-less determined shapes get default lettering — no LLM round-trip', () => {
    const first = (u: string) => {
      const r = parse3(u);
      if (!r.ok) throw new Error(u);
      return r.commands[0] as { kind: string; ids: string[] };
    };
    expect(first('פירמידה שבסיסה ריבוע')).toEqual({ type: 'solid', kind: 'pyramid4g', ids: ['A', 'B', 'C', 'D', 'S'] });
    expect(first('פירמידה ישרה שבסיסה ריבוע').kind).toBe('pyramid4');
    expect(first('pyramid with a square base').kind).toBe('pyramid4g');
    expect(first('פירמידה משולשת').kind).toBe('tetra');
    expect(first('קובייה').ids).toHaveLength(8);
    expect(first('מנסרה ישרה שבסיסה מעוין').kind).toBe('prism4r');
    expect(parse3('פירמידה')).toEqual({ ok: false, reason: 'not-handled' }); // base unknown — honestly ambiguous
    // and it BUILDS
    submit('פירמידה שבסיסה ריבוע');
    expectAllOk();
    expect(derived().positions.has('S')).toBe(true);
  });

  it('a right pyramid WITHOUT a stated square has a free base aspect; WITH it the base is square', () => {
    submit('פירמידה ישרה ABCDS');
    expectAllOk();
    const ratios = [0, 1, 2, 3, 4].map((seed) => {
      const pos = derived(seed).positions;
      return dist(pos.get('A')!, pos.get('B')!) / dist(pos.get('B')!, pos.get('C')!);
    });
    expect(ratios.some((r) => Math.abs(r - 1) > 0.05)).toBe(true); // aspect really varies

    reset();
    submit('פירמידה ישרה ABCDS שבסיסה ריבוע');
    expectAllOk();
    for (const seed of [0, 1, 2, 3]) {
      const pos = derived(seed).positions;
      expect(dist(pos.get('A')!, pos.get('B')!)).toBeCloseTo(dist(pos.get('B')!, pos.get('C')!), 6);
    }
  });

  it('the operator scenario: square-base pyramid + AS ⊥ the base lands S directly above A', () => {
    submit('פירמידה ABCDS שבסיסה ריבוע');
    submit('AS ניצב לבסיס');
    expectAllOk();
    const pos = derived().positions;
    const A = pos.get('A')!;
    const S = pos.get('S')!;
    // AS ⟂ base plane ⇒ S is vertically above A (base is z-planar only pre-gauge,
    // so assert perpendicularity to two base edges instead of raw z)
    const B = pos.get('B')!;
    const D = pos.get('D')!;
    const AS = { x: S.x - A.x, y: S.y - A.y, z: S.z - A.z };
    const AB = { x: B.x - A.x, y: B.y - A.y, z: B.z - A.z };
    const AD = { x: D.x - A.x, y: D.y - A.y, z: D.z - A.z };
    const n = (v: { x: number; y: number; z: number }) => Math.hypot(v.x, v.y, v.z);
    expect(Math.abs(AS.x * AB.x + AS.y * AB.y + AS.z * AB.z) / (n(AS) * n(AB))).toBeLessThan(1e-4);
    expect(Math.abs(AS.x * AD.x + AS.y * AD.y + AS.z * AD.z) / (n(AS) * n(AD))).toBeLessThan(1e-4);
    expect(n(AS)).toBeGreaterThan(0.1); // non-degenerate
    // regularised-nearest: the free height must stay near its seed sample, not run
    // to a needle (the angle-normalized ⟂ residual also shrinks as the apex climbs)
    expect(n(AS)).toBeLessThan(3 * dist(A, B));
  });

  it("height vocabulary: `AS גובה` / `AS אנך` / `AS is the height` all mean ⟂ the base", () => {
    for (const form of ['AS גובה', 'AS אנך', 'AS גובה הפירמידה', 'AS הוא גובה', 'AS is the height', 'AS is the altitude of the pyramid', 'AS אנך לבסיס']) {
      const r = parse3(form);
      if (!r.ok) throw new Error(form);
      const rel = r.commands.find((c) => c.type === 'seg-plane-rel') as { rel: string; plane: string[] };
      expect(rel, form).toBeTruthy();
      expect(rel.rel, form).toBe('perp');
      expect(rel.plane, form).toEqual([]);
    }
    // and it BUILDS: the operator's exact sequence
    submit('פירמידה ABCDS שבסיסה ריבוע');
    submit('AS גובה');
    expectAllOk();
    const pos = derived().positions;
    const A = pos.get('A')!;
    const S = pos.get('S')!;
    const B = pos.get('B')!;
    const dot = (S.x - A.x) * (B.x - A.x) + (S.y - A.y) * (B.y - A.y) + (S.z - A.z) * (B.z - A.z);
    expect(Math.abs(dot)).toBeLessThan(1e-3);
  });

  it('English mirror: perpendicular/parallel to the base', () => {
    submit('pyramid ABCDS with a square base');
    submit('AS is perpendicular to the base');
    expectAllOk();
    reset();
    submit('פירמידה ישרה ABCDS שבסיסה ריבוע');
    submit('E אמצע AS');
    submit('F אמצע BS');
    submit('EF מקביל לבסיס');
    expectAllOk();
  });

  it('the base sentinel without a solid is refused honestly', () => {
    submit('AS ניצב לבסיס');
    expect(state().facts).toHaveLength(0);
    expect(state().lastError).toEqual({ code: 'unknown-plane', id: 'base' });
  });
});

/**
 * #2490 / #2478 (ADR-3D-434) — a pyramid over a base that ALREADY EXISTS is a bound solid. Through the store: every
 * spelling and host of the class builds, the lines a standalone pyramid accepts are accepted, entry order and a
 * placeholder apex do not change the verdict, and the refusals name the statement (never «A» כבר מוגדר). The
 * representation, the apex's freedom and the host's stability are engine3.test.ts's unit locks.
 */
describe('#2490 — a pyramid over an existing base', () => {
  beforeEach(reset);
  const CUBE = "קובייה ABCDA'B'C'D'";
  const build = (lines: readonly string[]) => {
    reset();
    for (const u of lines) submit(u);
  };
  const dof = () => {
    const d = derived();
    return freeDofCount3(d.construction, d.resolved);
  };

  it('every spelling and every host builds, the apex its own (host + 3 DOF, host + 1 when right)', () => {
    const rows: [string[], number][] = [
      [[CUBE, 'פירמידה ABCDS'], 3],
      [[CUBE, 'פירמידה SABCD'], 3],
      [[CUBE, 'the pyramid ABCDS'], 3],
      [[CUBE, 'פירמידה ישרה ABCDS'], 1],
      [[CUBE, 'פירמידה ABCDS שבסיסה ריבוע'], 3],
      [[CUBE, "פירמידה A'B'C'D'S"], 3],
      [[CUBE, "פירמידה ABB'A'S"], 3],
      [[CUBE, "פירמידה ABC'D'S"], 3],
      [[CUBE, 'פירמידה ABCS'], 3],
      [["תיבה ABCDA'B'C'D'", 'פירמידה ABCDS'], 5],
      [['פירמידה SABCD', 'פירמידה TABCD'], 7],
      [['ריבוע ABCD', 'פירמידה ABCDS שבסיסה ריבוע'], 3],
      [['מלבן ABCD', 'פירמידה ABCDS'], 4],
      [['משולש ABC', 'פירמידה ABCS'], 5],
      [['משולש ABC', 'טטראדר ABCD'], 5],
    ];
    for (const [lines, n] of rows) {
      build(lines);
      expectAllOk();
      expect(derived().construction.solids.at(-1)!.bound, lines.join(' · ')).toBeDefined();
      expect(dof(), lines.join(' · ')).toBe(n);
    }
  });

  it('a stated base shape the ring does not yet have drives it: the rectangle becomes a square', () => {
    build(['מלבן ABCD', 'פירמידה ABCDS שבסיסה ריבוע']);
    expectAllOk();
    for (const seed of [0, 1, 2]) {
      const p = derived(seed).positions;
      expect(dist(p.get('A')!, p.get('B')!)).toBeCloseTo(dist(p.get('B')!, p.get('C')!), 6);
    }
  });

  it('the lines a standalone pyramid accepts are accepted on the bound one', () => {
    build([CUBE, 'פירמידה ABCDS', 'גובה הפירמידה', 'נפח הפירמידה ABCDS = 5', '|SA| = 5', 'הזווית בין SC למישור ABCD היא 40']);
    expectAllOk();
    const p = derived().positions;
    expect(dist(p.get('S')!, p.get('A')!)).toBeCloseTo(5, 6);
    build(['ריבוע ABCD', 'פירמידה ABCDS שבסיסה ריבוע', '|SA| = 5']);
    expectAllOk();
    expect(dist(derived().positions.get('S')!, derived().positions.get('A')!)).toBeCloseTo(5, 6);
  });

  it('entry order and a placeholder apex do not change the verdict', () => {
    build(['פירמידה ABCDS שבסיסה ריבוע', 'ריבוע ABCD']);
    expectAllOk();
    build(['ריבוע ABCD', 'פירמידה ABCDS שבסיסה ריבוע']);
    expectAllOk();
    build([CUBE, 'קטע AS', 'פירמידה ABCDS']);
    expectAllOk();
    expect(derived().construction.solids[1]?.bound).toEqual(['A', 'B', 'C', 'D']);
    expect(dof()).toBe(3);
  });

  it('«גובה הפירמידה» names the figure\'s one pyramid among several solids; two pyramids stay a question', () => {
    build([CUBE, 'פירמידה EFGHS', 'גובה הפירמידה']);
    expectAllOk();
    build([CUBE, 'פירמידה ABCDS', "פירמידה A'B'C'D'T", 'גובה הפירמידה']);
    expect(state().lastError).toEqual({ code: 'unknown-plane', id: 'base' });
  });

  it('found in round: a volume naming the pyramid creates its apex over the existing base (FR-SP-25), with the notice', () => {
    build([CUBE, 'נפח הפירמידה ABCDS = 11']);
    expectAllOk();
    const d = derived();
    expect(d.construction.solids[1]?.bound).toEqual(['A', 'B', 'C', 'D']);
    expect(Object.values(d.created)).toEqual([['S']]);
  });

  it('REFUSAL: a base whose letters are not in one plane is refused for that, naming the line', () => {
    build([CUBE, "פירמידה ABCA'S"]);
    expect(state().facts).toHaveLength(1);
    expect(state().lastError).toMatchObject({ code: 'ring-not-flat', stated: "פירמידה ABCA'S", vertices: ['A', 'B', 'C', "A'"] });
  });

  it('REFUSAL: a base whose letters lie on one line is refused as a flattened pyramid, never drawn without its apex', () => {
    build(['A(0,0,0)', 'B(1,0,0)', 'C(2,0,0)', 'פירמידה ABCS']);
    expect(state().facts).toHaveLength(3);
    expect(state().lastError).toMatchObject({ code: 'polygon-collapsed', stated: 'פירמידה ABCS', solid: 'pyramid' });
  });

  it('keeps the refusals that are not this run, and ADR-3D-080\'s all-existing statement', () => {
    build([CUBE, 'טטראדר ABCD']);
    expect(state().lastError).toEqual({ code: 'already-defined', id: 'A' });
    build(['פירמידה SABCD', 'פירמידה ABCDS שבסיסה ריבוע']);
    expect(state().lastError).toEqual({ code: 'already-defined', id: 'A' });
    build(['משולש ABC', 'פירמידה ABCDS']);
    expect(state().lastError).toEqual({ code: 'already-defined', id: 'A' });
    build([CUBE, "פירמידה ABCDA'"]);
    expectAllOk();
    expect(derived().construction.solids).toHaveLength(1);
  });
});
