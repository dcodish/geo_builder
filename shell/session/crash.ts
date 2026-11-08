/**
 * A crash never erases the construction (#1507, ADR-W-195) — what a builder hands the crash boundary.
 *
 * React 18 unmounts the WHOLE root when a render throws and no boundary catches it: a white page,
 * the error only in the console, and the only way forward a reload. `shell/frame/CrashBoundary.tsx`
 * catches it instead. This module is the part of that feature that is not React: the contract a
 * builder's session store meets, the one rollback every builder runs, the suite keys of the notice,
 * and the dev-only trigger's flag. It names no product (ADR-W-016 rule 2): the store, the fields and
 * the autosave write all arrive from the caller.
 *
 * ## "The last good state"
 *
 * The fix plan's «שחזור» re-mounts the builder "with the last-good state". The boundary records the
 * store state of every render that COMMITTED (a render that throws never commits), and on a crash it
 * asks the builder to roll back to that state. Two classes of crash, one rule:
 *
 *  - a crash caused by TRANSIENT UI state (an editor that was open, a hover) happens with the store
 *    unchanged since the last commit: the rollback changes nothing, and the re-mount, which resets
 *    every component's local state, is the whole recovery;
 *  - a crash caused by the CONSTRUCTION (a statement whose figure the render cannot draw) would crash
 *    again on every re-mount, and again after a reload, because the autosave has already written it.
 *    Rolling the session slice back to what last drew is what makes «שחזור» a way out instead of a
 *    loop, and writing it through the autosave is what makes a reload offer it (FR-SL-6).
 */

/** The notice's suite keys (`shell/locales`, ADR-W-148): the sentences and the button are the suite's. */
export const CRASH_KEYS = {
  /** Nothing was rolled back: the construction is exactly as it was. */
  notice: 'suite.crash.notice',
  /** The change that preceded the crash was undone; the rest of the construction is kept. */
  noticeUndone: 'suite.crash.noticeUndone',
  /** «שחזור» — re-mount the builder. */
  recover: 'suite.crash.recover',
} as const;

/**
 * What the boundary needs from a builder's session store. A plain zustand store meets the first two
 * members as they are; {@link crashSessionOf} builds the whole value from one.
 */
export interface CrashSession<S = unknown> {
  /** The store's subscribe: the boundary re-checks which state last drew after every change. */
  subscribe(listener: () => void): () => void;
  /** The store's current state. A REFERENCE: stable until the store changes, compared by identity. */
  getState(): S;
  /** Does the session slice differ between two states — would the autosave write, would a rollback act? */
  changed(a: S, b: S): boolean;
  /**
   * Put the session slice back to `to` (a state `getState` returned after a committed render) and
   * write it through the autosave. True when anything was undone.
   */
  rollback(to: S): boolean;
}

/** What the boundary hands the builder's debug log. */
export interface CrashReport {
  /** The error's text, exactly as the notice shows it. */
  message: string;
  stack?: string;
  /** React's component stack: which component was rendering when it threw. */
  componentStack?: string;
  /** Whether the change that preceded the crash was undone. */
  undone: boolean;
}

/** The error's text for the notice and the log: `Name: message`, bounded, never throwing. */
export function crashText(error: unknown): string {
  let text: string;
  try {
    text = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  } catch {
    text = 'Error';
  }
  return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;
}
const MAX_TEXT = 300;

/**
 * The structural part of a zustand store wrapped in zundo's `temporal` that a rollback touches.
 * Structural on purpose: `shell/` imports neither library, and a builder's store fits as it is.
 */
export interface UndoableStore<S> {
  getState(): S;
  setState(partial: Partial<S>): void;
  subscribe(listener: (state: S, prev: S) => void): () => void;
  temporal: { getState(): { pastStates: readonly Partial<S>[]; undo(steps?: number): void } };
}

export interface CrashSessionSpec<S> {
  /**
   * The session slice: every field the builder's autosave persists AND every field its undo history
   * tracks. A rollback restores exactly these, by reference, as undo does.
   */
  slice: readonly (keyof S)[];
  /** Transient fields a rollback clears with it, as the builder's own undo does (an error about the undone line). */
  clear?: Partial<S>;
  /** Write the session now, through the builder's autosave (which skips an empty session itself). */
  persist(): void;
}

/** Does any field of the slice differ, by reference — the autosave's own test. */
export function sliceChanged<S>(slice: readonly (keyof S)[], a: S, b: S): boolean {
  return slice.some((k) => a[k] !== b[k]);
}

/** Every field an undo-history entry carries equals the state's, by reference. */
function sameEntry<S>(entry: Partial<S>, state: S): boolean {
  return (Object.keys(entry) as (keyof S)[]).every((k) => entry[k] === state[k]);
}

/**
 * The one rollback, for every builder whose store is zustand + zundo.
 *
 * The failing state is normally ONE undo step past the last good one (the student's last line, ✕,
 * chip or edit), so the rollback steps back THROUGH the history: the failing step moves to the redo
 * side, where it stays reachable and honest, and an undo after recovery goes on to the step BEFORE
 * the last good one, never forward into the crash. When the history does not hold that step (a load
 * that cleared it, a crash on an undo), the slice is set directly, as undo itself sets it. Either way
 * the result is written through the autosave, because the boundary unmounted the component whose
 * effect runs it.
 */
export function crashSessionOf<S extends object>(store: UndoableStore<S>, spec: CrashSessionSpec<S>): CrashSession<S> {
  const changed = (a: S, b: S) => sliceChanged(spec.slice, a, b);
  return {
    subscribe: (listener) => store.subscribe(() => listener()),
    getState: () => store.getState(),
    changed,
    rollback: (to) => {
      const now = store.getState();
      if (!changed(now, to)) return false;
      const history = store.temporal.getState();
      const top = history.pastStates[history.pastStates.length - 1];
      if (top && sameEntry(top, to) && !sameEntry(top, now)) history.undo();
      const restore = {} as Partial<S>;
      for (const k of spec.slice) restore[k] = to[k];
      store.setState({ ...restore, ...spec.clear });
      spec.persist();
      return true;
    },
  };
}

/**
 * The dev-only trigger's mode, read from the page's query string (ADR-W-195). The CALLER gates it on
 * `import.meta.env.DEV`, so a production build never reads it:
 *
 *  - `?crash` (or `?crash=now`): a 💥 button whose click makes the next render throw — a crash with
 *    the construction unchanged, so nothing is undone;
 *  - `?crash=next`: the click arms it, and the render after the next change of the construction
 *    throws — a crash caused by a change, so that change is undone.
 */
export type DevCrashMode = 'now' | 'next';

export function devCrashMode(search: string): DevCrashMode | null {
  let v: string | null;
  try {
    v = new URLSearchParams(search).get('crash');
  } catch {
    return null;
  }
  if (v === null) return null;
  return v === 'next' ? 'next' : 'now';
}

/** The dev trigger's error text — what the notice shows when the operator crashes it on purpose. */
export const DEV_CRASH_MESSAGE = 'a deliberate crash from the dev-only ?crash flag';
