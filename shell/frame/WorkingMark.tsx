/**
 * #2874 (ADR-W-210 phase 1) — THE WORKING INDICATOR'S MOTION, and the hook that reads the queue.
 *
 * A label that says «חושב…» on a page whose thread is busy looks exactly like a frozen page: nothing on it
 * can change until the work ends. So the indicator carries one part the page's own thread does not drive.
 * `WorkingMark` is a ring turned by a CSS animation of `transform` alone. The browser's compositor runs
 * such an animation by itself, on its own layer (`will-change`), so it keeps turning while the engine
 * solves on the page's thread, inside a handler or inside a React render. Under «reduce motion» it fades
 * (`opacity`, also composited) instead of turning.
 *
 * SHOWN ONLY AFTER {@link WORKING_SHOWN_AFTER_MS} (ADR-W-210 Am. 2, operator ruling 2026-11-13). An action that is
 * over sooner shows nothing at all, so an ordinary line no longer blinks «חושב…». The page's thread cannot do the
 * waiting: in 3-D and analytic it is the thread that is busy, and a timer on it would fire only when the work is
 * over. So the whole working look is laid out and painted at once, INVISIBLE, and revealed by CSS animations of
 * `opacity` alone, which the compositor runs by itself like the ring's turn:
 *  - `WorkingFace` is a button's label. The button has ONE size, at rest and while working, because a change of
 *    size is layout, which only the page's thread can do: the working label is centred over the face, and the
 *    face reserves its width less the `slack` the button's own padding can lend it (so «הוסף» keeps the width it
 *    always had). While working, the element's text IS the busy label (what a test and a screen reader read) and
 *    the idle label is drawn over it by a pseudo-element; at the threshold the two swap.
 *  - `workingDim` is the class that holds a working button at full strength until the threshold and then lets it
 *    grey to the opacity its own style already asks for.
 *  - `useShownWorking` is the same threshold on the page's own clock, for a SECOND, smaller sign whose arrival
 *    changes the layout (2-D's line under the box, its search progress). It may be late when the thread is busy;
 *    the button never is.
 *
 * `useWorking` is how a component reads the queue's derived state (`shell/work`): no builder keeps a
 * boolean of its own. `useLatest` is how a component hands the queue work that reads the render current
 * when the job RUNS, not the one current when it was asked for.
 */
import { useEffect, useInsertionEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type MutableRefObject } from 'react';
import { INTERACTIVE, type WorkQueue } from '../work';

/**
 * How long the tool works before it says so, in milliseconds (operator, 2026-11-13: the indicator appears "only
 * after about 0.3 s, so fast actions show nothing"). Measured the same day: an ordinary action takes 65–125 ms
 * from the press to the figure in every builder, well inside it.
 */
export const WORKING_SHOWN_AFTER_MS = 300;

/** The opacities a working button greys to: the submit button's, and a figure-row button's (`rowAccentOffStyle`). */
export type WorkingDim = 0.6 | 0.5;

// Each reveal is ONE keyframe animation as long as the threshold that holds its first value to the very end and
// then steps: an animation that is running is on the compositor from its first frame, and a held end value stays.
const CSS = `
@keyframes shell-working-turn { to { transform: rotate(360deg); } }
@keyframes shell-working-fade { 50% { opacity: 0.2; } }
@keyframes shell-working-in { 0%, 99.9% { opacity: 0; } 100% { opacity: 1; } }
@keyframes shell-working-out { 0%, 99.9% { opacity: 1; } 100% { opacity: 0; } }
@keyframes shell-working-dim-60 { 0%, 99.9% { opacity: 1; } 100% { opacity: 0.6; } }
@keyframes shell-working-dim-50 { 0%, 99.9% { opacity: 1; } 100% { opacity: 0.5; } }
.shell-working-face { position: relative; display: inline-grid; align-items: center; justify-items: center; }
.shell-working-face > *, .shell-working-face::before, .shell-working-face::after { grid-area: 1 / 1; white-space: nowrap; }
.shell-working-face::after {
  content: attr(data-busy);
  content: attr(data-busy) / "";
  visibility: hidden;
  padding-inline-end: calc(0.85em + 6px);
  margin-inline: calc(-1 * var(--shell-working-slack, 0px));
}
.shell-working-face[data-working]::before {
  content: attr(data-idle);
  content: attr(data-idle) / "";
  will-change: opacity;
  animation: shell-working-out ${WORKING_SHOWN_AFTER_MS}ms linear forwards;
}
.shell-working-busy {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  will-change: opacity;
  animation: shell-working-in ${WORKING_SHOWN_AFTER_MS}ms linear forwards;
}
.shell-working-dim-60 { will-change: opacity; animation: shell-working-dim-60 ${WORKING_SHOWN_AFTER_MS}ms linear forwards; }
.shell-working-dim-50 { will-change: opacity; animation: shell-working-dim-50 ${WORKING_SHOWN_AFTER_MS}ms linear forwards; }
.shell-working-mark {
  display: inline-block;
  box-sizing: border-box;
  width: 0.85em;
  height: 0.85em;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  vertical-align: -0.08em;
  will-change: transform;
  animation: shell-working-turn 0.9s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .shell-working-mark { will-change: opacity; animation: shell-working-fade 1.6s ease-in-out infinite; }
}
`;

const STYLE_ID = 'shell-working-mark-style';

/**
 * The indicator's rules go into the document head once, before anything that uses them is first painted — never
 * into the button: a `<style>` element inside a button becomes part of the button's text for every reader of
 * `textContent`.
 */
function useWorkingStyle(): void {
  useInsertionEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }, []);
}

/** The moving part of the working indicator. It takes the colour and size of the text it sits in. */
export function WorkingMark() {
  useWorkingStyle();
  return <span className="shell-working-mark" data-working-mark="" aria-hidden="true" />;
}

/**
 * A button's label, at rest (`idle`) and while its tool works (`busy`, with the moving mark). The working label is
 * in the document from the first paint and is SHOWN only after {@link WORKING_SHOWN_AFTER_MS}; the button keeps one
 * size throughout. Both labels are plain strings: the one not in the document is drawn from an attribute.
 *
 * `slack` is how many pixels a side the working label may reach into the button's own padding. The face reserves
 * the working label's width less that, so a short idle label keeps the button it has today.
 */
export function WorkingFace({ working, idle, busy, slack = 0 }: { working: boolean; idle: string; busy: string; slack?: number }) {
  useWorkingStyle();
  const style = slack ? ({ '--shell-working-slack': `${slack}px` } as CSSProperties) : undefined;
  return (
    <span className="shell-working-face" style={style} data-idle={idle} data-busy={busy} data-working={working ? '' : undefined}>
      {working ? (
        <span key="busy" className="shell-working-busy">
          {busy}
          <WorkingMark />
        </span>
      ) : (
        <span key="idle">{idle}</span>
      )}
    </span>
  );
}

/**
 * The class of a button that is off because its tool is working: it stays at full strength until
 * {@link WORKING_SHOWN_AFTER_MS} and then greys to `to`, the opacity its own style sets. `undefined` at rest.
 */
export function workingDim(working: boolean, to: WorkingDim): string | undefined {
  if (!working) return undefined;
  return to === 0.6 ? 'shell-working-dim-60' : 'shell-working-dim-50';
}

/**
 * `working`, once it has lasted {@link WORKING_SHOWN_AFTER_MS}: for a second sign whose arrival moves the layout,
 * which the compositor cannot delay. Counted on the page's own clock, so on a busy thread it can only be late.
 */
export function useShownWorking(working: boolean): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!working) {
      setShown(false);
      return;
    }
    const timer = setTimeout(() => setShown(true), WORKING_SHOWN_AFTER_MS);
    return () => clearTimeout(timer);
  }, [working]);
  return working && shown;
}

/** A lane's working state, derived from the queue and re-rendered when it changes. */
export function useWorking(queue: WorkQueue<unknown>, lane: string = INTERACTIVE): boolean {
  return useSyncExternalStore(
    queue.subscribe,
    () => queue.working(lane),
    () => false,
  );
}

/**
 * The value as the LATEST render defined it. A job runs after the paint, and after every job asked for
 * before it; a handler that closed over the render it was clicked in would then act on a figure an earlier
 * job has already changed. So a component keeps its job bodies in one object, passes it here every render,
 * and asks the queue for `() => latest.current.body(args)`: the earlier job's store update has been
 * rendered by the time this one starts, so the body it reaches is the current one.
 */
export function useLatest<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
