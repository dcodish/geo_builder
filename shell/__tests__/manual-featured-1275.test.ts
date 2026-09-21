/**
 * #1275 ([ADR-W-074](../../docs/06w-decisions-workspace.md#adr-w-074)) — THE GUIDE'S SAMPLE IS CHOSEN,
 * AND EVERY ROW IS REACHABLE.
 *
 * Operator, 2026-09-20, on the overnight sheet's T25 (*"open the guide and find a «תיכון» row and a
 * «גובה» row"*): *"what do i need to test there? if i clear all there will be nothing to test"*.
 * Measured: **he would not have found them.** The guide shows six entries per section and those rows
 * were entries 8 and 9 of «נקודות נגזרות» — added by #1165 for a student who *"looking for «תיכון»
 * found nothing"*, and after that fix still finding nothing.
 *
 * Two defects, and the cap itself is neither: a student meeting 63 circle rows learns nothing, which
 * is the ruling the guide shipped with and which stands.
 *
 *  1. WHICH six was decided by FILE ORDER — nothing chose them.
 *  2. The note said the tool knows more PHRASINGS, when what is hidden are separate CAPABILITIES.
 *
 * The locks below call `manualShown` — the selection itself — rather than re-slicing the array, so a
 * change that breaks the rule cannot leave a private copy of it green
 * ([ADR-W-053](../../docs/06w-decisions-workspace.md)).
 */
import { describe, expect, it } from 'vitest';
import { manualShown, type ManualEntry } from '../frame/ManualScreen';

const e = (example: string, featured?: boolean): ManualEntry => ({ example, ...(featured ? { featured } : {}) });

describe('#1275 — the sample is CHOSEN, not sliced', () => {
  it('a featured entry is taken into the cap ahead of any unfeatured one', () => {
    const entries = [e('a'), e('b'), e('c'), e('d'), e('e'), e('f'), e('g'), e('LATE', true)];
    expect(manualShown(entries, 6).map((x) => x.example)).toEqual(['LATE', 'a', 'b', 'c', 'd', 'e']);
  });

  it('order is otherwise the catalog’s own — the file order still documents itself', () => {
    const entries = [e('a'), e('b'), e('c'), e('d'), e('e'), e('f'), e('g')];
    expect(manualShown(entries, 6).map((x) => x.example)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });

  it('featured entries keep their relative order too', () => {
    const entries = [e('a'), e('Y', true), e('b'), e('X', true), e('c'), e('d'), e('e'), e('f')];
    expect(manualShown(entries, 6).map((x) => x.example).slice(0, 2)).toEqual(['Y', 'X']);
  });

  it('a section at or under the cap is untouched, and no cap shows everything', () => {
    const entries = [e('a'), e('b'), e('c')];
    expect(manualShown(entries, 6)).toBe(entries);
    expect(manualShown(entries, undefined)).toBe(entries);
  });

  it('a featured entry cannot smuggle the section past its cap', () => {
    const entries = Array.from({ length: 20 }, (_, i) => e(`row${i}`, i % 2 === 0));
    expect(manualShown(entries, 6)).toHaveLength(6);
  });
});
