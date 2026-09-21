/**
 * THE 2-D INPUT PREVIEW, as a callable decision (#1315).
 *
 * Extracted from the `preview={…}` arrow inside `App.tsx`'s JSX, for the reason `src3d/render/FactRow3.tsx`
 * gives about the step row: a ternary inside a prop is invisible to every test. The #1152 parity guard
 * could only reach it by reading `App.tsx` as TEXT and grepping for `hasMath(s)` — which asserted where
 * the decision LIVED rather than what it DID, and broke the moment 3-D legitimately extracted its own
 * (see ADR-W-071). Being a function makes the behaviour assertable, which is what the lock now does.
 *
 * ## ISOLATE FIRST, THEN TYPESET (#1316) — 2-D was the last builder not doing it
 *
 * It handed `MathText` the RAW string, and #1152's lock excluded it by name with the bare statement *"it is
 * the tree the mechanism came from and it typesets the raw string"* — which recorded the fact and never
 * argued it was right. It was not right. **Measured in a real browser**, on «מעגל (x-3)^2+(y-5)^2=25»
 * typed into the 2-D input, by the islands' x-positions:
 *
 * ```
 *              (x-3)²    (y-5)²
 *   2-D        x=1153    x=1107     ← right-to-left: the equation reads BACKWARDS
 *   analytic   x=1098    x=1144     ← left-to-right, correct (the control)
 * ```
 *
 * `mathHtml` emits several `<math>` islands with text between them, and in an RTL paragraph that whole
 * sequence runs right-to-left unless the run is isolated. That is the #1215 defect, one tree over, and it
 * reached a student: the strip under the box showed a formula they did not write.
 *
 * jsdom does not lay out bidi, so no unit test could have found this — only looking could, which is why the
 * issue asked for a look rather than a fix. What a unit test CAN hold is that the isolate is applied on this
 * path, which is the cause; `src/render/__tests__/issue-1152-preview-parity.test.tsx` now asserts it with
 * the rest of the builders.
 */
import type { ReactNode } from 'react';
import { MathText, hasMath } from '../../shell/math';
import { inputPreview, isolateLtrRuns } from '@/i18n/bidi';

/**
 * What the strip under the 2-D input shows for `text`, or `null` for nothing.
 *
 * `null` is the no-op case `inputPreview` already owned: isolation changed nothing, so the strip would
 * repeat the box character for character.
 */
export function inputPreviewNode(text: string): ReactNode {
  // The trigger is `hasMath`, not the isolation (#1152): a pure-LTR equation needs the strip too, and
  // `inputPreview` alone would return null for it.
  //
  // `liveTail` is the third argument here — 2-D's signature is (s, rtlParagraph, liveTail), not the shared
  // kit's (s, liveTail). A line being TYPED ends in an incomplete run, so its last run extends to the end
  // of the string; without it the half-typed `(` is trimmed out, resolves as a neutral and jumps the row.
  if (hasMath(text)) return <MathText text={isolateLtrRuns(text, false, true)} />;
  return inputPreview(text);
}
