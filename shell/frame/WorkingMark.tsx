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
 * `useWorking` is how a component reads the queue's derived state (`shell/work`): no builder keeps a
 * boolean of its own. `useLatest` is how a component hands the queue work that reads the render current
 * when the job RUNS, not the one current when it was asked for.
 */
import { useInsertionEffect, useRef, useSyncExternalStore, type MutableRefObject } from 'react';
import { INTERACTIVE, type WorkQueue } from '../work';

const CSS = `
@keyframes shell-working-turn { to { transform: rotate(360deg); } }
@keyframes shell-working-fade { 50% { opacity: 0.2; } }
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
 * The moving part of the working indicator. It takes the colour and size of the text it sits in.
 *
 * Its keyframes go into the document head once, before the mark is first painted — never into the button:
 * a `<style>` element inside a button becomes part of the button's text for every reader of `textContent`.
 */
export function WorkingMark() {
  useInsertionEffect(() => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }, []);
  return <span className="shell-working-mark" data-working-mark="" aria-hidden="true" />;
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
