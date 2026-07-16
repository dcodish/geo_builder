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
import { geoWork } from '../geoWork';
import type { AnyCommand } from '@/engine';

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
    useGeoStore.setState({ facts: factsOf('מעגל שמרכזו O', 'A על המעגל', 'B על המעגל'), seed: 0, radiusOverrides: { 'circle-O': 3 } });
    const expected = searchAnotherView(useGeoStore.getState().facts, 0);
    const changed = useGeoStore.getState().resample();
    expect(changed).toBe(expected !== null);
    if (expected !== null) {
      expect(useGeoStore.getState().seed).toBe(expected.seed);
      expect(useGeoStore.getState().radiusOverrides).toEqual({}); // a fresh view clears dialed radii
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
    useGeoStore.setState({ facts: [], seed: 0, radiusOverrides: {} });
  });
  it('resample resolves the same COMPOSITE the sync search finds (ADR-340: validated facts + seed, never a bare seed)', async () => {
    const facts = factsOf('מעגל שמרכזו O', 'A על המעגל', 'B על המעגל');
    const sync = searchAnotherView(facts, 0);
    const viaWork = await geoWork.resample(facts, 0);
    expect(viaWork).toEqual(sync);
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
