/**
 * #2796 ([ADR-853](../../docs/06-decisions.md#adr-853)) — SEPARATE SHAPES ARE SOLVED, SAMPLED AND JUDGED PART BY PART.
 *
 * pipeline-lock: the cross-builder lock (`shell/__tests__/fixtures/independent-parts-2764.ts`) and the class — "the
 * order the same shapes are typed in decides whether the figure is accepted", "a line on one shape moves the others" —
 * are visible only through the submit path (gate → commit → post-commit search); the engine's units are in
 * `engine/__tests__/components.test.ts`.
 *
 * Measured on `main` @ 3f6132c2 through this driver: the ninth line («דלתון») took a 3.7 s gate, a 4.3 s commit, failed
 * its requirements at configuration 0, and the post-commit search found a configuration only after 84.8 s; the kite
 * moved K by 2.00 (turning IJKL into a parallelogram) and O, P by 5.98. Kite-first and reversed were accepted at 0.
 *
 * Budgets are OPERATION counts (`work.done`, the deterministic solve-work units), never a clock (docs/17 §7).
 */
import { describe, expect, it } from 'vitest';
import { independentPartsSuite, NINE_SEPARATE_SHAPES } from '../../shell/__tests__/fixtures/independent-parts-2764';
import { useGeoStore } from '@/store/geoStore';
import { findValidConfig, meetsRequirements, replay, type Fact } from '@/replay/core';
import { deserializeFigure, figureStateOf, serializeFigure, serializeFigureForLink } from '@/store/figureFile';
import { partsOf, seedNumber, seedOfPart, seedPartsOf, withPartSeed, type Seed } from '@/engine/components';
import { work } from '@/engine/solveBudget';
import { gateVerdict } from './submit-gate';
import { factsOf } from './scenarios-harness';

/** The app's path for one typed line: the gate, the commit, and the post-commit search when the view fails. */
function type(line: string): { recorded: boolean; work: number } {
  const w0 = work.done;
  const st = useGeoStore.getState();
  const v = gateVerdict(st.facts, line, st.seed);
  if (v.kind !== 'commit') return { recorded: false, work: work.done - w0 };
  const group = `g${st.facts.length}`;
  for (const c of v.commands) useGeoStore.getState().execute(c, line, group);
  const now = useGeoStore.getState();
  if (!meetsRequirements(now.facts, now.seed)) {
    const found = findValidConfig(now.facts, now.seed);
    if (!found) return { recorded: false, work: work.done - w0 };
    useGeoStore.setState({ facts: found.facts, seed: found.seed });
  }
  const end = useGeoStore.getState();
  const d = replay(end.facts, end.seed);
  return { recorded: d.lastError === null && end.facts.every((f) => d.status[f.id] === 'ok') && meetsRequirements(end.facts, end.seed), work: work.done - w0 };
}
const reset = (seed: Seed = 0) => {
  useGeoStore.getState().clear();
  useGeoStore.setState({ seed });
};
const drawn = (): Map<string, readonly number[]> => {
  const st = useGeoStore.getState();
  return new Map([...replay(st.facts, st.seed).positions].map(([id, p]) => [id, [p.x, p.y]]));
};

/** Measured after the fix (work units per line, seed 0; the kite was the 3.7 s + 4.3 s + 84.8 s line) — the budget is twice that. */
const AFTER = [3, 2, 7087, 47847, 33806, 33830, 33852, 33872, 528341];

independentPartsSuite('2-D', {
  reset: () => reset(0),
  type: (line) => ({ ...type(line), points: drawn() }),
  budget: AFTER.map((n) => Math.max(1000, 2 * n)),
});

describe('#2796 — whether the figure is accepted does not depend on the order the shapes were typed in', () => {
  const orders: [string, readonly string[]][] = [
    ['as typed (kite last)', NINE_SEPARATE_SHAPES],
    ['kite first', ['דלתון', ...NINE_SEPARATE_SHAPES.slice(0, 8)]],
    ['reversed', [...NINE_SEPARATE_SHAPES].reverse()],
  ];
  it.each(orders)('%s: every line records and the figure meets every requirement at the committed configuration', (_label, lines) => {
    reset(0);
    for (const line of lines) expect(type(line).recorded, line).toBe(true);
    const st = useGeoStore.getState();
    expect(meetsRequirements(st.facts, st.seed)).toBe(true);
    expect(partsOf(replay(st.facts, st.seed).construction).length).toBe(9);
  });
});

describe('#2796 — the search walks only the part that fails; the others keep their entries', () => {
  it('a part moved to its own entry leaves every other part drawn exactly as before', () => {
    reset(0);
    for (const line of NINE_SEPARATE_SHAPES) type(line);
    const st = useGeoStore.getState();
    const parts = partsOf(replay(st.facts, st.seed).construction);
    const kite = parts[parts.length - 1];
    const before = drawn();
    // the kite alone at another number: every other part where it was
    const moved = withPartSeed(st.seed, kite.key, 7);
    const after = new Map([...replay(st.facts, moved).positions].map(([id, p]) => [id, [p.x, p.y]]));
    for (const p of parts.slice(0, -1)) for (const id of p.ids) {
      const a = before.get(id), b = after.get(id);
      if (!a || !b) continue;
      expect(Math.hypot(a[0] - b[0], a[1] - b[1]), id).toBeLessThanOrEqual(1e-9);
    }
  });

  it('findValidConfig from a configuration where one part fails moves that part’s entry only', () => {
    const facts: Fact[] = factsOf(['ריבוע ABCD', 'טרפז שווה שוקיים EFGH']);
    const parts = partsOf(replay(facts, 0).construction);
    expect(parts.length).toBe(2);
    // a number at which the trapezoid part fails its requirements (it meets at about half of them, #2796 §1)
    const at = Array.from({ length: 60 }, (_, s) => s).find((s) => !meetsRequirements(facts, withPartSeed(0, parts[1].key, s)));
    expect(at, 'some number fails the trapezoid').toBeDefined();
    const from = withPartSeed(0, parts[1].key, at!);
    const found = findValidConfig(facts, from);
    expect(found).not.toBeNull();
    expect(meetsRequirements(found!.facts, found!.seed)).toBe(true);
    expect(seedOfPart(found!.seed, parts[0].key), 'the square keeps its entry').toBe(0);
  });
});

describe('#2796 — the per-part configuration on disk (`seed` a number, `seedParts` beside it)', () => {
  const figure = () => {
    reset(0);
    for (const line of NINE_SEPARATE_SHAPES) type(line);
    const st = useGeoStore.getState();
    const parts = partsOf(replay(st.facts, st.seed).construction);
    const seed = withPartSeed(withPartSeed(3, parts[2].key, 11), parts[8].key, 5);
    useGeoStore.setState({ seed });
    return useGeoStore.getState();
  };

  it('the file and the share link write the base as a number and the entries in `seedParts`, and load back the same drawing', () => {
    const st = figure();
    const before = drawn();
    for (const text of [serializeFigure(figureStateOf(st)), serializeFigureForLink(figureStateOf(st))]) {
      const raw = JSON.parse(text);
      expect(raw.seed).toBe(3);
      expect(raw.seedParts).toEqual(seedPartsOf(st.seed));
      const r = deserializeFigure(text);
      expect(r.ok).toBe(true);
      if (!r.ok) continue;
      expect(r.file.seed).toEqual(st.seed);
      useGeoStore.getState().loadFigure(r.file);
      const after = drawn();
      for (const [id, p] of before) expect(Math.hypot(p[0] - after.get(id)![0], p[1] - after.get(id)![1]), id).toBeLessThanOrEqual(1e-9);
    }
  });

  it('a file saved before the change (`seed: 7`, no `seedParts`) loads at 7, every part there; a malformed entry is dropped', () => {
    const st = figure();
    const raw = JSON.parse(serializeFigure(figureStateOf(st)));
    raw.seed = 7;
    delete raw.seedParts;
    const old = deserializeFigure(JSON.stringify(raw));
    expect(old.ok && old.file.seed).toBe(7);
    raw.seedParts = { [Object.keys(seedPartsOf(st.seed)!)[0]]: 'x', other: 2 };
    const bad = deserializeFigure(JSON.stringify(raw));
    expect(bad.ok && bad.file.seed).toEqual({ seed: 7, parts: { other: 2 } });
    expect(seedNumber(bad.ok ? bad.file.seed : 0)).toBe(7);
  });
});
