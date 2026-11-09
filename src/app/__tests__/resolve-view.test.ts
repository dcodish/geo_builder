/**
 * #572/#573 ([ADR-446](../../../docs/06-decisions.md#adr-446)) — the resolve-view flow: the config
 * search + honest note bound to the "requirements-failing figure about to display" EVENT, with the
 * keep-prior pending state, extracted from the App closure so it is testable at all (S0.4).
 *
 * The integration half runs the OPERATOR'S EXACT saved file (`issue-572-load-collapse.geo.json` —
 * the #566 play figure, saved pre-fix) through `deserializeFigure` + the real search, mirroring
 * what the App's load path now does.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { runViewResolve, type ResolveViewDeps, type ViewResolveFound } from '../resolveView';
import { deserializeFigure } from '@/store/figureFile';
import { findValidConfig, meetsRequirements, replay } from '@/replay/core';
import { useGeoStore, type Fact } from '@/store/geoStore';
import { geoWork, isCancelled } from '@/store/geoWork';
import { buildParseCtx, parse } from '@/parser';
import raw from '../../__tests__/fixtures/issue-572-load-collapse.geo.json?raw';

function fakeDeps(overrides: Partial<ResolveViewDeps> & { facts?: Fact[]; seed?: number }): {
  deps: ResolveViewDeps;
  calls: { pending: boolean[]; applied: ViewResolveFound[]; exhausted: number };
} {
  const calls = { pending: [] as boolean[], applied: [] as ViewResolveFound[], exhausted: 0 };
  // one state object: the store's (facts, seed) identity holds still unless a test moves it (#2757)
  const state = { facts: overrides.facts ?? [], seed: overrides.seed ?? 0 };
  const deps: ResolveViewDeps = {
    getState: () => state,
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
    const found: ViewResolveFound = { facts: [], seed: 7, fold: null, basis: { facts: [], seed: 0 } };
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
        return found ? { ...found, fold: null, basis: { facts: f, seed: s } } : null;
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

/**
 * #2757 ([ADR-812](../../../docs/06-decisions.md#adr-812)) — a search that finishes after the student
 * acted. Vitest has no `Worker`, so `geoWork` answers synchronously and the suite never saw the race;
 * this harness puts the await back (a gated fake worker, the reviewer's probe) and binds `applyView`
 * exactly as `App.tsx`'s `resolveAfterCommit` does (history paused, the real store). Each student
 * action mid-search must leave the store as the student left it.
 */
describe('#2757 — a configuration search that finishes late applies nothing', () => {
  const st = () => useGeoStore.getState();
  const said = () => [...new Set(st().facts.map((f) => f.utterance))]; // one line, one entry
  function submit(u: string): void {
    const { construction, positions } = replay(st().facts, st().seed);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`parse failed: ${u}`);
    st().executeMany(r.commands, u);
  }
  /** The App's resolve, with a worker that answers only when the test releases it. */
  function lateSearch() {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const notes: string[] = [];
    const done = runViewResolve({
      getState: st,
      meetsRequirements: () => false, // the figure "fails": a search runs
      autoResolve: async (facts, seed) => {
        await gate; // ...for as long as the worker takes (up to 12 s in the browser)
        // what the worker answers: the searched figure at another seed (the reviewer's probe)
        return { facts, seed: seed + 3, fold: null, basis: { facts, seed } };
      },
      applyView: (found) => {
        const temporal = useGeoStore.temporal.getState();
        temporal.pause();
        try {
          st().applyView({ facts: found.facts, seed: found.seed, basis: found.basis });
        } finally {
          temporal.resume();
        }
      },
      setPending: () => {},
      onExhausted: () => notes.push('figure.noValidConfig'),
      isCancelled,
    });
    return { finish: async () => { release(); await done; }, notes };
  }

  beforeEach(() => {
    st().clear();
    useGeoStore.temporal.getState().clear();
    submit('משולש ABC');
    submit('BC = 4');
  });

  it.each([
    ['undo', () => useGeoStore.temporal.getState().undo(), ['משולש ABC']],
    ['clear', () => st().clear(), []],
    ['a new line', () => submit('AB = 5'), ['משולש ABC', 'BC = 4', 'AB = 5']],
    ['mute (toggle)', () => st().toggle(st().facts.at(-1)!.id), ['משולש ABC', 'BC = 4']],
    ['edit (✎)', () => {
      const last = st().facts.at(-1)!;
      const { construction, positions } = replay(st().facts.slice(0, -1), st().seed);
      const r = parse('BC = 6', buildParseCtx(construction, positions));
      if (!r.ok) throw new Error('parse');
      st().replaceGroup(last.group, r.commands, 'BC = 6');
    }, ['משולש ABC', 'BC = 6']],
  ] as const)('%s mid-search: the store stays as the student left it', async (_act, act, expected) => {
    const search = lateSearch();
    act();
    const left = { facts: st().facts, seed: st().seed };
    await search.finish();
    expect(said()).toEqual(expected);
    expect(st().facts, 'the very list the student left — nothing written back').toBe(left.facts);
    expect(st().seed).toBe(left.seed);
    expect(search.notes, 'an answer about another figure says nothing either').toEqual([]);
  });

  it('redo mid-search (the search ran on the undone figure): the redone line stays', async () => {
    useGeoStore.temporal.getState().undo();
    const search = lateSearch(); // searching ['משולש ABC']
    useGeoStore.temporal.getState().redo();
    const left = { facts: st().facts, seed: st().seed };
    await search.finish();
    expect(said()).toEqual(['משולש ABC', 'BC = 4']);
    expect(st().facts).toBe(left.facts);
    expect(st().seed).toBe(left.seed);
  });

  it('control: with nothing in between, the late answer applies, merged into the commit\'s undo entry', async () => {
    const before = useGeoStore.temporal.getState().pastStates.length;
    const seed0 = st().seed;
    const search = lateSearch();
    await search.finish();
    expect(st().seed).toBe(seed0 + 3);
    expect(useGeoStore.temporal.getState().pastStates.length).toBe(before);
  });

  it('a display-only change (hiding a point) is not a new figure: the answer still applies', async () => {
    const seed0 = st().seed;
    const search = lateSearch();
    st().toggleHidden('A');
    await search.finish();
    expect(st().seed).toBe(seed0 + 3);
  });

  it('"show another configuration" (the resample search) is superseded by an undo mid-search', async () => {
    const pending = geoWork.resample(st().facts, st().seed); // not awaited: the student acts first
    useGeoStore.temporal.getState().undo();
    const left = st().facts;
    await expect(pending).rejects.toMatchObject({ cancelled: true });
    expect(st().facts).toBe(left);
  });
});
