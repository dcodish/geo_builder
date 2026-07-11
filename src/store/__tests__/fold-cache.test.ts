/**
 * Fold-memo lock ([ADR-280](../../../docs/06-decisions.md#adr-280), issue #59): the seed-independent
 * half of a replay — the apply fold, including the failure-path recruiter — is computed ONCE per
 * fact-list CONTENT; every further seed, and every content-equal facts array (the dry-run trial vs the
 * committed list), pays only the tail. This is the mechanism that turned the operator's 80 s-per-
 * interaction figure into ~0.5 s interactions; the count assertion (not wall-clock — CI-stable) locks
 * it structurally. The operator's actual figure rides the fixtures net (2022-summer-a-issue59.geo.json).
 */
import { describe, expect, it } from 'vitest';
import { foldStats, replay } from '@/store/geoStore';
import type { Fact } from '@/store/geoStore';
import type { AnyCommand } from '@/engine';

const F = (id: string, cmd: AnyCommand): Fact => ({ id, cmd, enabled: true });
const FACTS: Fact[] = [
  F('f1', { type: 'free-point', id: 'A', x: 0, y: 0, free: true } as AnyCommand),
  F('f2', { type: 'free-point', id: 'B', x: 8, y: 0, free: true } as AnyCommand),
  F('f3', { type: 'segment', a: 'A', b: 'B' } as AnyCommand),
  F('f4', { type: 'set-distance', a: 'A', b: 'B', value: 6 } as AnyCommand),
];

describe('fold memo — the seed-independent fold is computed once per fact-list content (ADR-280)', () => {
  it('new seeds and content-equal arrays pay only the tail; changed content refolds', () => {
    const facts = FACTS.map((f) => ({ ...f }));
    const before = foldStats.computes;
    const r0 = replay(facts, 0);
    expect(r0.lastError).toBeNull();
    expect(foldStats.computes - before).toBe(1);

    // A seed sweep / "show another configuration" candidate re-uses the fold — the issue-#59 class
    // (each candidate used to re-pay the whole fold, so one slow figure blew through every budget).
    replay(facts, 7);
    replay(facts, 123);
    expect(foldStats.computes - before).toBe(1);

    // The dry-run trial array and the committed array have different fact ids but identical content —
    // one fold serves both (statuses are stored by index and re-keyed per call).
    const clone: Fact[] = facts.map((f, i) => ({ ...f, id: `x${i}` }));
    const rc = replay(clone, 5);
    expect(foldStats.computes - before).toBe(1);
    expect(rc.lastError).toBeNull();
    expect(rc.status['x3'], 'statuses re-key to the calling array’s fact ids').toBe('ok');

    // Different content (a toggled fact) is a different fold.
    const toggled = facts.map((f, i) => (i === 3 ? { ...f, enabled: false } : f));
    replay(toggled, 0);
    expect(foldStats.computes - before).toBe(2);
  });

  it('the sampled tail still varies with the seed (the fold cache must not freeze the figure)', () => {
    const facts = FACTS.map((f) => ({ ...f, id: `s-${f.id}` }));
    const p0 = replay(facts, 0).positions.get('B')!;
    const p9 = replay(facts, 9).positions.get('B')!;
    expect(Math.hypot(p0.x - p9.x, p0.y - p9.y)).toBeGreaterThan(1e-6);
  });
});
