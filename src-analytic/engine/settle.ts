/**
 * A FINISHED ACTION AS DATA, AND ITS ADOPTION (#2890, [ADR-AG-477](../../docs/06c-decisions-analytic.md#adr-ag-477);
 * [ADR-W-210](../../docs/06w-decisions-workspace.md#adr-w-210) phase 3, "settle, then hand over").
 *
 * The page may not solve. So the heap that solved (a worker) hands the page what it solved, as plain data, and the page
 * ADOPTS it into its own memos; every synchronous reader of the page then finds its answer already there. This module is
 * the two halves of that hand-over and the lock on what crosses. Nothing on the page calls it yet.
 *
 * WHAT A SETTLED RESULT IS. Everything `derive` and the solver keep about a set of line lists, as ONE object graph:
 *  - `lists`   the line-list store's own entries (the fold, every derivation computed, the lettered constructions), under
 *              the store's own key (`lineListKey`);
 *  - `memos`   every NAMED content cache's entry for every construction reachable from those lists: the drawable figures
 *              the page's gates read, and the memos the solver would need to go on from there (a reseeded worker);
 *  - `figures` the three side tables that are keyed by a figure OBJECT and say which configuration it is. A clone has new
 *              objects, so these would be lost without a word (`drawnSampleOf` would answer "unknown").
 * One graph, cloned in one `structuredClone`, keeps every identity inside it: a memo's key IS the construction its line
 * list holds, `figure.unsatisfied[i]` IS a constraint of that construction, and the keys of `construction.rowLine` are too.
 *
 * WHAT A CLONE DROPS, BY DESIGN ({@link DROPPED_BY_A_CLONE}): the four lazy rank readers on a figure and on a ring fault.
 * They are non-enumerable closures over the solver's own state; a clone leaves them behind silently. Only `deriveAt` and
 * the configuration walk read them, in the heap that solved. No page code does, and `settle.test.ts` locks that.
 *
 * WHAT IS NOT CARRIED: what one reader has asked through its view, and its pool's mode (`evaluate.ts` `askedOf`,
 * `poolCache`). They are one reader's state. The page's own view asks again, and every ask is a lookup.
 *
 * {@link cloneLoss} is the lock: it names everything in a result that `structuredClone` would refuse, flatten or drop
 * and that is not on the by-design list. A memo that one day holds a function, a class instance or a new hidden lazy
 * fails it, instead of reaching a page that then solves again or shows something else.
 */
import { namedContentCaches } from './content';
import { adoptLineList, lineListOf, touchedLineLists, type LineList } from './derive';
import { figureTagsOf, tagFigure, type Figure, type FigureTags } from './evaluate';
import type { Construction } from './types';

export interface Settled {
  /** The line-list store's entries, each under its `lineListKey`. */
  lists: Array<[key: string, list: LineList]>;
  /** A named content cache's entry: the cache's name, the construction it hangs off (an object of `lists`), the value. */
  memos: Array<[cache: string, construction: Construction, value: unknown]>;
  /** Which configuration a figure is: the side tables a clone would lose. */
  figures: Array<[figure: Figure, tags: FigureTags]>;
}

/**
 * The non-enumerable members a clone leaves behind on purpose: `Figure.separationDof`, `Figure.freedomOfRead`,
 * `RingFault.ringDof`, `RingFault.shapeDof` (`evaluate.ts`). Read only where the figure was solved.
 */
export const DROPPED_BY_A_CLONE: readonly string[] = ['separationDof', 'freedomOfRead', 'ringDof', 'shapeDof'];

type Rec = Record<string, unknown>;
const isObject = (o: unknown): o is Rec => typeof o === 'object' && o !== null;
const isConstruction = (o: unknown): o is Construction =>
  isObject(o) && Array.isArray(o.params) && Array.isArray(o.objects) && Array.isArray(o.constraints) && Array.isArray(o.selectors);
const isFigure = (o: unknown): o is Figure => isObject(o) && Array.isArray(o.points) && Array.isArray(o.curves) && Array.isArray(o.segments) && 'env' in o;

/** Walk a memo's value and report the constructions and figures in it. A construction and a figure are leaves. */
function scan(value: unknown, onConstruction: (c: Construction) => void, onFigure: (f: Figure) => void, seen: Set<unknown>): void {
  if (!isObject(value) || seen.has(value)) return;
  seen.add(value);
  if (isConstruction(value)) return onConstruction(value);
  if (isFigure(value)) return onFigure(value);
  if (Array.isArray(value)) {
    for (const v of value) scan(v, onConstruction, onFigure, seen);
    return;
  }
  if (value instanceof Map) {
    for (const [k, v] of value) {
      scan(k, onConstruction, onFigure, seen);
      scan(v, onConstruction, onFigure, seen);
    }
    return;
  }
  if (value instanceof Set) {
    for (const v of value) scan(v, onConstruction, onFigure, seen);
    return;
  }
  for (const v of Object.values(value)) scan(v, onConstruction, onFigure, seen);
}

/**
 * Run `fn` and report the line lists it read or wrote in this heap's store: the lists a settled result of that action
 * has to carry ({@link settledOf}).
 */
export function settling<T>(fn: () => T): { value: T; keys: string[] } {
  return touchedLineLists(fn);
}

/**
 * The settled result of the line lists named by `keys`, read from THIS heap's store: the lists and every named memo that
 * hangs off a construction reachable from them. A key the store does not hold (dropped by its bound) is left out.
 * The result shares every object with the store: clone it (`structuredClone`, a `postMessage`) before anything adopts it.
 */
export function settledOf(keys: readonly string[]): Settled {
  const lists: Settled['lists'] = [];
  const constructions = new Set<Construction>();
  const figures = new Set<Figure>();
  const queue: Construction[] = [];
  const add = (c: Construction): void => {
    if (constructions.has(c)) return;
    constructions.add(c);
    queue.push(c);
  };
  for (const key of new Set(keys)) {
    const list = lineListOf(key);
    if (!list) continue;
    lists.push([key, list]);
    add(list.front.construction);
    add(list.front.folded.construction);
    for (const c of list.shown.values()) add(c);
    for (const { derivation } of list.derivations.values()) {
      add(derivation.construction);
      figures.add(derivation.figure);
    }
  }
  const memos: Settled['memos'] = [];
  const seen = new Set<unknown>();
  const caches = [...namedContentCaches()];
  while (queue.length > 0) {
    const c = queue.pop() as Construction;
    if (c.whole) add(c.whole);
    for (const [name, cache] of caches) {
      if (!cache.has(c)) continue;
      const value = cache.get(c);
      memos.push([name, c, value]);
      scan(value, add, (f) => figures.add(f), seen);
    }
  }
  const tagged: Settled['figures'] = [];
  for (const f of figures) {
    const tags = figureTagsOf(f);
    if (tags) tagged.push([f, tags]);
  }
  return { lists, memos, figures: tagged };
}

/**
 * Adopt a settled result into THIS heap: after it, `derive` of those lines is a lookup and every memo the result carried
 * answers as if it had been computed here. `message` must be a clone of its own (it is installed, not copied), and must
 * come from the same build: a memo this heap does not have is an error, never a silent drop.
 */
export function adoptSettled(message: Settled): void {
  const caches = namedContentCaches();
  for (const [name] of message.memos) if (!caches.has(name)) throw new Error(`adoptSettled: no content cache named «${name}» in this build`);
  for (const [key, list] of message.lists) adoptLineList(key, list);
  for (const [name, construction, value] of message.memos) (caches.get(name) as NonNullable<ReturnType<typeof caches.get>>).set(construction, value);
  for (const [figure, tags] of message.figures) tagFigure(figure, tags);
}

const PLAIN = new Set<unknown>([Object.prototype, null, Array.prototype, Map.prototype, Set.prototype]);
/** How many losses {@link cloneLoss} lists before it stops: one is already a failure. */
const LOSSES_LISTED = 20;

/**
 * EVERYTHING IN `value` THAT A STRUCTURED CLONE WOULD REFUSE, FLATTEN OR DROP, each with the path to it; empty when the
 * clone is faithful. A function or a symbol (the clone throws); an object that is not a plain object, array, `Map` or
 * `Set` (its class is lost); an accessor (it is read once and frozen into a value); a non-enumerable member (it is left
 * behind), unless it is one of {@link DROPPED_BY_A_CLONE}.
 */
export function cloneLoss(value: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<unknown>();
  const stack: Array<[unknown, string]> = [[value, '$']];
  while (stack.length > 0 && out.length < LOSSES_LISTED) {
    const [v, path] = stack.pop() as [unknown, string];
    if (typeof v === 'function') {
      out.push(`${path}: a function`);
      continue;
    }
    if (typeof v === 'symbol') {
      out.push(`${path}: a symbol`);
      continue;
    }
    if (!isObject(v) || seen.has(v)) continue;
    seen.add(v);
    const proto: unknown = Object.getPrototypeOf(v);
    if (!PLAIN.has(proto)) {
      out.push(`${path}: an instance of ${(proto as { constructor?: { name?: string } } | null)?.constructor?.name ?? 'an unknown class'}`);
      continue;
    }
    if (v instanceof Map) {
      let i = 0;
      for (const [k, x] of v) {
        stack.push([k, `${path}<key ${i}>`], [x, `${path}<${typeof k === 'string' || typeof k === 'number' ? String(k) : `value ${i}`}>`]);
        i += 1;
      }
      continue;
    }
    if (v instanceof Set) {
      let i = 0;
      for (const x of v) stack.push([x, `${path}<${i++}>`]);
      continue;
    }
    const array = Array.isArray(v);
    for (const key of Reflect.ownKeys(v)) {
      if (typeof key === 'symbol') {
        out.push(`${path}: a symbol-keyed member`);
        continue;
      }
      if (array && key === 'length') continue;
      const d = Object.getOwnPropertyDescriptor(v, key) as PropertyDescriptor;
      const at = array ? `${path}[${key}]` : `${path}.${key}`;
      if (!d.enumerable) {
        if (!DROPPED_BY_A_CLONE.includes(key)) out.push(`${at}: not enumerable, a clone leaves it behind`);
        continue;
      }
      if (d.get || d.set) {
        out.push(`${at}: an accessor`);
        continue;
      }
      stack.push([d.value, at]);
    }
  }
  return out;
}
