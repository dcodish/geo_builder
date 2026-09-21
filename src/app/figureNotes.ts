/**
 * A MESSAGE ABOUT THE FIGURE DIES WITH THE FACTS IT WAS ABOUT (#1338, [ADR-543](../../docs/06-decisions.md#adr-543)).
 *
 * **Operator, 2026-09-21, playing round #1332:** *"when there is an error message of any kind and user
 * removes an input line (presses x), the shape gets recalculated correctly but the error message stays"*.
 *
 * The store's whole design is that the figure is DERIVED from `(facts, seed)` — positions are never
 * stored, so undo cannot desync. The banner was the one thing that escaped that: it is React state set
 * at submit time, and the row's ✕ calls the store's `remove`, which re-folds the facts and redraws and
 * never touches the component. So every message ABOUT THE FIGURE — «לא נמצאה תצורה שמקיימת את כל
 * הדרישות יחד», the LLM-dropped list, a rename note — outlived the line it was about.
 *
 * **Why a subscription and not a call in each handler.** The notes were already cleared in three places
 * (the submit pipeline's start, a successful submit, and typing in the box) and that is exactly the
 * shape that lets the next mutation forget: ✕, mute, undo, redo, ✎ and a file load are six more doors,
 * and the seventh has not been written yet. One subscription on the FACTS makes the rule structural —
 * *the notes belong to a fact list, and a different fact list has no notes yet* — so a mutation added
 * later inherits it without knowing this file exists.
 *
 * **Ordering is what makes this safe**, and it was measured rather than assumed: every site that sets a
 * note either commits nothing (the refusal paths, `setRenameNote`'s `else` branches) or commits FIRST
 * and sets the note after (`executeMany` then `setLlmDropped`; `resolveAfterCommit` then `onExhausted`).
 * Zustand notifies synchronously, so the clear always lands before the note it must not erase.
 *
 * **Sibling audit (docs/17 §1): 2-D only, measured.** The analytic store clears `error`/`notice` inside
 * `removeLine` itself, and 3-D's `remove`/`toggle` recompute `lastError` from `dependentsBroken`. Both
 * keep the message in the STORE, where it is a function of the facts; 2-D kept it in the component,
 * which is the whole of the defect.
 */

/** The figure-level notes a fact change invalidates. The UI's setters, injected — never imported. */
export interface FigureNoteSinks {
  setInputNote(msg: string): void;
  setLlmDropped(steps: string[]): void;
  setRenameNote(msg: string): void;
  setAltNote(msg: string): void;
}

/** Every figure-level note, cleared together. One list, so a new note cannot be added to only half. */
export function clearFigureNotes(ui: FigureNoteSinks): void {
  ui.setInputNote('');
  ui.setLlmDropped([]);
  ui.setRenameNote('');
  ui.setAltNote('');
}

/** The minimum of a Zustand store this needs: notify me with the new and previous state. */
type FactsHolder = { facts: unknown };
type Subscribe<S extends FactsHolder> = (listener: (state: S, prev: S) => void) => () => void;

/**
 * Clear the figure-level notes whenever the FACT LIST changes identity.
 *
 * Deliberately NOT on `seed`: cycling to another configuration keeps the same statements, so a note
 * about them is still true. Returns the unsubscribe, for the effect that owns it.
 */
export function subscribeFigureNotes<S extends FactsHolder>(subscribe: Subscribe<S>, ui: FigureNoteSinks): () => void {
  return subscribe((state, prev) => {
    if (state.facts === prev.facts) return;
    clearFigureNotes(ui);
  });
}
