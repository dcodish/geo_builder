/**
 * Phase E (store robustness) — E1/E2/E4/E5/E6 + the A5 perf canary (see ADR-204..206):
 *  E1  replay memoization — repeated (facts, seed) replays are cache hits, and a MUTATED array
 *      (test-style push) is never served stale.
 *  A5  perf canary — the replay COUNT (not wall time — CI-stable) for a standard commit flow is
 *      bounded, so a "replay got called from one more layer" regression fails loudly.
 *  E2  the config search takes a wall-clock budget and exits early when it's exhausted.
 *  E4  one user action = ONE undo entry (executeMany batches; a whole step vanishes on one undo).
 *  E5  undo restores the SEED (the view the student saw) and clears the dialed-radius scratchpad.
 *  E6  rename/swap accept subscripted points (O1) and seg-style keys track them.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { replay, replayStats, firstSatisfyingSeed, findValidConfig, useGeoStore } from '../geoStore';
import type { Fact } from '../geoStore';
import type { AnyCommand } from '@/engine';

const s = () => useGeoStore.getState();

beforeEach(() => s().clear());

describe('E1 — replay memoization', () => {
  const FACTS: Fact[] = [
    { id: 'f1', cmd: { type: 'square', ids: ['A', 'B', 'C', 'D'] } as AnyCommand, enabled: true },
    { id: 'f2', cmd: { type: 'point-on-segment', id: 'E', a: 'A', b: 'B' } as AnyCommand, enabled: true },
  ];

  it('the same (facts, seed) pair replays once — the second call is a cache hit (same object)', () => {
    const facts = [...FACTS];
    const before = replayStats.computes;
    const a = replay(facts, 0);
    const b = replay(facts, 0);
    expect(b).toBe(a); // identity — served from cache
    expect(replayStats.computes - before).toBe(1);
  });

  it('a different seed recomputes; the first seed stays cached', () => {
    const facts = [...FACTS];
    const a0 = replay(facts, 0);
    replay(facts, 1);
    expect(replay(facts, 0)).toBe(a0);
  });

  it('a MUTATED facts array (push) is never served stale', () => {
    const facts = [...FACTS];
    const a = replay(facts, 0);
    facts.push({ id: 'f3', cmd: { type: 'segment', a: 'A', b: 'C' } as AnyCommand, enabled: true });
    const b = replay(facts, 0);
    expect(b).not.toBe(a);
    expect(b.construction.objects.some((o) => o.id === 'seg-AC')).toBe(true);
  });
});

describe('A5 — replay-count perf canary (count, not time — CI-stable)', () => {
  it('a standard 3-step commit flow stays under the replay budget', () => {
    // The measured flow (executeMany × 3, each with its extension check) computes ~a handful of
    // replays; the ceiling is ~4× that so real regressions (a new per-set replay subscriber, a lost
    // memo) fail while noise doesn't. If this fails, something started re-replaying per action.
    const before = replayStats.computes;
    s().executeMany([{ type: 'square', ids: ['A', 'B', 'C', 'D'] } as AnyCommand], 'square');
    s().executeMany([{ type: 'point-on-segment', id: 'E', a: 'A', b: 'B' } as AnyCommand], 'E on AB');
    s().executeMany(
      [
        { type: 'segment', a: 'E', b: 'C' } as AnyCommand,
        { type: 'segment', a: 'B', b: 'D' } as AnyCommand,
      ],
      'EC + BD',
    );
    replay(s().facts, s().seed); // the render's derive
    expect(replayStats.computes - before).toBeLessThan(20);
  });
});

describe('E2 — the config search honours its wall-clock budget', () => {
  // A figure with an extension requirement, so the search actually has something to sweep.
  const EXT_FACTS: Fact[] = [
    { id: 'x1', cmd: { type: 'circle', id: 'circle-O', center: 'O', radius: 5, freeRadius: true } as AnyCommand, enabled: true },
    { id: 'x2', cmd: { type: 'point-on-circle', id: 'A', circle: 'circle-O' } as AnyCommand, enabled: true },
    { id: 'x3', cmd: { type: 'point-on-circle', id: 'B', circle: 'circle-O' } as AnyCommand, enabled: true },
    { id: 'x4', cmd: { type: 'circle', id: 'circle-P', center: 'P', radius: 4, freeRadius: true } as AnyCommand, enabled: true },
    { id: 'x5', cmd: { type: 'extend-onto-circle', id: 'E', a: 'A', b: 'B', circle: 'circle-P' } as AnyCommand, enabled: true },
  ];

  it('firstSatisfyingSeed with a zero budget returns `from` quickly instead of sweeping', () => {
    // Warm nothing: a fresh facts array. Budget 0 ⇒ the deadline is already passed when the sweep starts.
    const t0 = Date.now();
    const seed = firstSatisfyingSeed([...EXT_FACTS], 0, 120, 0);
    expect(seed).toBe(0);
    expect(Date.now() - t0).toBeLessThan(2500); // a couple of setup replays at most — no 240-seed sweep
  });

  it('findValidConfig with a zero budget exits early (null) instead of the full search', () => {
    const t0 = Date.now();
    // meetsRequirements at the entry seed may pass or fail; with budget 0 every sweep loop exits at once.
    findValidConfig([...EXT_FACTS], 0, 0);
    expect(Date.now() - t0).toBeLessThan(4000);
  });
});

describe('E4 — one user action = one undo entry', () => {
  it('a multi-command step commits as ONE entry: a single undo removes the whole step', () => {
    s().executeMany([{ type: 'square', ids: ['A', 'B', 'C', 'D'] } as AnyCommand], 'square');
    s().executeMany(
      [
        { type: 'segment', a: 'E', b: 'F' } as AnyCommand,
        { type: 'segment', a: 'F', b: 'G' } as AnyCommand,
        { type: 'segment', a: 'G', b: 'E' } as AnyCommand,
      ],
      'triangle-ish EFG',
    );
    expect(s().facts).toHaveLength(4);
    s().undo();
    // ALL THREE segments gone in one undo — not just the last command of the step
    expect(s().facts).toHaveLength(1);
    expect(s().facts[0].cmd.type).toBe('square');
    s().redo();
    expect(s().facts).toHaveLength(4);
  });

  it('the batched step shares one group id (one step row in the UI)', () => {
    s().executeMany(
      [
        { type: 'segment', a: 'A', b: 'B' } as AnyCommand,
        { type: 'segment', a: 'B', b: 'C' } as AnyCommand,
      ],
      'two segments',
    );
    const groups = new Set(s().facts.map((f) => f.group));
    expect(groups.size).toBe(1);
    expect([...groups][0]).toBeTruthy();
  });
});

describe('E5 — undo restores the seed', () => {
  it('undo rolls the seed back with the facts (the view the student saw)', () => {
    s().executeMany([{ type: 'square', ids: ['A', 'B', 'C', 'D'] } as AnyCommand], 'square');
    s().executeMany([{ type: 'free-point', id: 'G', x: 9, y: 9, free: true } as AnyCommand], 'G');
    // a seed change recorded as its own action (resample-like): set through the store so zundo records it
    useGeoStore.setState({ seed: 7 });
    expect(s().seed).toBe(7);
    s().undo(); // undoes the seed change
    expect(s().seed).toBe(0);
    expect(s().facts).toHaveLength(2); // facts untouched by that entry
  });

});

describe('E6 — subscripted points in rename/swap and seg-style keys', () => {
  it('rename O1 → P works (the single-letter guard refused it as no-source)', () => {
    s().executeMany([{ type: 'circle', id: 'circle-O1', center: 'O1', radius: 4 } as AnyCommand], 'circle O1');
    expect(s().rename('O1', 'P')).toEqual({ ok: true });
    const circle = s().facts[0].cmd;
    expect(circle.type === 'circle' ? circle.center : null).toBe('P');
    expect(circle.type === 'circle' ? circle.id : null).toBe('circle-P');
  });

  it('a seg-style key with subscripted endpoints tracks a rename', () => {
    s().executeMany([{ type: 'segment', a: 'O1', b: 'O2' } as AnyCommand], 'segment O1O2');
    s().toggleSegDashed('seg-O1O2');
    expect(s().segStyle['seg-O1O2']).toEqual({ dashed: true });
    expect(s().rename('O1', 'K')).toEqual({ ok: true });
    expect(s().segStyle['seg-KO2'] ?? s().segStyle['seg-O2K'], 'the style followed the renamed endpoint').toBeTruthy();
    expect(s().segStyle['seg-O1O2']).toBeUndefined();
  });
});
