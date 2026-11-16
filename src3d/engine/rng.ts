/**
 * Deterministic seeded sampling for free DOFs (docs/20 §6.1; ADR-052 transplanted:
 * an unstated dimension is a free DOF with a *sampled* starting value, varied by
 * "show another configuration").
 *
 * STABILITY IS STRUCTURAL: every sample is keyed by (seed, stable object key), never
 * by insertion order — adding a fact cannot shift the samples of earlier objects,
 * so the figure doesn't jump (the 2-D tool's first-class stability rule).
 */

/** FNV-1a string hash → uint32. */
export function hashKey(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — a tiny deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** #863: the sample-call counter — the perf canary for the "a pure per-seed quantity is derived ONCE per
 *  (construction, seed)" law. A test asserts a figure's resolve costs O(distinct keys) calls, never O(iterations). */
export const sampleStats = {
  calls: 0,
  /** the subset keyed `solid-…` — a solid's seeded dims, the member of the class the pivot's residual loop re-derived. */
  solidCalls: 0,
};

/**
 * #2894 part 2 B ([ADR-3D-497](../../docs/06b-decisions-3d.md#adr-3d-497)) — A LETTER IS A NAME, NOT A CONFIGURATION.
 *
 * Every key above is spelled with the letters of the points it samples (`solid-polygon3-ABC`, `t-E-A-B`, `free3-x-P`,
 * …), so a rename or a swap, which rewrites every letter of the facts, keyed every sample anew and the drawing jumped
 * to another configuration. A renamed figure carries the names its points were FIRST given
 * (`Construction3.sampleNames`), and while it is solved every key is read with those names: each label token of the key
 * (the label grammar and boundaries of the rename itself, `relabelTokens3`) is replaced by its sampling name, all at
 * once. The rename rewrote exactly those tokens, so the key is the one the figure had before it, and so is the sample.
 *
 * The scope is a stack, entered by every solve of a construction (`resolve3`) and by a lazy value computed later
 * (`lazy3`); a construction with no `sampleNames` enters an empty scope, so a figure that was never renamed keys
 * exactly as it always did.
 */
export type SampleNames3 = Readonly<Record<string, string>>;
/** A label token of a key, with the rename's boundaries (`relabelTokens3`, store/rename3.ts). */
const KEY_LABEL3 = /(?<![a-z0-9'])[A-Z]\d*'?(?![a-z0-9'])/g;
interface NameScope3 {
  names: SampleNames3;
  keys: Map<string, string>;
}
const nameScopes3: (NameScope3 | null)[] = [];
let nameScope3: NameScope3 | null = null;
const scopeOf3 = new WeakMap<SampleNames3, NameScope3>();

/** The key with every renamed letter read as its sampling name (no scope, or no renamed letter in it: the key). */
export function sampleKey3(key: string, names: SampleNames3 | undefined): string {
  if (!names) return key;
  return key.replace(KEY_LABEL3, (t) => names[t] ?? t);
}

/** Run `f` with the figure's sampling names in force (`undefined`: none, the key as spelled). */
export function withSampleNames3<T>(names: SampleNames3 | undefined, f: () => T): T {
  let scope: NameScope3 | null = null;
  if (names) {
    scope = scopeOf3.get(names) ?? null;
    if (!scope) scopeOf3.set(names, (scope = { names, keys: new Map() }));
  }
  nameScopes3.push(nameScope3);
  nameScope3 = scope;
  try {
    return f();
  } finally {
    nameScope3 = nameScopes3.pop() ?? null;
  }
}

/**
 * An ORDER a letter decides is decided by the first name too: the comparator of plain string order (`.sort()`'s), over
 * the names in force. Where the pivot orders a figure's points by name to choose among its configurations
 * (`intrinsicShape3`), a rename that moved a letter past another chose another configuration.
 */
export function bySampleName3(a: string, b: string): number {
  const x = nameScope3 ? sampleKey3(a, nameScope3.names) : a;
  const y = nameScope3 ? sampleKey3(b, nameScope3.names) : b;
  return x < y ? -1 : x > y ? 1 : 0;
}

/** The sampling names in force now (what a lazy value created here is computed under). */
export const currentSampleNames3 = (): SampleNames3 | undefined => nameScope3?.names;

/** One stable sample in [min,max), keyed by (seed, key) — the key read with the sampling names in force. */
export function sample(seed: number, keyIn: string, min: number, max: number): number {
  sampleStats.calls++;
  let key = keyIn;
  if (nameScope3) {
    const hit = nameScope3.keys.get(keyIn);
    if (hit !== undefined) key = hit;
    else nameScope3.keys.set(keyIn, (key = sampleKey3(keyIn, nameScope3.names)));
  }
  if (key.startsWith('solid-')) sampleStats.solidCalls++;
  const r = mulberry32(hashKey(key) ^ Math.imul(seed + 1, 0x9e3779b1))();
  return min + r * (max - min);
}
