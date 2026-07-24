/**
 * Span accounting — SHADOW MODE unit locks (S3.1 of docs/24; the deferred ADR-250 mechanism).
 *
 * The accountant never refuses anything yet (the enforcing flip is the operator's, docs/24 §4.2) —
 * these tests lock its CLASSIFICATION behavior: a dropped label/number is flagged, a complete parse
 * of a catalog-style utterance is clean in the hard buckets, and the unknown-word bucket (the
 * accountant's own coverage debt) is reported separately, never silently absorbed. The corpus-wide
 * divergence sweep lives in `span-shadow-report` (env-gated: SPAN_SHADOW=1) and writes
 * reports/span-accounting-shadow.md for the operator review that precedes any enforcement.
 */
import { describe, expect, it } from 'vitest';
import { accountUtterance, spanShadow } from '../spanAccounting';
import type { AnyCommand } from '@/engine';

const SQUARE: AnyCommand[] = [{ type: 'square', ids: ['A', 'B', 'C', 'D'] } as AnyCommand];

describe('span accounting (shadow) — hard buckets', () => {
  it('a fully-accounted utterance is clean', () => {
    expect(spanShadow('ריבוע ABCD', SQUARE)).toBeNull();
  });

  it('a dropped stated LABEL is flagged (the ADR-089 class, generalized)', () => {
    const spans = accountUtterance('ריבוע ABCD ונקודה E על AB', SQUARE); // E nowhere in the commands
    expect(spans.some((s) => s.kind === 'label' && s.text === 'E')).toBe(true);
  });

  it('a dropped stated NUMBER is flagged (the ADR-250 class, generalized)', () => {
    const spans = accountUtterance('ריבוע ABCD שצלעו 7', SQUARE); // 7 nowhere in the commands
    expect(spans.some((s) => s.kind === 'number' && s.text === '7')).toBe(true);
  });

  it('an accounted number passes (value match, not string match)', () => {
    const cmds: AnyCommand[] = [...SQUARE, { type: 'set-distance', a: 'A', b: 'B', value: 7 } as AnyCommand];
    const spans = accountUtterance('ריבוע ABCD שצלעו 7', cmds);
    expect(spans.filter((s) => s.kind === 'number')).toEqual([]);
  });

  it('a label accounted through a composite id (seg-AB / circle-O) passes', () => {
    const cmds: AnyCommand[] = [{ type: 'segment', a: 'A', b: 'B' } as AnyCommand];
    const spans = accountUtterance('קטע AB', cmds);
    expect(spans.filter((s) => s.kind === 'label')).toEqual([]);
  });

  it('a relation symbol with NO constraint-ish command is flagged (the ADR-264 class, generalized)', () => {
    const spans = accountUtterance('AB = CD', []);
    expect(spans.some((s) => s.kind === 'relation')).toBe(true);
  });

  it('unknown words land in their OWN bucket — reported, never silently filler', () => {
    const shadow = spanShadow('ריבוע ABCD בצורה מוזרה לגמרי', SQUARE);
    expect(shadow).not.toBeNull();
    expect(shadow!.hard).toEqual([]); // labels all accounted — the unknown words are the accountant's debt
    expect(shadow!.words.length).toBeGreaterThan(0);
  });
});
