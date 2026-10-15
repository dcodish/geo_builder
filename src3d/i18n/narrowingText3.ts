/**
 * #1996 ([ADR-3D-343](../../docs/06b-decisions-3d.md#adr-3d-343)) — the forced-narrowing note as the student reads
 * it, in the build-notice list.
 *
 * One sentence per note, assembled by the shared `narrowingSentence` (`shell/narrowing.ts`) from this product's
 * `notice.narrowed.*` keys — the same family, word for word, as 2-D and analytic (the cross-builder rows in
 * `shell/__tests__/fixtures/narrowing-note-rows.ts` lock it). Pure, and imported by its lock (the seam registry:
 * a decision a test reproduces instead of calling is the #1102 root).
 */
import { narrowingSentence, type NarrowTranslate, type NarrowingNote } from '../../shell/narrowing';

export const narrowingText3 = (note: NarrowingNote, t: NarrowTranslate): string => narrowingSentence(note, t, 'notice.narrowed');
