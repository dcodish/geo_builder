/**
 * THE ANALYTIC BUILDER'S INPUT PREVIEW, as a callable decision (#1315).
 *
 * Extracted from the `preview={…}` arrow inside `App.tsx`'s JSX. A ternary inside a prop is invisible to
 * every test, so #1152's parity guard could only reach it by reading the App as TEXT — asserting where the
 * decision LIVED rather than what it DID, which is the defect ADR-W-071 fixes. Being a function makes the
 * behaviour assertable.
 *
 * ISOLATE FIRST, THEN TYPESET — found by looking, and preserved here verbatim (#1215). Handing the raw
 * string to `MathText` typeset «מעגל (x-3)²+(y-5)²=25» perfectly and drew `=25` at the far LEFT: the
 * renderer emits several `<math>` islands with text between them, and in an RTL paragraph that sequence
 * runs right-to-left. That is the defect this preview exists to prevent, reintroduced by its own fix.
 *
 * The bidi previewer stays as the fallback and is not a lesser one: it carries the RTL reading order while
 * an equation is still half-typed. `hasMath` is false until an exponent or a fraction completes, so early
 * keystrokes take that path and no half-formed formula is ever half-typeset (ADR-W-060).
 */
import type { ReactNode } from 'react';
import { MathText, hasMath } from '../../shell/math';
import { analyticBidi } from '../i18n/bidi';

/** What the strip under the analytic input shows for `text`, or `null` for nothing. */
export function inputPreviewNodeAnalytic(text: string): ReactNode {
  if (hasMath(text)) return <MathText text={analyticBidi.isolateLtrRuns(text, true)} />;
  return analyticBidi.inputPreview(text);
}
