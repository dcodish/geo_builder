/**
 * #840 + #839 (ADR-3D-191) — AN UNSTATED ENDPOINT IS FREE, AND CONTAINMENT TAKES A DEGREE OF FREEDOM.
 *
 * Operator, playing `prod/2026-08-31`: *"when i delete the E middle of it doesnt do anything (is
 * yellow). In this case, I think that BE should be drawn with a degree of freedom and having it part of
 * ABCD should even limit the degree of freedom even more. But it doesn't do any of that."*
 *
 * Both halves were true. «קטע BE» with no `E` was refused `unknown-point`, so the segment never existed;
 * and once it did, «BE מוכל במישור ABCD» could only VERIFY it — the pivot solves the gauge and the shape
 * dims, and a free point's position is sampled, outside that unknown vector.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { freeDofCount3 } from '../engine/evaluate';

const reset = () => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
};
function build(lines: string[], seed = 0) {
  useGeo3.setState({ facts: [], seed, lastError: null });
  useGeo3.temporal.getState().clear();
  const errs: string[] = [];
  for (const l of lines) {
    useGeo3.getState().submit(l);
    const e = useGeo3.getState().lastError;
    if (e) errs.push(`${l} → ${JSON.stringify(e)}`);
  }
  const st = useGeo3.getState();
  const d = derive3(st.facts, seed);
  return { errs, d, E: d.positions.get('E'), kindOf: (id: string) => d.construction.points.get(id)?.kind,
    dof: freeDofCount3(d.construction, d.resolved) };
}
const CUBE = ["קובייה ABCDA'B'C'D'", 'מישור ABCD'];
const SEEDS = [0, 1, 2, 17, 101];

describe('#840 — an unstated endpoint is a FREE point, not a refusal', () => {
  beforeEach(reset);

  it('«קטע BE» with no E BUILDS, and mints E free', () => {
    const r = build([...CUBE, 'קטע BE']);
    expect(r.errs).toEqual([]);
    expect(r.kindOf('E')).toBe('free3');
    expect(r.E).toBeDefined();
  });

  it('the free E genuinely MOVES — 3 sampled degrees of freedom, not a default', () => {
    const zs = SEEDS.map((s) => build([...CUBE, 'קטע BE'], s).E!.z);
    expect(new Set(zs.map((z) => z.toFixed(3))).size).toBeGreaterThan(1);
  });

  it('a TYPO is still caught — both endpoints unknown names the undeclared label', () => {
    const r = build([...CUBE, 'קטע QZ']);
    expect(r.errs).toHaveLength(1);
    expect(r.errs[0]).toContain('unknown-point');
  });

  it('a BOUND endpoint keeps its owner — B stays the cube’s vertex', () => {
    expect(build([...CUBE, 'קטע BE']).kindOf('B')).toBe('solid-vertex');
  });

  /**
   * The boundary the first version of this fix got wrong, and `v7-t1` caught: many commands emit a
   * `segment3` as a CARRIER, and minting there would let a NAMING introduce its own subject. Only the
   * drawing register — where the student's whole sentence IS the segment — may create a point.
   */
  it('a segment emitted as a CARRIER never mints — naming needs existing points', () => {
    const r = build(['A(0,2,-1)', 'B(-3,2,2)', 'D(-2,3,1)', 'נסמן: AB = u, AC = v']);
    expect(r.errs).toHaveLength(1);
    expect(r.errs[0]).toContain('unknown-point');
    expect(r.kindOf('C')).toBeUndefined(); // the naming did not conjure its own head
  });
});

describe('#839 — and then containment REMOVES a degree of freedom', () => {
  beforeEach(reset);

  it('«BE מוכל במישור ABCD» is ACCEPTED — it constrains rather than refusing', () => {
    expect(build([...CUBE, 'קטע BE', 'BE מוכל במישור ABCD']).errs).toEqual([]);
  });

  it('E is re-homed onto the plane: free3 → on-plane', () => {
    const r = build([...CUBE, 'קטע BE', 'BE מוכל במישור ABCD']);
    expect(r.kindOf('E')).toBe('on-plane');
  });

  it.each(SEEDS)('seed %i — E LIES in the plane, at every seed', (seed) => {
    const r = build([...CUBE, 'קטע BE', 'BE מוכל במישור ABCD'], seed);
    expect(r.E!.z).toBeCloseTo(0, 6); // plane ABCD is the cube's base
  });

  it('E still SLIDES inside the plane — the statement took one freedom, not all three', () => {
    const pts = SEEDS.map((s) => build([...CUBE, 'קטע BE', 'BE מוכל במישור ABCD'], s).E!);
    expect(new Set(pts.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)).size).toBeGreaterThan(1);
  });

  it('the DOF count drops by exactly one', () => {
    const free = build([...CUBE, 'קטע BE']).dof;
    const held = build([...CUBE, 'קטע BE', 'BE מוכל במישור ABCD']).dof;
    expect(held).toBe(free - 1);
  });

  it('a BOUND endpoint is never re-homed — the claim judges it instead', () => {
    const r = build([...CUBE, 'קטע BE', 'BE מוכל במישור ABCD']);
    expect(r.kindOf('B')).toBe('solid-vertex');
  });
});

describe('#839 — the cases that must NOT change', () => {
  beforeEach(reset);

  it('the entailed case still holds (E already in the plane by construction)', () => {
    expect(build([...CUBE, 'E אמצע AC', 'קטע BE', 'BE מוכל במישור ABCD']).errs).toEqual([]);
  });

  it('a FALSE containment on bound points still refuses', () => {
    const r = build([...CUBE, "AA' מוכל במישור ABCD"]);
    expect(r.errs).toHaveLength(1);
    expect(r.errs[0]).toContain('claim-refuted');
  });
});
