/**
 * #1411 ([ADR-577](../../../docs/06-decisions.md#adr-577)) — the stuck branch of `evaluate` names what is
 * MISSING. «M אמצע AB» with no A, B read «unresolved dependencies for: M» — humanised «relies on M», the
 * very point the row creates. When a stuck object relies on a point that is not in the construction at
 * all, the message is now `undefined point: A, B`; a genuine cycle (every parent exists) keeps
 * `unresolved dependencies for: …`.
 */
import { describe, expect, it } from 'vitest';
import { evaluate, evaluateCore } from '@/engine/evaluate';
import type { Construction } from '@/engine/types';

describe('#1411 — evaluate names absent operands, not the stuck point', () => {
  it('a midpoint of two absent points → «undefined point: A, B» (points only, first-reference order)', () => {
    const c: Construction = { objects: [{ kind: 'midpoint', id: 'M', a: 'A', b: 'B' }], constraints: [] };
    const r = evaluate(c);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe('undefined point: A, B');
    expect(r.stuckIds).toEqual(['M']); // attribution is unchanged — the stuck object is still M
  });

  it('deduped across stuck objects, present parents never named', () => {
    const c: Construction = {
      objects: [
        { kind: 'free-point', id: 'A', x: 0, y: 0 },
        { kind: 'midpoint', id: 'M', a: 'A', b: 'B' },
        { kind: 'midpoint', id: 'N', a: 'B', b: 'C' },
      ],
      constraints: [],
    };
    const r = evaluate(c);
    expect(!r.ok && r.error).toBe('undefined point: B, C');
  });

  it('a genuine CYCLE (every parent exists) keeps «unresolved dependencies for: …»', () => {
    const c: Construction = {
      objects: [
        { kind: 'free-point', id: 'A', x: 0, y: 0 },
        { kind: 'midpoint', id: 'P', a: 'Q', b: 'A' },
        { kind: 'midpoint', id: 'Q', a: 'P', b: 'A' },
      ],
      constraints: [],
    };
    const r = evaluateCore(c);
    expect(!r.ok && r.error).toMatch(/^unresolved dependencies for: /);
  });
});
