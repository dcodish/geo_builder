/**
 * SOLVED CONTENT IS KEYED BY CONTENT (#2888, [ADR-AG-476](../../docs/06c-decisions-analytic.md#adr-ag-476); ADR-W-210
 * invariant 4, "compute once").
 *
 * Every solver memo of this tree hangs off a `Construction` OBJECT (the evaluation per seed, the drawable walk, the
 * pin and block roots, the parts, the rank registers). That was a content key in name only: `derive` folded a new
 * construction on every call, so a submit's decision, the re-render after it, every step of «הציגו תצורה אחרת» and
 * every edit started all of them cold and solved the same figure again.
 *
 * Three pieces, and nothing else in the tree needs to know about them:
 *
 * 1. **A CONTENT object and its VIEWS.** `derive` folds one construction per line list and keeps it
 *    (`derive.ts`'s store). What a caller receives is a VIEW of it ({@link viewOf}): a fresh shallow copy per call.
 *    {@link contentOf} maps a view back to its content, and any other construction to itself.
 * 2. **{@link ContentCache}**: a `WeakMap<Construction, V>` that keys by `contentOf(c)`. Every pure solver memo is one,
 *    so all the views of one line list share one set of solves, for as long as the store holds the content.
 * 3. **What is NOT shared: the page's own state about a derivation.** The configuration pool's mode (`deferred`,
 *    `pendingShown`) says how ONE reader treats a figure, so it stays keyed by the view (`evaluate.ts` `poolCache`): a
 *    decision that derives the lines the page is showing gets its own, undeferred pool and a settled verdict, exactly as
 *    it did when every `derive` call built its own construction. Sharing it would have made a verdict depend on whether
 *    the page's pool had finished.
 *
 * A memo hit can never change a result: every function memoised here is pure over (content, its key), which is what
 * made it a memo in the first place. `content-cache.test.ts` locks cold against warm.
 *
 * {@link BoundedStore} is the bound of whatever outlives an action: least recently used first, by count.
 */
import type { Construction } from './types';

const contentRef = new WeakMap<Construction, Construction>();

/** The content a view shows; any construction that is not a view is its own content. */
export function contentOf(c: Construction): Construction {
  return contentRef.get(c) ?? c;
}

/** A view of `content`: a fresh object per call, equal to it field by field, sharing every solver memo with it. */
export function viewOf(content: Construction): Construction {
  const root = contentOf(content);
  const view: Construction = { ...root };
  contentRef.set(view, root);
  return view;
}

/** Every content-keyed cache and store, so one call can empty them all ({@link clearContentCaches}). */
const registry: Array<() => void> = [];

/** A memo per construction CONTENT: the `WeakMap` every solver memo was, read through {@link contentOf}. */
export class ContentCache<V> {
  private map = new WeakMap<Construction, V>();
  constructor() {
    registry.push(() => {
      this.map = new WeakMap();
    });
  }
  get(c: Construction): V | undefined {
    return this.map.get(contentOf(c));
  }
  has(c: Construction): boolean {
    return this.map.has(contentOf(c));
  }
  set(c: Construction, value: V): this {
    this.map.set(contentOf(c), value);
    return this;
  }
}

/**
 * A store that outlives the student's action, bounded by COUNT: at most `max` entries, the least recently used dropped
 * first. A read refreshes its entry. Dropping an entry frees everything that hangs off it (the solver memos are weak).
 */
export class BoundedStore<V> {
  private readonly map = new Map<string, V>();
  constructor(readonly max: number) {
    registry.push(() => this.map.clear());
  }
  get size(): number {
    return this.map.size;
  }
  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (hit === undefined) return undefined;
    this.map.delete(key);
    this.map.set(key, hit);
    return hit;
  }
  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string);
  }
  delete(key: string): void {
    this.map.delete(key);
  }
}

/**
 * EMPTY EVERY CONTENT-KEYED CACHE — test-only (2-D's `clearReplayCaches`). The work meter's walk calls it where a
 * student's session starts, so a recorded count depends on nothing that ran before the figure; a test that measures
 * what a COLD derivation costs calls it to make the derivation cold. Nothing in the product calls it.
 */
export function clearContentCaches(): void {
  for (const clear of registry) clear();
}
