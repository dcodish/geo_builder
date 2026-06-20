/**
 * Bare-segment shorthand — a student typing just "AB" (or "line AB" / "ישר AB") means *draw the
 * segment* through those two points. The single biggest source of needless LLM escalation in the
 * debug log (30 bare two-letter + 12 "line XY" of 111 escalations). Must NOT shadow any keyword form.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '@/parser';

const types = (u: string): string[] => {
  const r = parse(u);
  return r.ok ? r.commands.map((c) => c.type) : ['NOT-HANDLED'];
};
const seg = (u: string, a: string, b: string) => {
  const r = parse(u);
  expect(r.ok, `should parse: ${u}`).toBe(true);
  if (r.ok) expect(r.commands).toContainEqual({ type: 'segment', a, b });
};

describe('bare-segment shorthand', () => {
  it('a bare two-letter token → draw that segment', () => {
    seg('AB', 'A', 'B');
    seg('ED', 'E', 'D');
    seg('O1O2', 'O1', 'O2'); // subscripted labels
  });
  it('"line AB" / "ישר AB" / "הישר AB" → the same segment (the app draws segments, not infinite lines)', () => {
    seg('line AB', 'A', 'B');
    seg('ישר AB', 'A', 'B');
    seg('הישר CD', 'C', 'D');
  });

  // The catch-all must never steal a structured form.
  it('does NOT shadow keyword/structured forms', () => {
    expect(types('AB = 6')).toContain('set-distance'); // distance (auto-draws its own segment)
    expect(types('AB ⊥ CD')).toContain('set-perpendicular');
    expect(types('AB ∥ CD')).toContain('set-parallel');
    expect(types('line ABE')).toEqual(['set-line']); // ordered 3-point line, not a bare segment
    expect(types('square ABCD')).toEqual(['square']);
  });
  it('rejects what is not a clean two-label token', () => {
    expect(types('A')).toEqual(['NOT-HANDLED']); // a single label is not a segment
    expect(types('AA')).toEqual(['NOT-HANDLED']); // degenerate
    expect(types('ABC')).toEqual(['NOT-HANDLED']); // ambiguous (triangle? path?) — left for the LLM
  });

  it('⟂ (U+27C2) is accepted for perpendicular, like ⊥ (U+22A5)', () => {
    expect(types('AB ⟂ CD')).toContain('set-perpendicular');
  });
});
