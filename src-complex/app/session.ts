/**
 * SESSION BOOTSTRAP — which engine owns this session, and the session that was already open.
 *
 * Both of these used to run as module side effects of `store/useComplexStore.ts`, and neither belongs
 * there. Restoring a stored session is not state definition: every stored line is **re-submitted**, so
 * it passes through the grammar and the acceptance gate exactly as a typed line does, and that is the
 * `app/` layer's job (ADR-CX-023). A store that replays its own contents on import is a store that
 * decides what is acceptable, one import earlier than anyone can see.
 *
 * The order is load-bearing and is why the two live in one function rather than two files: `?engine=v2`
 * must be read BEFORE the stored lines are replayed. A v2 session rehydrated through the prototype's
 * yes/no would silently lose every v2-only line on reload, which is #658 returning by the back door.
 */

import { useComplexStore } from '../store/useComplexStore';
import { hydrateSession } from './submit';

const LS_KEY = 'complex-proto-session';

/**
 * Read the engine switch, restore any stored session, and start auto-persisting.
 *
 * Called once from `main.tsx`, before the first render — not from a component effect, because the
 * restored figure must be what the first paint shows rather than something that arrives after it.
 */
export function bootSession(): void {
  if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('engine') === 'v2') {
    useComplexStore.getState().setEngine('v2');
  }

  // Session survival across reloads (the operator's "don't re-enter each time"). The explicit
  // save/load buttons handle files, for durability and for sharing.
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) hydrateSession(JSON.parse(raw));
  } catch {
    // a corrupt stored session must never wedge the app
  }
  useComplexStore.subscribe(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(useComplexStore.getState().serialize()));
    } catch {
      // quota/serialization problems only cost persistence, never the session
    }
  });
}
