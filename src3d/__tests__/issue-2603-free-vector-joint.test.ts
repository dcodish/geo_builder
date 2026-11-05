/**
 * #2603 stages b1 + b2 (ADR-3D-407) — a free-vector statement that the figure DEFINES, or that a free letter scales.
 *
 * Measured before (the 2026-10-31 plan at fb94d176, re-measured at 2142a8d1 through the store's submit):
 *  - b1: «AB = p · AD = k·p» and «וקטור u · KB = u · P על AM כך ש-KP = αu + βv» were refused `free-vector-coupling`
 *    («זו מגבלה של הכלי»), although p IS AB and u IS KB — the twins written with the arrow build;
 *  - b2: «וקטור p · A(0,0,0) · AE = t·p» was refused the same way, although p needs no figure to be drawn.
 * b3, the joint pivot ↔ free-vector solve, is #2684 (ADR-3D-421): issue-2684-free-vector-joint.test.ts.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { derive3, useGeo3 } from '../store/store3';
import { cross3, norm3, sub3, type Vec3 } from '../engine/vec3';
import { deserializeFigure3, serializeFigure3 } from '../store/figureFile3';

const st = () => useGeo3.getState();
beforeEach(() => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
});
const run = (lines: readonly string[]) => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  const errs: (string | null)[] = [];
  for (const l of lines) {
    st().submit(l);
    errs.push((st().lastError as { code?: string } | null)?.code ?? null);
  }
  return errs;
};
const built = (seed = 0) => derive3(st().facts, seed);
const pos = (id: string, seed = 0): Vec3 => built(seed).positions.get(id)!;
const near = (a: Vec3, b: Vec3, tol = 1e-7) => norm3(sub3(a, b)) <= tol * Math.max(1, norm3(b));
const SEEDS = [0, 1, 2, 3, 7];
const CUBE = "קובייה ABCDA'B'C'D'";
const Q0 = ['מנסרה ישרה משולשת ABC', "M אמצע B'C'", "K על AA' כך ש-AK = 2KA'"];
const SPAN = 'P על AM כך ש-KP = αu + βv';

/** Run `lines` and its twin; the verdicts must agree, and where both build, the named points sit in the same place. */
const sameAsTwin = (lines: string[], twin: string[], ids: string[]) => {
  const e1 = run(lines);
  const at1 = SEEDS.map((s) => ids.map((id) => built(s).positions.get(id)));
  const e2 = run(twin);
  const at2 = SEEDS.map((s) => ids.map((id) => built(s).positions.get(id)));
  expect(e1[e1.length - 1]).toBe(e2[e2.length - 1]);
  if (e1[e1.length - 1] === null) SEEDS.forEach((_, i) => ids.forEach((_id, j) => expect(near(at1[i][j]!, at2[i][j]!)).toBe(true)));
  return e1;
};

describe('#2603 b1 — a free vector the figure defines IS that arrow', () => {
  it('«AB = p · AD = k·p» answers as «AD = k·AB»', () => {
    const errs = sameAsTwin([CUBE, 'וקטור p', 'AB = p', 'AD = k·p'], [CUBE, 'AD = k·AB'], ['A', 'B', 'D']);
    expect(errs.slice(0, -1)).toEqual([null, null, null]);
    expect(errs[errs.length - 1]).not.toBe('free-vector-coupling');
  });

  it('«AB = p · AE = t·p» still builds, as before (the new-point branch)', () => {
    expect(run([CUBE, 'וקטור p', 'AB = p', 'AE = t·p'])).toEqual([null, null, null, null]);
  });

  it.each([
    ['KB = u'],
    ['u = KB'],
  ])('a span point over «וקטור u · %s» builds like «נסמן: KB = u», P in the same place', (def) => {
    const errs = sameAsTwin([...Q0, "נסמן: AA' = w, KC = v", 'וקטור u', def, SPAN], [...Q0, "נסמן: AA' = w, KC = v, KB = u", SPAN], ['P']);
    expect(errs).toEqual([null, null, null, null, null, null, null]);
    expect(built().construction.points.get('P')?.kind).toBe('in-span');
  });

  // found in round #2678: the metric door (ADR-3D-406) is a third reader of a defined free vector — the same inliner
  it.each([
    ['|p| = 2', '|AB| = 2'],
    ['p ⟂ AD', 'AB ⟂ AD'],
    ['|p| = |AD|', '|AB| = |AD|'],
  ])('a metric given on a figure-defined p, «%s», answers as «%s»', (line, twinLine) => {
    const errs = sameAsTwin([CUBE, 'וקטור p', 'AB = p', line], [CUBE, twinLine], ['A', 'B', 'D']);
    expect(errs[errs.length - 1]).not.toBe('free-vector-coupling');
  });

  it('the reverse order «|p| = 2 · AB = p» agrees (#2684, ADR-3D-421)', () => {
    expect(run([CUBE, 'וקטור p', '|p| = 2', 'AB = p'])).toEqual([null, null, null, null]);
  });

  it('need-basis is unchanged: an undefined «וקטור p» beside u, v, w still does not count', () => {
    expect(run([...Q0, "נסמן: AA' = w, KC = v, KB = u", 'וקטור p', SPAN]).every((e) => e === null)).toBe(true);
  });

  it('save / load keeps the span point', () => {
    run([...Q0, "נסמן: AA' = w, KC = v", 'וקטור u', 'KB = u', SPAN]);
    const loaded = deserializeFigure3(serializeFigure3(st().facts, 0));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const d = derive3(loaded.facts, 0);
    expect(Object.values(d.status).every((x) => x === 'ok')).toBe(true);
    expect(near(d.positions.get('P')!, pos('P'))).toBe(true);
  });
});

describe('#2603 b2 — a free letter scaling a free vector that needs no figure', () => {
  it('«וקטור p · A(0,0,0) · AE = t·p» builds: E = A + t·p, and t and p both move with the seed', () => {
    expect(run(['וקטור p', 'A(0,0,0)', 'AE = t·p'])).toEqual([null, null, null]);
    const ratios = SEEDS.map((s) => {
      const d = built(s);
      const p = d.resolved.freeVectors.get('p')!;
      const ae = sub3(d.positions.get('E')!, d.positions.get('A')!);
      expect(norm3(cross3(ae, p))).toBeLessThan(1e-9 * Math.max(1, norm3(ae) * norm3(p)));
      expect(d.positions.get('A')).toEqual({ x: 0, y: 0, z: 0 });
      return norm3(ae) / norm3(p);
    });
    // ADR-052: t is a free scalar — it is not the same in every configuration
    expect(Math.max(...ratios) - Math.min(...ratios)).toBeGreaterThan(1e-3);
    expect(norm3(sub3(built(0).resolved.freeVectors.get('p')!, built(1).resolved.freeVectors.get('p')!))).toBeGreaterThan(1e-3);
  });

  it('«t = 2» then values it: E = A + 2p at every seed', () => {
    expect(run(['וקטור p', 'A(0,0,0)', 'AE = t·p', 't = 2'])).toEqual([null, null, null, null]);
    for (const s of SEEDS) {
      const d = built(s);
      const p = d.resolved.freeVectors.get('p')!;
      expect(near(d.positions.get('E')!, { x: 2 * p.x, y: 2 * p.y, z: 2 * p.z })).toBe(true);
    }
  });

  it('on a cube, «וקטור p · AE = t·p» builds and moves no cube vertex', () => {
    run([CUBE]);
    const before = SEEDS.map((s) => pos("C'", s));
    expect(run([CUBE, 'וקטור p', 'AE = t·p'])).toEqual([null, null, null]);
    SEEDS.forEach((s, i) => expect(pos("C'", s)).toEqual(before[i]));
  });

  it('a letter the free vector owns is one number with the point’s (#2684, ADR-3D-421)', () => {
    expect(run(['u = (k,1,2)', 'A(0,0,0)', 'AE = k·u'])).toEqual([null, null, null]);
  });
});
