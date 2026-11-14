/**
 * SOLVED CONTENT IS KEYED BY CONTENT (#2888, [ADR-3D-491](../../docs/06b-decisions-3d.md#adr-3d-491); ADR-W-210 invariant 4).
 *
 * Every memo of this tree hangs off an object: the fact array (`derive3`), the construction (`resolve3`, the pivot's
 * recorded pools, the parts). The fold builds a new construction each time it runs, so the same figure reached a second
 * time (another configuration of the same lines, a row edited to what it said, a part no line touched) was a new object
 * and was solved again. A {@link ContentTable} gives each CONTENT one object: the first object seen with a content is
 * its representative, and every later object with the same content is answered with that one, so the memos that hang
 * off it are found again.
 *
 * "The same content" is exact, never a digest: a hash only picks the candidates, and {@link sameContent3} then compares
 * the two graphs node by node. Two graphs are the same when they are the same shape (arrays, maps and sets in their own
 * order; plain objects with the same keys in the same order), hold the same primitives (`Object.is`: NaN is NaN, −0 is
 * not 0, a key holding `undefined` is not a missing key), SHARE objects in the same places (a claim listed twice is one
 * object in both, or two in both: code that asks `list.includes(x)` then answers alike), and carry the same side-table
 * entries on corresponding objects (`annotation`: the pin-origin table, which `resolve3` reads). A graph holding
 * anything else (a function, a class instance, a symbol) has no content here and stays its own representative, which
 * is the identity rule the memos had before. So does an object the table's `settled` test turns away: one whose side
 * table is still being written, whose content would change after it was taken.
 *
 * A table is bounded: it holds at most `bound` representatives and drops the least recently used. Dropping one loses
 * nothing but the sharing: an object already answered keeps its answer, and a later object of that content becomes the
 * new representative and is solved once more.
 */

/** A side table read with an object of the graph: equal graphs must carry equal entries on corresponding objects. */
export type Annotation3 = (node: object) => unknown;

const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);
/** Deeper than any construction or fact list; a graph this deep (or cyclic) is treated as having no content. */
const MAX_DEPTH = 64;

let acc = 0;
const mix = (v: number): void => {
  acc = Math.imul(acc ^ v, 0x01000193) >>> 0;
};
const mixString = (s: string): void => {
  mix(s.length);
  for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i));
};

const isPlain = (v: object): boolean => {
  const proto = Object.getPrototypeOf(v) as unknown;
  return proto === Object.prototype || proto === null;
};

/** Mix `v` into the running hash; false when `v` holds something that has no content (see the module comment). */
function hashInto(v: unknown, depth: number): boolean {
  switch (typeof v) {
    case 'string':
      mix(1);
      mixString(v);
      return true;
    case 'number':
      mix(2);
      if (v !== v) {
        mix(3); // every NaN is one NaN (`Object.is`)
        return true;
      }
      F64[0] = v;
      mix(U32[0]);
      mix(U32[1]);
      return true;
    case 'boolean':
      mix(v ? 4 : 5);
      return true;
    case 'undefined':
      mix(6);
      return true;
    case 'object': {
      if (v === null) {
        mix(7);
        return true;
      }
      if (depth > MAX_DEPTH) return false;
      if (Array.isArray(v)) {
        mix(8);
        mix(v.length);
        for (let i = 0; i < v.length; i++) if (!hashInto(v[i], depth + 1)) return false;
        return true;
      }
      if (v instanceof Map) {
        mix(9);
        mix(v.size);
        for (const [k, x] of v) if (!hashInto(k, depth + 1) || !hashInto(x, depth + 1)) return false;
        return true;
      }
      if (v instanceof Set) {
        mix(10);
        mix(v.size);
        for (const x of v) if (!hashInto(x, depth + 1)) return false;
        return true;
      }
      if (!isPlain(v)) return false;
      mix(11);
      const rec = v as Record<string, unknown>;
      for (const k of Object.keys(rec)) {
        mixString(k);
        if (!hashInto(rec[k], depth + 1)) return false;
      }
      return true;
    }
    default:
      return false; // a function, a symbol, a bigint
  }
}

/** The content's hash, or null when the graph holds something that has no content. Never an identity on its own. */
export function contentHash3(v: unknown): number | null {
  acc = 0x811c9dc5;
  return hashInto(v, 0) ? acc : null;
}

/** Are the two graphs the same content? Exact: see the module comment. Both must have a {@link contentHash3}. */
export function sameContent3(a: unknown, b: unknown, annotation?: Annotation3): boolean {
  const ab = new Map<object, object>();
  const ba = new Map<object, object>();
  const same = (x: unknown, y: unknown): boolean => {
    if (typeof x !== 'object' || x === null) return typeof x !== 'function' && Object.is(x, y);
    if (typeof y !== 'object' || y === null) return false;
    const paired = ab.get(x);
    if (paired !== undefined) return paired === y; // the same object again: it must be the same one on the other side
    if (ba.has(y)) return false;
    ab.set(x, y);
    ba.set(y, x);
    if (Array.isArray(x)) {
      if (!Array.isArray(y) || x.length !== y.length) return false;
      for (let i = 0; i < x.length; i++) if (!same(x[i], y[i])) return false;
    } else if (x instanceof Map) {
      if (!(y instanceof Map) || x.size !== y.size) return false;
      const other = y.entries();
      for (const [k, v] of x) {
        const [k2, v2] = other.next().value as [unknown, unknown];
        if (!same(k, k2) || !same(v, v2)) return false;
      }
    } else if (x instanceof Set) {
      if (!(y instanceof Set) || x.size !== y.size) return false;
      const other = y.values();
      for (const v of x) if (!same(v, other.next().value)) return false;
    } else {
      if (Array.isArray(y) || y instanceof Map || y instanceof Set || !isPlain(x) || !isPlain(y)) return false;
      const xr = x as Record<string, unknown>;
      const yr = y as Record<string, unknown>;
      const keys = Object.keys(xr);
      const keys2 = Object.keys(yr);
      if (keys.length !== keys2.length) return false;
      for (let i = 0; i < keys.length; i++) if (keys[i] !== keys2[i] || !same(xr[keys[i]], yr[keys[i]])) return false;
    }
    return annotation ? same(annotation(x), annotation(y)) : true;
  };
  return same(a, b);
}

/** What a table has done, by count (the locks read these; never a clock). */
export interface ContentStats3 {
  /** objects answered with an earlier object of the same content */
  shared: number;
  /** objects that became the representative of a new content */
  fresh: number;
  /** objects with no content, or not yet settled (kept as their own representative, and not held by the table) */
  opaque: number;
  /** representatives dropped for the bound */
  dropped: number;
}

export class ContentTable<T extends object> {
  readonly stats: ContentStats3 = { shared: 0, fresh: 0, opaque: 0, dropped: 0 };
  private answered = new WeakMap<T, T>();
  private readonly buckets = new Map<number, T[]>();
  /** representative → its hash and the tick it was last asked for */
  private readonly held = new Map<T, { hash: number; used: number }>();
  private tick = 0;

  constructor(
    /** The most representatives the table holds. */
    readonly bound: number,
    private readonly annotation?: Annotation3,
    /** Is this object's content final, its side table included? An object that is not keeps the identity rule. */
    private readonly settled?: (v: T) => boolean,
  ) {}

  /** How many representatives the table holds now. */
  get size(): number {
    return this.held.size;
  }

  /** The representative of `v`'s content: `v` itself when its content is new (or it has none). */
  of(v: T): T {
    const known = this.answered.get(v);
    if (known !== undefined) {
      const entry = this.held.get(known);
      if (entry) entry.used = ++this.tick;
      return known;
    }
    const hash = this.settled && !this.settled(v) ? null : contentHash3(v);
    if (hash === null) {
      this.stats.opaque++;
      this.answered.set(v, v);
      return v;
    }
    for (const k of this.buckets.get(hash) ?? []) {
      if (!sameContent3(v, k, this.annotation)) continue;
      this.stats.shared++;
      this.answered.set(v, k);
      this.held.get(k)!.used = ++this.tick;
      return k;
    }
    this.stats.fresh++;
    this.answered.set(v, v);
    this.held.set(v, { hash, used: ++this.tick });
    const bucket = this.buckets.get(hash);
    if (bucket) bucket.push(v);
    else this.buckets.set(hash, [v]);
    if (this.held.size > this.bound) this.dropOldest();
    return v;
  }

  private dropOldest(): void {
    let oldest: T | null = null;
    let at = Infinity;
    for (const [k, e] of this.held) {
      if (e.used < at) {
        at = e.used;
        oldest = k;
      }
    }
    if (oldest === null) return;
    const { hash } = this.held.get(oldest)!;
    this.held.delete(oldest);
    const rest = (this.buckets.get(hash) ?? []).filter((k) => k !== oldest);
    if (rest.length > 0) this.buckets.set(hash, rest);
    else this.buckets.delete(hash);
    this.stats.dropped++;
  }

  /**
   * The representatives whose content is no longer the one they were taken with. A representative stands for its
   * content, so it must never be changed after it is taken (the rule every per-object memo already rests on); the
   * lock asserts this stays empty over real sessions.
   */
  changed(): T[] {
    return [...this.held].filter(([k, e]) => contentHash3(k) !== e.hash).map(([k]) => k);
  }

  /** Forget everything: every object is asked again (tests and the work meter's walk; never the product). */
  clear(): void {
    this.answered = new WeakMap();
    this.buckets.clear();
    this.held.clear();
    this.tick = 0;
  }
}
