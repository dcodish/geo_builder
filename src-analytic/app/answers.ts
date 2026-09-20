/**
 * THE ASK LANE'S ROW LIST — ask, show, hide, retire (#1118).
 *
 * Operator, playing #1048: *"I want to be able to also remove the distance … it's one thing to see it,
 * but then I want to remove it and continue on."* Then, on seeing the first build:
 *
 * > *"once the distance between a point and line (or anything else) is asked for and appears in the
 * > data panel, it should stay there. just remove the dotted line if asked on the canvas."*
 *
 * ## The row and the drawing have SEPARATE lifetimes, and that is the whole design
 *
 * The panel is a **record**: what the student asked, and what the figure answered. The canvas is a
 * **view** of one of those answers. Clearing the canvas to see the figure underneath is not withdrawing
 * the question, so hiding a drawing must not discard the row — which is what the first build did, and
 * what this ruling corrects.
 *
 * So there are three gestures, not two:
 *
 * | gesture | row | drawing |
 * | --- | --- | --- |
 * | ask it (menu or typing) | added, or refreshed in place | drawn |
 * | click the same menu entry again | **stays** | hidden |
 * | the ✕ on the row | removed | goes with it |
 *
 * ## This module exists because of #1102
 *
 * That issue's submit decision lived inline in `App.tsx`, its test REPRODUCED the decision instead of
 * calling it, and a change fifteen minutes later shadowed the real one while the lock stayed green. A
 * decision reachable from no test is one that will silently stop happening. These functions are what
 * the component calls and what the locks call.
 *
 * The QUESTION is the key throughout: it is the sentence the student asked, unique to the measurement,
 * and exactly what the menu offers — so the menu and the panel cannot disagree about what is showing.
 */
import type { Answer } from './ask';
import type { AskedQuestion } from '../store/useAnalyticStore';

/**
 * ## The record is the QUESTION, not the reading (#1110)
 *
 * These functions used to fold a list of `Answer` — values already computed against one
 * `(facts, seed)`. Nothing invalidated them, so a length and an area survived deleting every given and
 * «נקה הכל». They now fold the stored `AskedQuestion` list instead, and the answer is DERIVED, which
 * makes a stale reading unrepresentable rather than merely unlikely.
 *
 * A consequence worth naming: none of these evaluates anything any more. ADR-AG-067 had to assert that
 * hiding a drawing costs no solve (via a `make` thunk); with the record separated from the reading it is
 * structural, and the thunk is gone.
 */

/** How many rows the lane holds. Older questions fall off the end rather than growing without bound. */
export const ASK_LIMIT = 8;

/** Is this measurement's drawing on the canvas right now? */
export const isDrawn = (qs: readonly AskedQuestion[], sentence: string): boolean =>
  qs.some((q) => q.sentence === sentence && q.shown);

/** Is the lane holding this question at all, drawn or not? */
export const isAsked = (qs: readonly AskedQuestion[], sentence: string): boolean =>
  qs.some((q) => q.sentence === sentence);

/**
 * A menu entry's gesture: ask it if it has not been asked, otherwise flip whether it is DRAWN.
 *
 * The row is never removed here — that is the operator's ruling (ADR-AG-067).
 */
export function toggleDrawn(qs: readonly AskedQuestion[], sentence: string): AskedQuestion[] {
  if (!isAsked(qs, sentence)) return [{ sentence, shown: true }, ...qs].slice(0, ASK_LIMIT);
  return qs.map((q) => (q.sentence === sentence ? { ...q, shown: !q.shown } : q));
}

/**
 * The typed lane's gesture: ask it, once, and show it.
 *
 * Re-asking replaces the existing entry rather than adding a second identical one, and it does NOT
 * toggle. Clicking an entry you can see is lit means *take it back*; typing a sentence means *tell me
 * this*, and answering that by hiding the answer would be the opposite of what was asked.
 */
export function askOnceAnswer(qs: readonly AskedQuestion[], sentence: string): AskedQuestion[] {
  return [{ sentence, shown: true }, ...qs.filter((q) => q.sentence !== sentence)].slice(0, ASK_LIMIT);
}

/** Retire the entry at `index` — the ✕ on the row. Its drawing goes with it. Out-of-range is a no-op. */
export function removeAnswerAt(qs: readonly AskedQuestion[], index: number): AskedQuestion[] {
  return index < 0 || index >= qs.length ? [...qs] : qs.filter((_, i) => i !== index);
}

/**
 * The marks the canvas should draw: every DERIVED answer that has one and is not hidden.
 *
 * This one still takes `Answer`, because a mark is part of the reading rather than the record — it is
 * in world coordinates and moves with the figure, which is precisely why it must not be stored.
 */
export const drawnMarks = (rows: readonly Answer[]): Array<{ from: { x: number; y: number }; foot: { x: number; y: number }; label?: string }> =>
  rows
    .filter((a) => a.mark && a.shown !== false)
    .map((a) => ({ from: a.mark!.from, foot: a.mark!.foot, label: a.value ?? undefined }));

/**
 * The LOCI the canvas should draw — every answered locus that is not hidden (#1137).
 *
 * The sibling of {@link drawnMarks}, and separate from it for the reason that one is separate from
 * the record: a trace is part of the READING. It is in world coordinates and moves with the figure,
 * which is exactly why it must not be stored.
 *
 * It rides the SAME `shown` flag, so ADR-AG-067's three gestures — ask, click again to hide, ✕ to
 * retire — govern a locus without a second lifetime being invented for it.
 */
export const drawnLoci = (
  rows: readonly Answer[],
): Array<{ points: Array<{ x: number; y: number }>; closed: boolean; label?: string }> =>
  rows
    .filter((a) => a.locus && a.shown !== false)
    .map((a) => ({ points: a.locus!.points, closed: a.locus!.closed, label: a.value ?? undefined }));
