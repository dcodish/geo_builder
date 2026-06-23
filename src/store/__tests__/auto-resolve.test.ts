import { describe, it, expect } from 'vitest';
import { meetsRequirements, findValidConfig, useGeoStore } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

/**
 * Auto-resolve (ADR-106): before drawing, if the figure doesn't meet every requirement (givens verifier
 * clean, builds, extensions reach, points distinct, polygons convex), search alternative configurations —
 * seeds AND discrete branches — for one that does.
 *
 * Branch case: A(0,0), B(8,0), C(4,6) pinned; P = the two circle∩circle points of radius-5 circles about
 * A and B = (4,3) or (4,-3); given |PC| = 3 — only the (4,3) branch satisfies it. Starting on the WRONG
 * branch, the figure is verifier-dirty; findValidConfig must FLIP the branch to make it clean.
 */
const mk = (cmds: AnyCommand[]): Fact[] => cmds.map((cmd, i) => ({ id: 'f' + i, group: 'g' + i, enabled: true, utterance: '', cmd } as Fact));
const branchTest = (branch: number): AnyCommand[] => [
  { type: 'free-point', id: 'A', x: 0, y: 0 },
  { type: 'free-point', id: 'B', x: 8, y: 0 },
  { type: 'free-point', id: 'C', x: 4, y: 6 },
  { type: 'point-by-distances', id: 'P', from1: 'A', dist1: 5, from2: 'B', dist2: 5, branch },
  { type: 'set-distance', a: 'P', b: 'C', value: 3 },
] as AnyCommand[];

describe('auto-resolve — verify then loop over seeds + branches (ADR-106)', () => {
  it('a wrong branch (|PC|≠3) is verifier-dirty; findValidConfig flips to the branch where |PC|=3', () => {
    // Find which branch index is the WRONG one (the figure has a violation).
    const dirty = [0, 1].find((b) => !meetsRequirements(mk(branchTest(b)), 0));
    expect(dirty, 'one branch should be verifier-dirty (|PC|≠3)').toBeDefined();
    const facts = mk(branchTest(dirty!));
    expect(meetsRequirements(facts, 0)).toBe(false);
    const found = findValidConfig(facts, 0);
    expect(found, 'a valid branch exists and is found').not.toBeNull();
    if (!found) return;
    expect(meetsRequirements(found.facts, found.seed), 'the chosen config meets every requirement').toBe(true);
  });

  it('store.autoResolve applies the valid branch and reports success', () => {
    const st = useGeoStore.getState();
    st.clear();
    const dirty = [0, 1].find((b) => !meetsRequirements(mk(branchTest(b)), 0))!;
    for (const cmd of branchTest(dirty)) st.execute(cmd, '');
    expect(meetsRequirements(useGeoStore.getState().facts, useGeoStore.getState().seed)).toBe(false);
    expect(useGeoStore.getState().autoResolve()).toBe(true);
    expect(meetsRequirements(useGeoStore.getState().facts, useGeoStore.getState().seed)).toBe(true);
    st.clear();
  });

  it('a clean figure is left untouched (autoResolve is a no-op)', () => {
    const st = useGeoStore.getState();
    st.clear();
    const clean = [0, 1].find((b) => meetsRequirements(mk(branchTest(b)), 0))!;
    for (const cmd of branchTest(clean)) st.execute(cmd, '');
    const before = JSON.stringify(useGeoStore.getState().facts.map((f) => f.cmd));
    expect(useGeoStore.getState().autoResolve()).toBe(true);
    expect(JSON.stringify(useGeoStore.getState().facts.map((f) => f.cmd))).toBe(before); // unchanged
    st.clear();
  });
});
