/**
 * #891 — «ריבוע ABCD שהצלע שלו 6»: the glued «ש» + DEFINITE noun clause carrying a given.
 *
 * The capability shipped with ADR-480; only this one spelling was missing. Measured at HEAD before the
 * change, three siblings built and the textbook one did not:
 *
 * ```
 * ריבוע ABCD שצלעו 6         → square, segment, set-distance
 * ריבוע ABCD שאורך צלעו 6    → square, segment, set-distance
 * ריבוע ABCD שכל צלע שלו 6   → square, segment, set-distance
 * ריבוע ABCD שהצלע שלו 6     → not-handled          ← the whole issue
 * ```
 *
 * A lexical gap in one bounded alternation (`SIDE_CLAUSE`), not a missing mechanism — «שהצלע שלו» is
 * «שכל צלע שלו» with a definite determiner instead of a distributive one.
 *
 * The risk in an alternation edit is SHADOWING a neighbour, so the locks below assert the siblings still
 * parse identically and the `SIDE_SHAPES` boundary still refuses.
 */
import { describe, expect, it } from 'vitest';
import { parse } from '../index';

/** The command types an utterance produces, or its refusal reason — one shape for both outcomes. */
const types = (u: string): string[] => {
  const r = parse(u, {});
  return r.ok ? r.commands.map((c) => c.type) : [r.reason];
};
const built = (u: string) => {
  const r = parse(u, {});
  if (!r.ok) throw new Error(`expected ${u} to parse, got ${r.reason}`);
  return r.commands;
};

describe('#891 — the definite side clause', () => {
  it('«ריבוע ABCD שהצלע שלו 6» builds the square AND the given', () => {
    expect(types('ריבוע ABCD שהצלע שלו 6')).toEqual(['square', 'segment', 'set-distance']);
  });

  it('the feminine determiner too («שהצלע שלה»)', () => {
    expect(types('מעוין ABCD שהצלע שלה 6')).toEqual(expect.arrayContaining(['set-distance']));
  });

  it('the value really is the stated one', () => {
    const d = built('ריבוע ABCD שהצלע שלו 6').find((c) => c.type === 'set-distance') as { value: number };
    expect(d.value).toBe(6);
  });

  it('the three siblings are UNCHANGED — the alternation edit shadows nothing', () => {
    for (const u of ['ריבוע ABCD שצלעו 6', 'ריבוע ABCD שאורך צלעו 6', 'ריבוע ABCD שכל צלע שלו 6']) {
      expect(types(u), u).toEqual(['square', 'segment', 'set-distance']);
    }
  });
});

describe('#891 — the SIDE_SHAPES boundary is a lock, not an accident', () => {
  it('«מלבן ABCD שהצלע שלו 6» STAYS refused — "its side" on a rectangle is an unstated pick', () => {
    // ADR-052: a rectangle's sides are not equal by definition, so "its side" would silently choose
    // WHICH side. The clause is deliberately scoped to shapes whose sides are equal by definition, and
    // widening the spelling must not widen the shape set.
    expect(types('מלבן ABCD שהצלע שלו 6')).not.toContain('set-distance');
  });

  it('…and the same is true of the sibling spellings, so the boundary is per-SHAPE not per-spelling', () => {
    for (const u of ['מלבן ABCD שצלעו 6', 'מלבן ABCD שכל צלע שלו 6']) {
      expect(types(u), u).not.toContain('set-distance');
    }
  });
});

describe('#891 — the radius clause accepts the copula its sibling already accepted', () => {
  it('«מעגל O שרדיוסו הוא 5» reads like «מעגל O שרדיוסו 5»', () => {
    expect(built('מעגל O שרדיוסו הוא 5'), 'the same figure, both spellings').toEqual(built('מעגל O שרדיוסו 5'));
  });

  it('a radius with no copula and a SYMBOLIC radius are both untouched', () => {
    expect(parse('מעגל O שרדיוסו 5', {}).ok).toBe(true);
    expect(parse('מעגל O שרדיוסו R', {}).ok).toBe(true);
  });
});
