/**
 * #2890 ([ADR-3D-492](../../docs/06b-decisions-3d.md#adr-3d-492); ADR-W-210 phase 3) — A LAZY VALUE THAT CAN CROSS.
 *
 * The pivot's outcome carried three closures (`scalarConsumed`, `heldPins`, `placementFreedom`): values a reader may
 * ask for after the solve, computed on the first ask. A closure cannot be cloned, so a resolved figure could not leave
 * the heap that solved it (`structuredClone` threw on every figure the pivot had run on). Here the figure holds a
 * plain CELL instead: a marker that says "this figure has such a value". The value, once computed, and the way to
 * compute it are kept BESIDE the figure, in two tables of the heap that solved it, keyed by the cell object. So:
 *  - a figure is plain data, and it is the same data whether or not a reader has asked for its lazy values yet: a
 *    comparison of two figures, or a serialised view of one, never depends on what was read before (a cell that held
 *    its value would make it so; `store/__tests__/compute-once-2888.test.ts` is the lock that showed it);
 *  - a copy of the pivot (`{ ...pivot, … }`) shares the cell, as it shared the closure;
 *  - a clone of the figure carries the marker and no value: a value crosses addressed by the figure's content
 *    (`engine/evaluate.ts`: `lazyValue3`, `keepLazyValue3`; `store/journal3.ts` sends them).
 *
 * Nothing here knows a figure, a construction or a memo.
 */

/** A figure's marker for a value of type `T` that is computed on the first ask. Plain data; it holds no value. */
export interface Lazy3<T> {
  readonly lazy: true;
  /** Never set: it only carries the value's type. */
  readonly of?: T;
}

const computers = new WeakMap<Lazy3<unknown>, () => unknown>();
const held = new WeakMap<Lazy3<unknown>, unknown>();

/** A cell whose value THIS heap can compute, on the first ask. */
export function lazy3<T>(compute: () => T): Lazy3<T> {
  const cell: Lazy3<T> = { lazy: true };
  computers.set(cell, compute);
  return cell;
}

/** The cell's value, if this heap has it in hand; `undefined` if not. */
export function lazyHeld3<T>(cell: Lazy3<T>): T | undefined {
  return held.get(cell) as T | undefined;
}

/** Keep a value for the cell in this heap. */
export function holdLazy3<T>(cell: Lazy3<T>, value: T): T {
  held.set(cell, value);
  return value;
}

/** Forget the cell's value: the next ask computes it again (a solve that moved the figure re-measures). */
export function forgetLazy3(cell: Lazy3<unknown>): void {
  held.delete(cell);
}

/** Can this heap compute the cell's value (it solved the figure the cell belongs to)? */
export function computesHere3(cell: Lazy3<unknown>): boolean {
  return computers.has(cell);
}

/** Compute the cell's value here and keep it. The caller has checked {@link computesHere3}. */
export function computeHere3<T>(cell: Lazy3<T>): T {
  return holdLazy3(cell, (computers.get(cell) as () => T)());
}

/**
 * What in `T` a `structuredClone` refuses: a function or a symbol, at any depth; `never` when `T` crosses whole.
 * `Resolved3` asserts it (`RESOLVED_CROSSES3`, `engine/evaluate.ts`), so a closure added to a resolved figure fails
 * `tsc`. It cannot be asked of a type that refers to itself (a command that holds commands): the journal of a job
 * is checked by cloning every fixture's (`__tests__/two-heaps-2890.test.ts`).
 */
export type Uncloneable3<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends symbol
    ? T
    : T extends ReadonlyMap<infer K, infer V>
      ? Uncloneable3<K> | Uncloneable3<V>
      : T extends ReadonlySet<infer V>
        ? Uncloneable3<V>
        : T extends readonly (infer V)[]
          ? Uncloneable3<V>
          : T extends object
            ? { [K in keyof T]-?: Uncloneable3<T[K]> }[keyof T]
            : never;
