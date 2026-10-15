/**
 * #1996 ([ADR-655](../../docs/06-decisions.md#adr-655)) — the forced-narrowing note as the student reads it, in
 * the ⓘ strip beside the degeneracy notice (ADR-513's band).
 *
 * One sentence per note, assembled by the shared `narrowingSentence` (`shell/narrowing.ts`) from this product's
 * `figure.narrowed.*` keys — the same family, word for word, as 3-D and analytic (the cross-builder rows in
 * `shell/__tests__/fixtures/narrowing-note-rows.ts` lock it). Pure, and imported by its lock (the seam registry:
 * a decision a test reproduces instead of calling is the #1102 root).
 */
import { isMergeNote, mergeSentence, narrowingSentence, type NarrowTranslate, type RingNote } from '../../shell/narrowing';

/** #1993 (ADR-656): a ring two sibling nouns made the kind both name says «ABCD הוא כעת ריבוע, שהוא גם מלבן וגם מעוין.». */
export const narrowingText = (notes: readonly RingNote[], t: NarrowTranslate): string[] =>
  notes.map((n) => (isMergeNote(n) ? mergeSentence(n, t, 'figure.narrowed') : narrowingSentence(n, t, 'figure.narrowed')));
