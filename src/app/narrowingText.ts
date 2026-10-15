/**
 * #1996 ([ADR-655](../../docs/06-decisions.md#adr-655)) — the forced-narrowing note as the student reads it, in
 * the ⓘ strip beside the degeneracy notice (ADR-513's band).
 *
 * One sentence per note, assembled by the shared `narrowingSentence` (`shell/narrowing.ts`) from this product's
 * `figure.narrowed.*` keys — the same family, word for word, as 3-D and analytic (the cross-builder rows in
 * `shell/__tests__/fixtures/narrowing-note-rows.ts` lock it). Pure, and imported by its lock (the seam registry:
 * a decision a test reproduces instead of calling is the #1102 root).
 */
import { narrowingSentence, type NarrowTranslate, type NarrowingNote } from '../../shell/narrowing';

export const narrowingText = (notes: readonly NarrowingNote[], t: NarrowTranslate): string[] =>
  notes.map((n) => narrowingSentence(n, t, 'figure.narrowed'));
