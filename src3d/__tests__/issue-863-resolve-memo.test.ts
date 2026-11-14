/**
 * #863 Part A ([ADR-3D-304](../../docs/06b-decisions-3d.md#adr-3d-304)) — ONE solve per configuration.
 *
 * `resolve3` is a pure function of (construction, seed, paramValue), and every derived-value consumer
 * (the derive, the claim verifier, the data panel, the ask lane) reaches it — so it is memoized at that
 * chokepoint, keyed on the construction's identity. Before: the data panel re-solved the derive's own
 * seed and a second panel render re-solved all three panel seeds (the #863 figure: 836 more
 * `leastSquares` solves per panel, 1.44 M residual evaluations). Locked by COUNT, cold and warm — never
 * by clock.
 *
 * #2888 ([ADR-3D-491](../../docs/06b-decisions-3d.md#adr-3d-491), amending ADR-3D-304): the key is the construction's
 * CONTENT, no longer the object. What this file locks is unchanged in purpose (one solve per figure and configuration,
 * and never another figure's resolution); the last test's second half is the one expectation that changed, and says so.
 */
import { seedNumber3 } from '../engine/components3';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { deserializeFigure3 } from '../store/figureFile3';
import { clearSolveCaches3, derive3 } from '../store/store3';
import { dataView } from '../engine/dataView';
import { knowledgeSamples3, resolve3, resolveStats3 } from '../engine/evaluate';
import { leastSquaresStats } from '../engine/solve3';

const DIR = join(__dirname, '..', '..', 'fixtures3');
const load = (file: string) => {
  const r = deserializeFigure3(readFileSync(join(DIR, file), 'utf8'));
  if (!r.ok) throw new Error(`${file}: ${(r as { reason: string }).reason}`);
  return r;
};
const reset = () => {
  resolveStats3.uncached = 0;
  resolveStats3.hits = 0;
  leastSquaresStats.solves = 0;
  leastSquaresStats.evals = 0;
};

describe('#863 Part A — resolve3 is solved once per (construction, configuration)', () => {
  it("the operator's line 3: 1 resolve in the derive, 2 NEW in the panel cold (its own seed is a hit), 0 warm", () => {
    const r = load('symbolic-line-equation-863.geo3.json');
    reset();
    const d = derive3([...r.facts], r.seed);
    expect(resolveStats3.uncached).toBe(1);
    reset();
    dataView(d.construction, r.seed);
    expect(resolveStats3.uncached, 'before: 3 — the panel re-solved the derive’s own seed').toBe(2);
    expect(resolveStats3.hits).toBeGreaterThanOrEqual(1);
    reset();
    dataView(d.construction, r.seed);
    expect(resolveStats3.uncached, 'before: 3 again on every render').toBe(0);
    expect(leastSquaresStats.solves).toBe(0);
  });

  it('a hit returns the SAME resolution — identical object, so no consumer can see two figures', () => {
    const r = load('prism-sym-pair-794.geo3.json');
    const d = derive3([...r.facts], r.seed);
    const c = d.construction;
    expect(resolve3(c, r.seed)).toBe(d.resolved);
    expect(knowledgeSamples3(c, [seedNumber3(r.seed)])[0]).toBe(d.resolved);
  });

  it('the memo is keyed on the configuration: another seed or an explicit parameter value is its own solve', () => {
    const r = load('plane-distance-param-1472.geo3.json');
    const c = { ...derive3([...r.facts], r.seed).construction };
    clearSolveCaches3(); // #2888: a copy has the derive's content, so it is a fresh key (nothing resolved yet) once the content keys are cleared
    const base = resolve3(c, r.seed);
    expect(resolve3(c, seedNumber3(r.seed) + 1)).not.toBe(base);
    const branches = base.param?.branches ?? [];
    expect(branches.length).toBeGreaterThan(1);
    const other = branches.find((v) => v !== base.param!.value)!;
    reset();
    const atOther = resolve3(c, r.seed, { paramValue: other });
    expect(resolveStats3.uncached).toBe(1);
    expect(atOther.param!.value).toBe(other);
    expect(resolve3(c, r.seed, { paramValue: other })).toBe(atOther);
    expect(resolveStats3.uncached).toBe(1);
  });

  it('a DIFFERENT figure is never served another figure’s resolution; a copy of a construction is the same figure (content key)', () => {
    const r = load('symbolic-line-equation-863.geo3.json');
    const c2 = derive3(r.facts.slice(0, 2), r.seed).construction;
    const c3 = derive3(r.facts.slice(0, 3), r.seed).construction;
    expect(resolve3(c2, r.seed)).not.toBe(resolve3(c3, r.seed));
    // #2888 (ADR-3D-491) — AMENDED. This asserted that a shallow copy is a new key and re-solves (1 uncached). A copy has
    // the same content, so it is the same figure and is answered with the first object's resolution…
    const solved = resolve3(c3, r.seed);
    reset();
    expect(resolve3({ ...c3 }, r.seed)).toBe(solved);
    expect(resolveStats3.uncached).toBe(0);
    // …and what the old line protected still holds: a DERIVED construction, one whose content differs in anything at
    // all (here one more angle mark), is its own key and re-solves
    reset();
    const derived = { ...c3, angleMarks: [...c3.angleMarks, { vertex: 'A', p: 'B', q: 'C' }] };
    expect(resolve3(derived, r.seed)).not.toBe(solved);
    expect(resolveStats3.uncached).toBe(1);
  });
});
