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

/**
 * #659 — the unknown-word debt was never 76 missing words: it was three defects in the MATCHER,
 * each of which would have produced false refusals the moment enforcement was flipped on — and which
 * shadow mode structurally cannot reveal, because nothing refuses in shadow.
 *
 * These lock the mechanisms, not the vocabulary. A word list can be regrown from the report; a matcher
 * that eats its own stems cannot be noticed without asking it directly.
 */
describe('#659 — the matcher, not the word list', () => {
  const accounted = (utterance: string, commands: AnyCommand[] = []) =>
    accountUtterance(utterance, commands).filter((u) => u.kind === 'unknown-word').map((u) => u.text);

  it('a Hebrew prefix never eats the stem it precedes (greedy stripping did)', () => {
    // «במעגל» stripped to «עגל» and «במשולש» to «ולש» — four word families unknown while their stems
    // sat in the list. Every peeling is offered now, so the stem list decides where the prefix ends.
    for (const w of ['במעגל', 'למעגל', 'המעגל', 'ומעגל', 'למעגלים', 'במשולש', 'המשולש', 'למשולש', 'במרובע', 'המשיק', 'והמשיק'])
      expect(accounted(`נתון ${w} O`), w).toEqual([]);
  });

  it('a stem ending in a FINAL letter matches its own plural (the ך/ם/ן trap)', () => {
    // adding a suffix flips the final form to medial, so «תיכון» could never prefix-match «תיכונים»
    for (const w of ['התיכונים', 'האלכסונים', 'האנכים', 'נחתכים'])
      expect(accounted(`M מפגש ${w} ABC`), w).toEqual([]);
  });

  it('an English stem covers its inflections (the list held inflected FORMS)', () => {
    // 'cuts' never matched 'cutting', 'circumscribed' never matched 'circumscribes'
    for (const w of ['cuts', 'cutting', 'meet', 'meets', 'touch', 'touches', 'bisects', 'bisector',
                     'circumscribes', 'circumscribed', 'extension', 'extended', 'divides'])
      expect(accounted(`the line ${w} the circle`), w).toEqual([]);
  });

  it('an unknown word is STILL reported — the fixes widened the matcher, never the silence', () => {
    expect(accounted('משולש ABC פלרגון')).toContain('פלרגון');
    expect(accounted('triangle ABC flarnge')).toContain('flarnge');
  });
});
