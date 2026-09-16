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

/** How many rows the lane holds. Older answers fall off the end rather than growing without bound. */
export const ASK_LIMIT = 8;

/** Is this measurement's drawing on the canvas right now? `shown` absent means yes. */
export const isDrawn = (rows: Answer[], sentence: string): boolean =>
  rows.some((a) => a.question === sentence && a.shown !== false);

/** Is the lane holding this question at all, drawn or not? */
export const isAsked = (rows: Answer[], sentence: string): boolean =>
  rows.some((a) => a.question === sentence);

/**
 * A menu entry's gesture: ask it if it has not been asked, otherwise flip whether it is DRAWN.
 *
 * The row is never removed here — that is the operator's ruling. `make` is a thunk so that hiding a
 * drawing costs no evaluation.
 */
export function toggleDrawn(rows: Answer[], sentence: string, make: () => Answer): Answer[] {
  if (!isAsked(rows, sentence)) return [make(), ...rows].slice(0, ASK_LIMIT);
  return rows.map((a) => (a.question === sentence ? { ...a, shown: a.shown === false } : a));
}

/**
 * The typed lane's gesture: answer it, once, and show it.
 *
 * Re-asking replaces the existing row rather than adding a second identical one — the figure may have
 * changed, so the answer is recomputed — and it does NOT toggle. Clicking an entry you can see is lit
 * means *take it back*; typing a sentence means *tell me this*, and answering that by hiding the answer
 * would be the opposite of what was asked.
 */
export function askOnceAnswer(rows: Answer[], sentence: string, make: () => Answer): Answer[] {
  return [make(), ...rows.filter((a) => a.question !== sentence)].slice(0, ASK_LIMIT);
}

/** Retire the row at `index` — the ✕ on the row. Its drawing goes with it. Out-of-range is a no-op. */
export function removeAnswerAt(rows: Answer[], index: number): Answer[] {
  return index < 0 || index >= rows.length ? rows : rows.filter((_, i) => i !== index);
}

/** The marks the canvas should draw: every answer that HAS one and is not hidden. */
export const drawnMarks = (rows: Answer[]): Array<{ from: { x: number; y: number }; foot: { x: number; y: number }; label?: string }> =>
  rows
    .filter((a) => a.mark && a.shown !== false)
    .map((a) => ({ from: a.mark!.from, foot: a.mark!.foot, label: a.value ?? undefined }));
