/**
 * #41 (ADR-290) — the geometry-worker split. What's testable off-browser (vitest has no Worker, so
 * `geoWork` runs its SYNC fallback — the same functions, same semantics):
 *   1. the pure `searchResample` matches the store action's behavior (found seed ↔ applied seed);
 *   2. the FOLD transplant: a structured-CLONED FoldNode primed via `primeFoldFor` makes a fresh
 *      replay of (cloned) same-content facts hit the cache — zero fold recomputes (the mechanism
 *      that lets a worker-computed fold serve the main thread);
 *   3. `trialFacts` produces exactly the dry-run's content (the prefold warms what the submit uses);
 *   4. the `geoWork` fallback resolves with the same outcomes as the sync store path.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { buildParseCtx, parse } from '@/parser';
import {
  clearReplayCaches,
  dryRunOutcome,
  foldStats,
  getFoldFor,
  meetsRequirements,
  primeFoldFor,
  replay,
  searchAnotherView,
  trialFacts,
  useGeoStore,
  type Fact,
} from '../geoStore';
import { geoWork, isStaleBasis, supersedeStaleSearches } from '../geoWork';
import type { AnyCommand } from '@/engine';
import { meterAction, workLane } from '../../../shell/workMeter';

let n = 0;
function factsOf(...utterances: string[]): Fact[] {
  const facts: Fact[] = [];
  for (const u of utterances) {
    const { construction, positions } = replay(facts);
    const r = parse(u, buildParseCtx(construction, positions));
    if (!r.ok) throw new Error(`parse failed: ${u}`);
    r.commands.forEach((cmd: AnyCommand) => facts.push({ id: `f${n++}`, group: u, utterance: u, cmd, enabled: true }));
  }
  return facts;
}

describe('searchAnotherView (the pure extraction — ADR-340 composite)', () => {
  it('finds a shape-different view on a figure with free DOFs (no discrete step here → same facts, new seed)', () => {
    const facts = factsOf('מעגל שמרכזו O', 'A על המעגל', 'B על המעגל');
    const found = searchAnotherView(facts, 0);
    expect(found).not.toBeNull();
    expect(found!.seed).toBeGreaterThan(0);
    expect(found!.facts).toBe(facts); // no cyclable branch/variant — the composite is a pure reseed
    expect(meetsRequirements(found!.facts, found!.seed)).toBe(true); // the contract: only validated views
  });
  it('returns null on a fully-determined figure', () => {
    const facts = factsOf('ריבוע ABCD');
    expect(searchAnotherView(facts, 0)).toBeNull();
  });
  it('reports progress', () => {
    const facts = factsOf('מעגל שמרכזו O', 'A על המעגל', 'B על המעגל');
    const ticks: number[] = [];
    searchAnotherView(facts, 0, (k) => ticks.push(k));
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks[0]).toBe(1);
  });
  it('the store action applies exactly the searched composite', () => {
    useGeoStore.setState({ facts: factsOf('מעגל שמרכזו O', 'A על המעגל', 'B על המעגל'), seed: 0 });
    const expected = searchAnotherView(useGeoStore.getState().facts, 0);
    const changed = useGeoStore.getState().resample();
    expect(changed).toBe(expected !== null);
    if (expected !== null) {
      expect(useGeoStore.getState().seed).toBe(expected.seed);
      }
  });
});

describe('the fold transplant (worker → main mechanism)', () => {
  it('a structured-cloned FoldNode primed for cloned same-content facts serves replay with ZERO fold recomputes', () => {
    const facts = factsOf('משולש ABC', 'AD גובה במשולש ABC');
    replay(facts, 0); // compute + cache the fold "worker-side"
    const fold = getFoldFor(facts);
    expect(fold).not.toBeNull();
    // simulate the thread boundary: everything crosses as a structured clone
    const clonedFacts = structuredClone(facts);
    const clonedFold = structuredClone(fold!);
    primeFoldFor(clonedFacts, clonedFold);
    const before = foldStats.computes;
    const d = replay(clonedFacts, 7); // a DIFFERENT seed on new refs — only the tail may run
    expect(foldStats.computes).toBe(before); // the transplanted fold served it — no recompute
    expect(d.lastError).toBeNull();
    expect(d.positions.size).toBeGreaterThan(0);
  });
});

describe('trialFacts — the prefold warms exactly the dry-run content', () => {
  it('dryRunOutcome after a trialFacts replay recomputes NO fold', () => {
    const facts = factsOf('משולש ABC');
    const r = parse('AD גובה במשולש ABC', {});
    if (!r.ok) throw new Error('parse failed');
    replay(facts, 0); // the "current view" fold (dry-run's `before`)
    replay(trialFacts(facts, r.commands), 0); // the prefold
    const before = foldStats.computes;
    const outcome = dryRunOutcome(facts, r.commands, 0);
    expect(outcome.produced).toBe(true);
    expect(foldStats.computes).toBe(before); // both replays inside the dry-run were warm
  });
});

describe('geoWork — the no-Worker fallback (vitest env)', () => {
  beforeEach(() => {
    useGeoStore.setState({ facts: [], seed: 0 });
  });
  it('resample resolves the same COMPOSITE the sync search finds (ADR-340: validated facts + seed, never a bare seed)', async () => {
    const facts = factsOf('מעגל שמרכזו O', 'A על המעגל', 'B על המעגל');
    const sync = searchAnotherView(facts, 0);
    const viaWork = await geoWork.resample(facts, 0);
    expect(viaWork).toEqual(sync && { ...sync, basis: { facts, seed: 0 } }); // + the #2757 basis it ran on
    expect(viaWork, 'this figure has another configuration').not.toBeNull();
    // The contract: whatever is returned is a WHOLE view the caller applies verbatim — and it is valid.
    expect(meetsRequirements(viaWork!.facts, viaWork!.seed)).toBe(true);
  });
  it('autoResolve resolves ok on a requirement-clean figure', async () => {
    const facts = factsOf('ריבוע ABCD');
    expect(await geoWork.autoResolve(facts, 0)).toBe('ok');
  });
  it('prefold returns a usable fold node', async () => {
    const facts = factsOf('משולש KLM');
    const fold = await geoWork.prefold(facts, 0);
    expect(fold).not.toBeNull();
  });
});

/** #2757 (ADR-812): a search result carries the `(facts, seed)` it ran on, and only that figure takes it. */
describe('the search basis — applyView is a compare-and-set, a stale search is superseded', () => {
  const st = () => useGeoStore.getState();
  beforeEach(() => {
    useGeoStore.setState({ facts: factsOf('מעגל שמרכזו O', 'A על המעגל', 'B על המעגל'), seed: 0 });
  });

  it('isStaleBasis: the facts REFERENCE and the seed are the identity (equal content is not enough)', () => {
    const facts = st().facts;
    expect(isStaleBasis({ facts, seed: 0 }, { facts, seed: 0 })).toBe(false);
    expect(isStaleBasis({ facts, seed: 0 }, { facts, seed: 1 })).toBe(true);
    expect(isStaleBasis({ facts, seed: 0 }, { facts: [...facts], seed: 0 })).toBe(true);
  });

  it('applyView applies on its own basis and refuses any other, leaving the store untouched', () => {
    const facts = st().facts;
    expect(st().applyView({ facts, seed: 5, basis: { facts, seed: 0 } })).toBe(true);
    expect(st().seed).toBe(5);
    // a second answer for the figure at seed 0 arrives late: the store is now at seed 5
    expect(st().applyView({ facts: [], seed: 9, basis: { facts, seed: 0 } })).toBe(false);
    expect(st().facts).toBe(facts);
    expect(st().seed).toBe(5);
  });

  it('every search result carries the basis it was searched on — the caller\'s own reference', async () => {
    const facts = st().facts;
    const found = await geoWork.resample(facts, 0);
    expect(found?.basis.facts).toBe(facts);
    expect(found?.basis.seed).toBe(0);
  });

  it('a change of (facts, seed) supersedes a search in flight: it rejects {cancelled}, in the no-Worker fallback too', async () => {
    const pending = geoWork.resample(st().facts, 0);
    useGeoStore.setState({ seed: 7 }); // the store moved on (the subscription fires)
    await expect(pending).rejects.toMatchObject({ cancelled: true });
  });

  it('a search on the CURRENT figure is not superseded, and a display-only change supersedes nothing', async () => {
    const pending = geoWork.resample(st().facts, st().seed);
    st().toggleHidden('A');
    expect(supersedeStaleSearches(st())).toBe(false);
    await expect(pending).resolves.not.toBeNull();
  });
});

describe('the work meter lane (#2873, ADR-W-210): the fallback is the work a browser sends to its worker', () => {
  it('charges every operation of the client to the worker lane, and the same work called directly to the page', async () => {
    const triangle = () => factsOf('משולש ABC', 'AB = 5', 'BC = 6', 'זווית ABC = 40');
    for (const op of [
      (f: Fact[]) => geoWork.prefold(f, 0),
      (f: Fact[]) => geoWork.resample(f, 0),
      (f: Fact[]) => geoWork.autoResolve(f, 0),
      (f: Fact[]) => geoWork.detect(f),
    ]) {
      const facts = triangle();
      clearReplayCaches();
      const m = meterAction();
      await op(facts);
      const work = m.end();
      expect(work.total).toBeGreaterThan(0); // the operation did solve: the lane below is not vacuous
      expect(work.page).toBe(0);
    }
    const facts = triangle();
    clearReplayCaches();
    const m = meterAction();
    replay(facts, 0);
    const direct = m.end();
    expect(direct.total).toBeGreaterThan(0);
    expect(direct.page).toBe(direct.total);
  });

  it('restores the page lane after a fallback that throws', async () => {
    const broken = [{ id: 'x', utterance: 'x', enabled: true, cmd: null }] as unknown as Fact[];
    await geoWork.prefold(broken, 0).catch(() => undefined);
    expect(workLane()).toBe('page');
  });
});
