/**
 * «בודק…» AFTER 0.3 s (#2890, [ADR-AG-478](../../docs/06c-decisions-analytic.md#adr-ag-478); operator ruling 2026-11-14,
 * #2890 question 1: *"Figure first, both tools (Recommended)"*).
 *
 * The figure is drawn as soon as a line is accepted and its values follow. A value that has not arrived after
 * {@link WORKING_SHOWN_AFTER_MS} shows «בודק…» until it does; one that arrives sooner never shows it, so a fast line
 * does not blink. The word is in the document from the first render (a test and a screen reader read it) and is
 * revealed by an animation of `opacity` alone, as long as the threshold, which the compositor runs by itself: the
 * same mechanism as the working indicator (`shell/frame/WorkingMark.tsx`), so the two thresholds are one.
 *
 * A row whose value is pending keeps its name visible; only the pending word waits.
 */
import { useInsertionEffect } from 'react';
import { MathText } from '../../shell/math';
import { WORKING_SHOWN_AFTER_MS } from '../../shell/frame/WorkingMark';

const STYLE_ID = 'analytic-pending-style';
const CSS = `@keyframes analytic-pending-in { 0%, 99.9% { opacity: 0; } 100% { opacity: 1; } }
.analytic-pending { will-change: opacity; animation: analytic-pending-in ${WORKING_SHOWN_AFTER_MS}ms linear forwards; }`;

function usePendingStyle(): void {
  useInsertionEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }, []);
}

/** The class that holds a pending word invisible for the threshold and then shows it. */
export const PENDING_CLASS = 'analytic-pending';

/**
 * A row's text, with its pending word (`checking`, «בודק…») revealed only after the threshold. `render` typesets a
 * piece of text (the row's own typesetter); a text with no pending word is rendered as it was.
 */
export function PendingText({ text, checking, render = (s) => <MathText text={s} /> }: { text: string; checking: string; render?: (s: string) => JSX.Element }) {
  usePendingStyle();
  const at = checking ? text.indexOf(checking) : -1;
  if (at < 0) return render(text);
  const before = text.slice(0, at);
  const after = text.slice(at + checking.length);
  return (
    <span>
      {before && render(before)}
      <span className={PENDING_CLASS} data-pending="">
        {checking}
      </span>
      {after && render(after)}
    </span>
  );
}
