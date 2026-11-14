/**
 * #2890 ([ADR-3D-492](../../docs/06b-decisions-3d.md#adr-3d-492); ADR-W-210 phase 3) — A LAZY VALUE THAT CAN CROSS.
 *
 * The pivot's outcome carried three closures (`scalarConsumed`, `heldPins`, `placementFreedom`): values a reader may
 * ask for after the solve, computed on the first ask. A closure cannot be cloned, so a resolved figure could not leave
 * the heap that solved it (`structuredClone` threw on every figure the pivot had run on). Here the figure holds a
 * plain CELL instead: `{ v }`, the value once it is computed and `null` until then. How to compute it stays in the
 * heap that solved the figure, in a table keyed by the cell object, never on the figure. So:
 *  - a figure is plain data, and a clone of it carries every value its readers had already asked for;
 *  - a copy of the pivot (`{ ...pivot, … }`) shares the cell, as it shared the closure;
 *  - in a heap that did not solve the figure a cell with no value has no way to compute it here: the reader
 *    (`engine/evaluate.ts`, `lazyValue3`) then takes the value that followed the figure, or solves the figure again.
 *
 * Nothing here knows a figure, a construction or a memo.
 */

/** The value once computed, `null` until then. Plain data: it crosses a `structuredClone` as it stands. */
export interface Lazy3<T> {
  v: T | null;
}

const computers = new WeakMap<Lazy3<unknown>, () => unknown>();

/** A cell whose value THIS heap can compute, on the first ask. */
export function lazy3<T>(compute: () => T): Lazy3<T> {
  const cell: Lazy3<T> = { v: null };
  computers.set(cell, compute);
  return cell;
}

/** Can this heap compute the cell's value (it solved the figure the cell belongs to)? */
export function computesHere3(cell: Lazy3<unknown>): boolean {
  return computers.has(cell);
}

/** Compute the cell's value here and keep it. The caller has checked {@link computesHere3}. */
export function computeHere3<T>(cell: Lazy3<T>): T {
  const v = (computers.get(cell) as () => T)();
  cell.v = v;
  return v;
}
