/**
 * Span accounting unit locks (S3.1 of docs/24; the ADR-250 mechanism, ENFORCING since ADR-453).
 *
 * These tests lock its CLASSIFICATION behavior: a dropped label/number is flagged, a complete parse
 * of a catalog-style utterance is clean in the hard buckets, and the unknown-word bucket (the
 * accountant's own coverage debt) is reported separately, never silently absorbed. Since the
 * operator's flip (#659 step 3) the hard buckets also REFUSE — `unaccountedSpans` is the enforcing
 * verdict, locked at the bottom of this file. The corpus-wide false-refusal net lives in
 * `span-shadow-report` (the catalog sweep asserts; SPAN_SHADOW=1 also writes the operator report).
 */
import { describe, expect, it } from 'vitest';
import { accountUtterance, spanShadow, unaccountedSpans } from '../spanAccounting';
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

/**
 * ENFORCEMENT (#659 step 3, ADR-453 — the operator's flip, 2026-08-19).
 *
 * `unaccountedSpans` is what the submit pipeline now refuses on, and it REPLACED three gates at that
 * seam: `droppedNewLabels` (ADR-089), `droppedGivenNumbers` (ADR-250) and `droppedGivenRelations`
 * (ADR-264). Their canonical cases are retargeted here — the point of the replacement is that ONE
 * question answers all three categories, so each category keeps a lock on the new mechanism.
 */
describe('ADR-453 — the enforcing verdict', () => {
  it('reports the hard buckets and NEVER an unknown word (words would false-refuse)', () => {
    // «פלרגון» is unknown vocabulary, not dropped content: the parse accounted every label. Enforcing
    // on it would refuse a sentence whose meaning did land — the reason the word bucket stays a report.
    expect(unaccountedSpans('ריבוע ABCD פלרגון', SQUARE)).toEqual([]);
    expect(accountUtterance('ריבוע ABCD פלרגון', SQUARE).map((s) => s.kind)).toContain('unknown-word');
  });

  it('a fully-accounted parse is clean — nothing refuses', () => {
    expect(unaccountedSpans('ריבוע ABCD', SQUARE)).toEqual([]);
  });

  // ---- retargeted from droppedNewLabels (ADR-089) --------------------------------------------
  it('a NEW label the commands never use is a hard span', () => {
    const r = unaccountedSpans('triangle ABC and the point Q', [{ type: 'triangle', ids: ['A', 'B', 'C'] } as AnyCommand]);
    expect(r.map((s) => s.text)).toEqual(['Q']);
    expect(r[0].kind).toBe('label');
  });

  it('an EXISTING label is context, not a drop (the gate\'s exemption, carried over)', () => {
    expect(
      unaccountedSpans('הצלע AB משיקה למעגל בנקודה B', [{ type: 'set-perpendicular', a: 'O', b: 'B', c: 'A', d: 'B' } as AnyCommand], {
        existingPoints: ['A', 'B', 'O'],
      }),
    ).toEqual([]);
  });

  it('a bound radius symbol / angle alias is a measure name, not a point (#54)', () => {
    expect(unaccountedSpans('r = 4', [{ type: 'set-radius', circle: 'circle-P', value: 4 } as AnyCommand], { radiusSymbols: ['r'] })).toEqual([]);
  });

  // ---- retargeted from droppedGivenNumbers (ADR-250) ----------------------------------------
  it('a stated magnitude the commands do not account for is a hard span', () => {
    const r = unaccountedSpans('AB = 6', [{ type: 'segment', a: 'A', b: 'B' } as AnyCommand]);
    expect(r.map((s) => s.text)).toEqual(['6']);
    expect(r[0].kind).toBe('number');
  });

  it('the typo case the gate was built for: a ratio consumed by a bare shape', () => {
    expect(
      unaccountedSpans('שטח AEB גדול פי 2.25 משוטח משולש CED', [{ type: 'triangle', ids: ['A', 'E', 'B'] } as AnyCommand]).map((s) => s.text),
    ).toContain('2.25');
  });

  it('the LOWERED forms stay clean — halved, percent, ratio pair (no false refusal)', () => {
    expect(unaccountedSpans('נקודה E על AC ב-40%', [{ type: 'point-on-segment', id: 'E', a: 'A', b: 'C', t: 0.4 } as AnyCommand])).toEqual([]);
    expect(unaccountedSpans('מעגל שהיקפו 6π', [{ type: 'circle', id: 'circle-O', center: 'O', radius: 3 } as AnyCommand])).toEqual([]);
  });

  // ---- retargeted from droppedGivenRelations (ADR-264) --------------------------------------
  it('a stated relation with NO constraint at all in the lowering is a hard span', () => {
    // The relation bucket is decided by one global `hasConstraint` flag, so it only fires when the
    // lowering carries no constraint-ish command whatsoever. Its blind spot (a relation between points
    // that all already exist, which `droppedGivenRelations` still owns) is locked in
    // `span-gate-differential.test.ts` — that is why ADR-264 did not retire with the flip.
    const r = unaccountedSpans('AB = CD', []);
    expect(r.some((s) => s.kind === 'relation')).toBe(true);
  });

  it('a relation the lowering DOES carry is clean', () => {
    expect(unaccountedSpans('AB ∥ CD', [{ type: 'set-parallel', a: 'A', b: 'B', c: 'C', d: 'D' } as AnyCommand])).toEqual([]);
  });
});
