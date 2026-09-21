/**
 * THE COMPLEX BUILDER'S INPUT PREVIEW, as a callable decision (#1315).
 *
 * Lives in `ui/` beside `askText.tsx`, NOT in `render/`: the complex tree's layer guard allows
 * `render -> [value, scene]` only, and this composes `i18n` with `shell/math`. The first draft put it in
 * `render/` and `import-direction.test.ts` refused it — correctly, and that is the guard doing its job.
 *
 * Extracted from the `preview={…}` arrow inside `App.tsx`'s JSX. A ternary inside a prop is invisible to
 * every test, so #1152's parity guard could only reach it by reading the App as TEXT — asserting where the
 * decision LIVED rather than what it DID, which is the defect ADR-W-071 fixes. Being a function makes the
 * behaviour assertable.
 *
 * ISOLATE FIRST, THEN TYPESET. Handing `MathText` the raw string typesets it perfectly and lays it out
 * backwards: the renderer emits several `<math>` islands with text between them, and in an RTL paragraph
 * that whole sequence runs right-to-left. The isolation is what carries the reading order, so it must
 * happen before the typesetting, never after.
 */
import type { ReactNode } from 'react';
import { MathText, hasMath } from '../../shell/math';
import { complexBidi } from '../i18n';

/** What the strip under the complex input shows for `text`, or `null` for nothing. */
export function inputPreviewNodeCx(text: string): ReactNode {
  // The trigger is `hasMath`, not the isolation (#1152): `inputPreview` returns null when isolation
  // changes nothing, so a pure-LTR equation would otherwise get no strip at all.
  if (hasMath(text)) return <MathText text={complexBidi.isolateLtrRuns(text, true)} />;
  return complexBidi.inputPreview(text);
}
