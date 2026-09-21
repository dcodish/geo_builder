/**
 * THE 2-D INPUT PREVIEW, as a callable decision (#1315).
 *
 * Extracted from the `preview={…}` arrow inside `App.tsx`'s JSX, for the reason `src3d/render/FactRow3.tsx`
 * gives about the step row: a ternary inside a prop is invisible to every test. The #1152 parity guard
 * could only reach it by reading `App.tsx` as TEXT and grepping for `hasMath(s)` — which asserted where
 * the decision LIVED rather than what it DID, and broke the moment 3-D legitimately extracted its own
 * (see ADR-W-071). Being a function makes the behaviour assertable, which is what the lock now does.
 *
 * ## 2-D typesets the RAW string, and that is deliberate
 *
 * Every other builder passes `isolateLtrRuns(…)` output to `MathText`: they are RTL-Hebrew products where
 * typesetting unisolated text can reorder the equation, which is the whole reason the strip exists. 2-D is
 * the tree the mechanism came FROM and it hands `MathText` the raw string. #1152's own lock excluded it by
 * name for this, and the exclusion is preserved here exactly rather than quietly "fixed" while moving code
 * — a behaviour change smuggled into an extraction is the worst kind.
 *
 * Whether 2-D SHOULD isolate first is a real question and a separate one; it is not settled by this file.
 */
import type { ReactNode } from 'react';
import { MathText, hasMath } from '../../shell/math';
import { inputPreview } from '@/i18n/bidi';

/**
 * What the strip under the 2-D input shows for `text`, or `null` for nothing.
 *
 * `null` is the no-op case `inputPreview` already owned: isolation changed nothing, so the strip would
 * repeat the box character for character.
 */
export function inputPreviewNode(text: string): ReactNode {
  // The trigger is `hasMath`, not the isolation (#1152): a pure-LTR equation needs the strip too, and
  // `inputPreview` alone would return null for it.
  if (hasMath(text)) return <MathText text={text} />;
  return inputPreview(text);
}
