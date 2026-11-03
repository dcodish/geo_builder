/**
 * #1188 step 4 (ADR-3D-406) — METRIC GIVENS ON FREE VECTORS: a magnitude, a ratio of magnitudes, a dot product, an
 * angle, ⟂ and ∥ over vectors that have no position.
 *
 * Measured at 2142a8d1 through the store's real submit door: «וקטור u · |u| = 5», «u ⟂ v», «u ∥ v», «u·v = 0»,
 * «|u| = |v|», «הזווית בין u ל-v היא 60», «|w+u| = |w-u|» were all refused `free-vector-metric` — step 1's interim
 * refusal, which the operator accepted on 2026-10-28 *"as long as this is in the roadmap to include"*, each step's
 * PR removing the refusal it replaces. This file is where those rows went when they started to build.
 *
 * Every row drives `submit` and reads what `derive3` built, never the parser alone.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import i18n3d from '../i18n';
import { errorText3 } from '../i18n/errorText3';
import { derive3, useGeo3 } from '../store/store3';
import { dataView } from '../engine/dataView';
import { answerQuery } from '../engine/queries';
import { freeDofCount3 } from '../engine/evaluate';
import { add3, cross3, dot3, norm3, sub3, type Vec3 } from '../engine/vec3';
import { deserializeFigure3, serializeFigure3 } from '../store/figureFile3';

const st = () => useGeo3.getState();
beforeEach(() => {
  useGeo3.setState({ facts: [], seed: 0, lastError: null });
  useGeo3.temporal.getState().clear();
});

const run = (lines: readonly string[]) => {
  const errs: (string | null)[] = [];
  for (const l of lines) {
    st().submit(l);
    errs.push((st().lastError as { code?: string } | null)?.code ?? null);
  }
  return errs;
};
const built = (seed = st().seed) => derive3(st().facts, seed);
const text = () => (errorText3((k, o) => i18n3d.t(k, o) as string, st().lastError!) ?? '').replace(/[⁦-⁩]/g, '');
const val = (name: string, seed = 0): Vec3 => built(seed).resolved.freeVectors.get(name)!;
const SEEDS = Array.from({ length: 24 }, (_, i) => i);
const close = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const cos = (a: Vec3, b: Vec3) => dot3(a, b) / (norm3(a) * norm3(b));
const CUBE = "קובייה ABCDA'B'C'D'";

/** Each metric spelling of the step-1 known-gap table, with what must hold at every seed. */
const HOLDS: { lines: string[]; holds: (s: number) => boolean; dof: number }[] = [
  { lines: ['וקטור u', '|u| = 5'], holds: (s) => close(norm3(val('u', s)), 5), dof: 2 },
  { lines: ['וקטור u', 'וקטור v', 'u ⟂ v'], holds: (s) => close(dot3(val('u', s), val('v', s)), 0), dof: 5 },
  { lines: ['וקטור u', 'וקטור v', 'u·v = 0'], holds: (s) => close(dot3(val('u', s), val('v', s)), 0), dof: 5 },
  { lines: ['וקטור u', 'וקטור v', 'u·v = 3'], holds: (s) => close(dot3(val('u', s), val('v', s)), 3), dof: 5 },
  { lines: ['וקטור u', 'וקטור v', '|u| = |v|'], holds: (s) => close(norm3(val('u', s)), norm3(val('v', s))), dof: 5 },
  { lines: ['וקטור u', 'וקטור v', 'הזווית בין u ל-v היא 60'], holds: (s) => close(cos(val('u', s), val('v', s)), 0.5), dof: 5 },
  { lines: ['וקטור u', 'וקטור v', 'u ∥ v'], holds: (s) => norm3(cross3(val('u', s), val('v', s))) < 1e-6 * norm3(val('u', s)) * norm3(val('v', s)), dof: 4 },
  {
    lines: ['וקטור u', 'וקטור w', '|w+u| = |w-u|'],
    holds: (s) => close(norm3(add3(val('w', s), val('u', s))), norm3(sub3(val('w', s), val('u', s)))),
    dof: 5,
  },
];

describe('#1188 step 4 — a metric given on free vectors is honoured at every configuration', () => {
  it.each(HOLDS.map((h) => [h.lines.join(' · '), h] as const))('«%s»', (_label, h) => {
    expect(run(h.lines).every((e) => e === null)).toBe(true);
    for (const s of SEEDS) expect(h.holds(s)).toBe(true);
    // ADR-052: what the given leaves free still moves with «הציגו תצורה אחרת»
    expect(norm3(sub3(val(h.lines[0].slice(-1), 0), val(h.lines[0].slice(-1), 1)))).toBeGreaterThan(1e-3);
    // the DOF cue counts what the given consumed
    expect(freeDofCount3(built().construction, built().resolved)).toBe(h.dof);
  });

  it('a stated magnitude: the panel prints |u| = 5 (knowledge) and no components (they move), and lists the given', () => {
    run(['וקטור u', '|u| = 5']);
    const panel = dataView(built().construction, 0);
    expect(panel.stated).toContain('|u| = 5');
    const e = panel.vectors.find((v) => v.label === 'u')!;
    expect(e.mag).toBe('|u| = 5');
    expect(e.coords).toBeNull();
    expect(answerQuery(built().construction, '|u|', 0).answer).toBe('5');
  });

  it('the stated rows read the relation in vector notation', () => {
    run(['וקטור u', 'וקטור v', 'u ⟂ v', 'u·v = 0', 'הזווית בין u ל-v היא 90', '|u| = |v|', 'וקטור p', 'וקטור q', 'u ∥ p', 'הזווית בין p ל-q היא 60']);
    const stated = dataView(built().construction, 0).stated;
    expect(stated).toEqual(expect.arrayContaining(['u ⟂ v', 'u · v = 0', '|u| = |v|', 'u ∥ p', '∠(p, q) = 60°']));
  });

  it('stability: a metric given on u moves nothing it does not name', () => {
    run(['וקטור u', 'וקטור v']);
    const before = SEEDS.map((s) => val('v', s));
    run(['|u| = 5']);
    SEEDS.forEach((s, i) => expect(val('v', s)).toEqual(before[i]));
  });

  it('with a combination: «w = u + v · |w| = 2» keeps w = u + v and |w| = 2', () => {
    expect(run(['וקטור u', 'וקטור v', 'w = u + v', '|w| = 2'])).toEqual([null, null, null, null]);
    for (const s of SEEDS) {
      expect(close(norm3(val('w', s)), 2)).toBe(true);
      expect(norm3(sub3(val('w', s), add3(val('u', s), val('v', s))))).toBeLessThan(1e-9);
    }
  });

  it('with a stated tuple that satisfies it: «u = (3,0,4) · |u| = 5» builds, in either order', () => {
    expect(run(['u = (3,0,4)', '|u| = 5'])).toEqual([null, null]);
    useGeo3.setState({ facts: [], seed: 0, lastError: null });
    expect(run(['וקטור u', '|u| = 5', 'u = (3,0,4)'])).toEqual([null, null, null]);
    expect(val('u', 3)).toEqual({ x: 3, y: 0, z: 4 });
  });

  it('a named component is solved by the magnitude: «u = (3, a, 0) · |u| = 5» gives |a| = 4', () => {
    expect(run(['u = (3, a, 0)', '|u| = 5'])).toEqual([null, null]);
    for (const s of SEEDS) expect(close(Math.abs(val('u', s).y), 4)).toBe(true);
  });

  it('save / load keeps the given', () => {
    run(['וקטור u', 'וקטור v', 'u ⟂ v', '|u| = 2']);
    const loaded = deserializeFigure3(serializeFigure3(st().facts, 0));
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const d = derive3(loaded.facts, 0);
    expect(Object.values(d.status).every((x) => x === 'ok')).toBe(true);
    expect(close(norm3(d.resolved.freeVectors.get('u')!), 2)).toBe(true);
  });
});

describe('#1188 step 4 — givens that cannot all hold are refused, naming the lines', () => {
  it.each([
    [['וקטור u', 'וקטור v', '|u| = 1', '|v| = 1', '|u + v| = 3'], ['|u| = 1', '|v| = 1']],
    [['u = (1,2,3)', '|u| = 5'], ['u = (1,2,3)']],
    [['וקטור u', '|u| = 5', 'u = (1,2,3)'], ['|u| = 5']],
    [['וקטור u', 'וקטור v', 'u ∥ v', 'u ⟂ v'], ['u ∥ v']],
  ] as const)('«%s»', (lines, others) => {
    const errs = run(lines);
    expect(errs.slice(0, -1).every((e) => e === null)).toBe(true);
    expect(errs[errs.length - 1]).toBe('givens-contradict');
    expect(text()).toContain(`«${lines[lines.length - 1]}»`);
    for (const o of others) expect(text()).toContain(`«${o}»`);
    expect(text()).not.toContain('מגבלה של הכלי');
    expect(st().facts).toHaveLength(lines.length - 1);
  });
});

describe('#1188 step 4 — a metric relation between a free vector and the FIGURE is a joint solve (#2603)', () => {
  it.each([
    [CUBE, 'וקטור p', 'p ⟂ AB'],
    [CUBE, 'וקטור p', 'הזווית בין p ל-AB היא 60'],
    [CUBE, 'וקטור p', 'נסמן: AB = u', 'u·p = 1'],
    [CUBE, 'וקטור p', '|AB| = |p|'],
  ])('«%s · %s · %s» is the tool’s limit, quoting the line', (...lines) => {
    const errs = run(lines);
    expect(errs.slice(0, -1).every((e) => e === null)).toBe(true);
    expect(errs[errs.length - 1]).toBe('free-vector-coupling');
    expect(text()).toContain(`«${lines[lines.length - 1]}»`);
    expect(text()).toContain('מגבלה של הכלי');
  });

  it('a free vector the figure reaches through an equation takes no metric given either («AB = p + q» · «|p| = 1»)', () => {
    const errs = run([CUBE, 'וקטור p', 'וקטור q', 'AB = p + q', '|p| = 1']);
    expect(errs).toEqual([null, null, null, null, 'free-vector-coupling']);
  });

  it('must not change: an anchored vector’s magnitude is the length given, as before', () => {
    expect(run([CUBE, 'נסמן: AB = u', '|u| = 5'])).toEqual([null, null, null]);
    expect(built().construction.freeVecMetrics).toEqual([]);
  });
});
