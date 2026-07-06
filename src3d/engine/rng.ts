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

/** One stable sample in [min,max), keyed by (seed, key). */
export function sample(seed: number, key: string, min: number, max: number): number {
  const r = mulberry32(hashKey(key) ^ Math.imul(seed + 1, 0x9e3779b1))();
  return min + r * (max - min);
}
