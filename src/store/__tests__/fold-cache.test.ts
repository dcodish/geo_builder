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

/**
 * #365 (ADR-406) — PREFIX REUSE: appending facts resumes from a cached CLEAN prefix fold instead of
 * re-folding every fact, guarded by the pre-scan signature (the appended facts must change nothing
 * about how the prefix folded). The equivalence discipline: every resumed fold is compared with a COLD
 * fold of the same content (cache evicted via FOLD_CACHE_MAX junk entries) — same statuses, same
 * positions, bit-for-bit.
 */
import { foldStats as fs2 } from '@/store/geoStore';

const evictFoldCache = () => {
  // FOLD_CACHE_MAX = 8, FIFO — eight distinct junk folds push everything else out
  for (let i = 0; i < 8; i++) {
    replay([F(`~evict${i}`, { type: 'free-point', id: `Z${i}`, x: i, y: -i, free: true } as AnyCommand)], 0);
  }
};
const posSig = (r: ReturnType<typeof replay>): string =>
  JSON.stringify([...r.positions.entries()].sort(([a], [b]) => (a < b ? -1 : 1)));

describe('fold prefix reuse — appending pays only the new fact (#365, ADR-406)', () => {
  it('an append RESUMES from the clean prefix and equals the cold fold bit-for-bit', () => {
    const prefix = FACTS.map((f) => ({ ...f }));
    replay(prefix, 0); // warm the prefix fold
    const appended = [...prefix, F('f5', { type: 'free-point', id: 'C', x: 3, y: 4, free: true } as AnyCommand), F('f6', { type: 'segment', a: 'A', b: 'C' } as AnyCommand)];
    const resumesBefore = fs2.resumes;
    const warm = replay(appended, 0);
    expect(fs2.resumes - resumesBefore, 'the append resumed from the prefix fold').toBe(1);
    expect(warm.lastError).toBeNull();
    evictFoldCache();
    const cold = replay(appended.map((f, i) => ({ ...f, id: `c${i}` })), 0);
    expect(cold.lastError).toBeNull();
    expect(posSig(warm), 'resumed ≡ cold — same positions').toBe(posSig(cold));
    expect(Object.values(warm.status), 'resumed ≡ cold — same statuses').toEqual(Object.values(cold.status));
  });

  it('a later SYMBOL BINDING refuses the resume (the appended fact changes how the prefix folded)', () => {
    evictFoldCache();
    const prefix = [
      F('s1', { type: 'free-point', id: 'A', x: 0, y: 0, free: true } as AnyCommand),
      F('s2', { type: 'free-point', id: 'B', x: 8, y: 0, free: true } as AnyCommand),
      F('s3', { type: 'segment', a: 'A', b: 'B' } as AnyCommand),
      F('s4', { type: 'measure-length', a: 'A', b: 'B', expr: { coef: 3, var: 'x' } } as AnyCommand),
    ];
    replay(prefix, 0);
    const resumesBefore = fs2.resumes;
    const withBinding = [...prefix, F('s5', { type: 'set-var', name: 'x', value: 2 } as AnyCommand)];
    const warm = replay(withBinding, 0);
    expect(fs2.resumes - resumesBefore, 'a new binding must NOT resume — the prefix lowering changed').toBe(0);
    // and the binding actually took: |AB| = 3x = 6
    const [A, B] = [warm.positions.get('A')!, warm.positions.get('B')!];
    expect(Math.hypot(B.x - A.x, B.y - A.y)).toBeCloseTo(6, 4);
  });

  it('an explicit equality appended after a soft-default shape refuses the resume and PINS the pair (ADR-114/234)', () => {
    evictFoldCache();
    const prefix = [F('i1', { type: 'shape-variant', shape: 'isosceles', ids: ['A', 'B', 'C'], variant: 0 } as AnyCommand)];
    const r0 = replay(prefix, 0);
    expect(r0.lastError).toBeNull();
    const resumesBefore = fs2.resumes;
    const pinned = [...prefix, F('i2', { type: 'set-equal', a: 'A', b: 'B', c: 'B', d: 'C' } as AnyCommand)];
    const warm = replay(pinned, 0);
    expect(fs2.resumes - resumesBefore, 'an explicit set-equal must NOT resume — it pins the prefix macro').toBe(0);
    expect(warm.lastError).toBeNull();
    evictFoldCache();
    const cold = replay(pinned.map((f, i) => ({ ...f, id: `p${i}` })), 0);
    expect(posSig(warm), 'guarded path ≡ cold fold').toBe(posSig(cold));
  });

  it('a dirty prefix (a failed fact) never resumes', () => {
    evictFoldCache();
    const dirty = [
      F('d1', { type: 'free-point', id: 'A', x: 0, y: 0, free: true } as AnyCommand),
      F('d2', { type: 'set-distance', a: 'A', b: 'Q', value: 3 } as AnyCommand), // Q undefined — fails
    ];
    const r0 = replay(dirty, 0);
    expect(r0.lastError).not.toBeNull();
    const resumesBefore = fs2.resumes;
    replay([...dirty, F('d3', { type: 'free-point', id: 'B', x: 1, y: 1, free: true } as AnyCommand)], 0);
    expect(fs2.resumes - resumesBefore).toBe(0);
  });
});
