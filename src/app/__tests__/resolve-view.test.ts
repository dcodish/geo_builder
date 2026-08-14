/**
 * #572/#573 ([ADR-446](../../../docs/06-decisions.md#adr-446)) — the resolve-view flow: the config
 * search + honest note bound to the "requirements-failing figure about to display" EVENT, with the
 * keep-prior pending state, extracted from the App closure so it is testable at all (S0.4).
 *
 * The integration half runs the OPERATOR'S EXACT saved file (`issue-572-load-collapse.geo.json` —
 * the #566 play figure, saved pre-fix) through `deserializeFigure` + the real search, mirroring
 * what the App's load path now does.
 */
import { describe, expect, it } from 'vitest';
import { runViewResolve, type ResolveViewDeps, type ViewResolveFound } from '../resolveView';
import { deserializeFigure } from '@/store/figureFile';
import { findValidConfig, meetsRequirements, replay } from '@/replay/core';
import type { Fact } from '@/store/geoStore';
import raw from '../../__tests__/fixtures/issue-572-load-collapse.geo.json?raw';

function fakeDeps(overrides: Partial<ResolveViewDeps> & { facts?: Fact[]; seed?: number }): {
  deps: ResolveViewDeps;
  calls: { pending: boolean[]; applied: ViewResolveFound[]; exhausted: number };
} {
  const calls = { pending: [] as boolean[], applied: [] as ViewResolveFound[], exhausted: 0 };
  const deps: ResolveViewDeps = {
    getState: () => ({ facts: overrides.facts ?? [], seed: overrides.seed ?? 0 }),
    meetsRequirements: () => false,
    autoResolve: async () => null,
    applyView: (f) => calls.applied.push(f),
    setPending: (on) => calls.pending.push(on),
    onExhausted: () => calls.exhausted++,
    isCancelled: () => false,
    ...overrides,
  };
  return { deps, calls };
}

describe('runViewResolve — the state machine', () => {
  it('a requirements-MEETING figure pays nothing: no pending, no search', async () => {
    const { deps, calls } = fakeDeps({ meetsRequirements: () => true, autoResolve: async () => { throw new Error('must not search'); } });
    await runViewResolve(deps);
    expect(calls.pending).toEqual([]);
    expect(calls.applied).toEqual([]);
  });

  it('a failing figure holds the view (pending true→false) and applies the found composite', async () => {
    const found: ViewResolveFound = { facts: [], seed: 7, fold: null };
    const { deps, calls } = fakeDeps({ autoResolve: async () => found });
    await runViewResolve(deps);
    expect(calls.pending).toEqual([true, false]);
    expect(calls.applied).toEqual([found]);
    expect(calls.exhausted).toBe(0);
  });

  it('an exhausted search surfaces the note and releases the hold — never a stuck pending flag', async () => {
    const { deps, calls } = fakeDeps({ autoResolve: async () => null });
    await runViewResolve(deps);
    expect(calls.pending).toEqual([true, false]);
    expect(calls.exhausted).toBe(1);
  });

  it('a cancelled search is silent; a real error rethrows — pending released either way', async () => {
    const cancel = new Error('cancelled');
    const { deps, calls } = fakeDeps({ autoResolve: async () => { throw cancel; }, isCancelled: (e) => e === cancel });
    await runViewResolve(deps); // swallowed
    expect(calls.pending).toEqual([true, false]);
    const boom = new Error('boom');
    const { deps: d2, calls: c2 } = fakeDeps({ autoResolve: async () => { throw boom; } });
    await expect(runViewResolve(d2)).rejects.toBe(boom);
    expect(c2.pending).toEqual([true, false]);
  });
});

describe("#572 — the operator's saved collapse file, through the real load + search", () => {
  it('loading issue-572-load-collapse.geo.json rescues the seat instead of re-drawing the collapse', async () => {
    const r = deserializeFigure(raw);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { facts, seed } = r.file;
    // the defect precondition: the file's saved view fails requirements (the C-on-A collapse)
    expect(meetsRequirements(facts, seed), 'the saved view is the collapse').toBe(false);
    const applied: ViewResolveFound[] = [];
    const { deps } = fakeDeps({
      facts,
      seed,
      meetsRequirements,
      // the worker's own semantics, run synchronously (ADR-290's search is pure)
      autoResolve: async (f, s) => {
        if (meetsRequirements(f, s)) return 'ok';
        const found = findValidConfig(f, 0);
        return found ? { ...found, fold: null } : null;
      },
      applyView: (f) => applied.push(f),
    });
    await runViewResolve(deps);
    expect(applied, 'the load-path rescue applies a valid view').toHaveLength(1);
    const fig = replay(applied[0].facts as Fact[], applied[0].seed);
    const at = (id: string) => fig.positions.get(id)!;
    const d = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y);
    const [A, B, C] = ['A', 'B', 'C'].map(at);
    const span = Math.max(d(A, B), d(B, C), d(A, C));
    expect(d(A, C) / span, 'no collapse — |AC| is a real side').toBeGreaterThan(0.1);
    const dot = (B.x - A.x) * (B.x - C.x) + (B.y - A.y) * (B.y - C.y);
    expect(Math.abs(dot) / (d(A, B) * d(B, C)), 'the seat landed at B').toBeLessThan(1e-4);
    expect(meetsRequirements(applied[0].facts as Fact[], applied[0].seed)).toBe(true);
  });
});
