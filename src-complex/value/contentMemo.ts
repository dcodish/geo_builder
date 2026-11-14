/**
 * THE CONTENT-KEYED MEMO (#2888, [ADR-CX-090](../../docs/06d-decisions-complex.md#adr-cx-090); ADR-W-210 invariant 4,
 * "compute once").
 *
 * One bounded table from a CONTENT key to a computed value, for a pure function whose result is worth keeping
 * past the student's action. Three rules, and they are the whole design:
 *
 *  1. **The key is content, and it is the caller's whole input.** A string built from everything the function
 *     reads, never the identity of an array or object that is rebuilt per action. A key that leaves out part of
 *     the input serves one reading for another, and that is a wrong figure, not a slow one.
 *  2. **A stored value is frozen, deeply.** A hit hands the same object to every caller, so a caller that changed
 *     it would change what the next caller reads, and a result would depend on what ran before. {@link deepFreeze}
 *     makes such a write throw where it is made.
 *  3. **The table is bounded, least recently used out first.** `max` entries; a read refreshes an entry, so
 *     content the session still uses is never the one evicted while there is older content to drop.
 *
 * Every memo made here is in one registry, and {@link clearContentMemos} empties them all. That is what makes
 * "cold" one call: the work meter's walk starts each figure from it (so a count depends on nothing run before the
 * figure), and a memo added later cannot be forgotten by it.
 *
 * In `value/`, the bottom layer, so that the parser and the app use one implementation. It knows nothing of
 * either.
 */

export interface ContentMemo<V> {
  /** What the memo holds, in a word: how a measurement or a test names it. */
  readonly name: string;
  /** The stored value, refreshed as the most recently used. Undefined on a miss. */
  get(key: string): V | undefined;
  /** Store `value` (frozen, deeply) under `key`, evicting the least recently used entry past the bound. Returns it. */
  set(key: string, value: V): V;
  clear(): void;
  /** Entries held now. */
  readonly size: number;
  /** The bound: `size` never exceeds it. */
  readonly max: number;
}

/** Every memo, by its name. A module evaluated again (a hot reload in development) makes its memo again under the
 *  same name: the new one takes the old one's place, so the registry never holds a table nothing can reach. */
const registry = new Map<string, ContentMemo<unknown>>();

/**
 * Freeze `value` and everything reachable from it. Arrays and plain objects are frozen outright; a `Map` or a
 * `Set` cannot be (its entries stay writable through its own methods), so only what it holds is frozen and the
 * engine's types keep it read-only (`ReadonlyMap`, `ReadonlySet`). A `RegExp` is left alone (matching writes its
 * `lastIndex`), and so are functions and buffer views. An object already frozen is not entered again, which is
 * also what ends a shared or cyclic part.
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof RegExp || ArrayBuffer.isView(value)) return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  if (value instanceof Map) {
    for (const [k, v] of value) {
      deepFreeze(k);
      deepFreeze(v);
    }
  } else if (value instanceof Set) {
    for (const v of value) deepFreeze(v);
  } else {
    for (const k of Reflect.ownKeys(value)) deepFreeze((value as Record<PropertyKey, unknown>)[k]);
  }
  return value;
}

/** A new memo of at most `max` entries, registered for {@link clearContentMemos} under `name`. */
export function contentMemo<V>(name: string, max: number): ContentMemo<V> {
  if (!Number.isInteger(max) || max < 1) {
    throw new Error(`contentMemo «${name}»: the bound must be a positive integer, got ${max}`);
  }
  // a Map iterates in insertion order, so re-inserting on a read keeps the least recently used entry first
  const entries = new Map<string, V>();
  const memo: ContentMemo<V> = {
    name,
    get(key) {
      const hit = entries.get(key);
      if (hit === undefined) return undefined;
      entries.delete(key);
      entries.set(key, hit);
      return hit;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, deepFreeze(value));
      if (entries.size > max) entries.delete(entries.keys().next().value as string);
      return value;
    },
    clear: () => entries.clear(),
    get size() {
      return entries.size;
    },
    max,
  };
  registry.set(name, memo as ContentMemo<unknown>);
  return memo;
}

/**
 * Empty every content memo of this builder — the state of a session that has just opened. Results never depend on
 * it (a memo only ever returns what the function would compute); the work that is EXECUTED does, which is why the
 * work meter's walk and the tests that compare cold with warm call it.
 */
export function clearContentMemos(): void {
  for (const m of registry.values()) m.clear();
}

/** How many entries each registered memo holds, by its name (the memory measurement and the bound's tests). */
export function contentMemoSizes(): Record<string, { size: number; max: number }> {
  return Object.fromEntries([...registry].map(([name, m]) => [name, { size: m.size, max: m.max }]));
}
