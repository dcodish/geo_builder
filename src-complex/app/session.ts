/**
 * SESSION BOOTSTRAP — the session that was already open.
 *
 * This used to run as a module side effect of `store/useComplexStore.ts`, and it does not belong there.
 * Restoring a stored session is not state definition: every stored line is **re-submitted**, so it
 * passes through the grammar and the acceptance gate exactly as a typed line does, and that is the
 * `app/` layer's job (ADR-CX-023). A store that replays its own contents on import is a store that
 * decides what is acceptable, one import earlier than anyone can see.
 *
 * It also read the `?engine=v2` switch, which had to happen BEFORE the stored lines were replayed — a
 * v2 session rehydrated through the prototype's yes/no would silently lose every v2-only line on
 * reload. The cutover removed the switch and the second engine with it
 * ([ADR-CX-027](../../docs/06d-decisions-complex.md#adr-cx-027)); there is one engine, so there is
 * nothing to route.
 */

import { useComplexStore } from '../store/useComplexStore';
import { hydrateSession } from './submit';

const LS_KEY = 'complex-proto-session';

/**
 * Restore any stored session, and start auto-persisting.
 *
 * Called once from `main.tsx`, before the first render — not from a component effect, because the
 * restored figure must be what the first paint shows rather than something that arrives after it.
 */
export function bootSession(): void {
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
