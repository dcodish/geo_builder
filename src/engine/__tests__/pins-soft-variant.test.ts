/**
 * `pinsSoftVariant` — the pure matcher behind the fix for session `z4v1zza3`.
 *
 * A kite / isosceles `shape-variant` draws with a SOFT default equal-pair whose choice is genuinely
 * unstated (ADR-052/138). When the student STATES that pair (`AB=AC`), the statement is new information —
 * it PINS the soft default (flips the relation from "not forced" to reported) — even though the geometry,
 * which already used that pair as its default drawing, does not move. This matcher answers "does this
 * equality pin a not-yet-stated variant pair?" so the commit gate keeps it instead of dropping it as a
 * redundant "already drawn" no-op. Class coverage: both variant shapes, mirrored pair order, the
 * already-stated exclusion, a non-matching pair, and the pairless midsegment.
 */
import { describe, it, expect } from 'vitest';
import { pinsSoftVariant, type VariantShape } from '@/engine';

type Eq = { a: string; b: string; c: string; d: string };
const eq = (a: string, b: string, c: string, d: string): Eq => ({ a, b, c, d });
const iso = { shape: 'isosceles' as VariantShape, ids: ['A', 'B', 'C'] };
const kite = { shape: 'kite' as VariantShape, ids: ['A', 'B', 'C', 'D'] };

describe('pinsSoftVariant', () => {
  it('an isosceles apex pair (|AB|=|AC|) with nothing stated → pins', () => {
    expect(pinsSoftVariant(eq('A', 'B', 'A', 'C'), [iso], [])).toBe(true);
  });

  it('any of the three apex pairs pins (AB=BC, AC=BC)', () => {
    expect(pinsSoftVariant(eq('A', 'B', 'B', 'C'), [iso], [])).toBe(true);
    expect(pinsSoftVariant(eq('A', 'C', 'B', 'C'), [iso], [])).toBe(true);
  });

  it('mirrored / reordered pair still matches (BA=CA, and swapped segments)', () => {
    expect(pinsSoftVariant(eq('B', 'A', 'C', 'A'), [iso], [])).toBe(true);
    expect(pinsSoftVariant(eq('A', 'C', 'A', 'B'), [iso], [])).toBe(true);
  });

  it('a pair ALREADY stated by an explicit equality is NOT re-pinned (avoids infinite re-commit)', () => {
    expect(pinsSoftVariant(eq('A', 'B', 'A', 'C'), [iso], [eq('A', 'B', 'A', 'C')])).toBe(false);
    // …but a DIFFERENT unstated pair still pins even when one pair is already stated
    expect(pinsSoftVariant(eq('A', 'B', 'B', 'C'), [iso], [eq('A', 'B', 'A', 'C')])).toBe(true);
  });

  it('an equality that names no variant pair (|AB|=|CD| on a triangle) → does not pin', () => {
    expect(pinsSoftVariant(eq('A', 'B', 'C', 'D'), [iso], [])).toBe(false);
  });

  it('a kite axis pair pins (|AB|=|AD|)', () => {
    expect(pinsSoftVariant(eq('A', 'B', 'A', 'D'), [kite], [])).toBe(true);
  });

  it('the pairless midsegment variant never pins', () => {
    const mid = { shape: 'midsegment' as VariantShape, ids: ['P', 'Q', 'R', 'E', 'G'] };
    expect(pinsSoftVariant(eq('P', 'E', 'E', 'Q'), [mid], [])).toBe(false);
  });

  it('no shape-variants present → never pins', () => {
    expect(pinsSoftVariant(eq('A', 'B', 'A', 'C'), [], [])).toBe(false);
  });
});
