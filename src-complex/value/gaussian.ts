/**
 * #1481 (ADR-CX-057) — THE EXACT NORMAL FORM OF A GAUSSIAN-RATIONAL DIRECTION.
 *
 * A typed `a+bi` with rational parts used to get an atom of its own, named after the pair
 * (`∠(2+3i)`), with nothing recording how two such atoms relate. But `arg(−2+3i) = ½ − arg(2+3i)`,
 * `arg(4+6i) = arg(2+3i)`, `arg(−5+12i) = 2·arg(2+3i)` — and the tier-1 decision, which reads any
 * surviving atom as "not a whole number of turns", then refused every true product, quotient, power,
 * conjugate, rotation and rescale of typed literals as a contradiction.
 *
 * The root fix is a better-chosen basis for the argument space ADR-CX-006 already defines. Factor
 * the Gaussian integer in ℤ[i]:
 *
 *   `a+bi = u · (1+i)^m · Π πₚ^{eₚ} · π̄ₚ^{ēₚ} · (real inert part)`
 *
 * so `arg(a+bi) = k/4 + m/8 + Σ (eₚ − ēₚ)·∠πₚ`, with `πₚ = x+yi` the CANONICAL prime above
 * `p ≡ 1 (mod 4)` (`x > y > 0`). The atoms `∠πₚ` are ℚ-linearly independent modulo rational turns
 * (unique factorisation: `πₚ` and `π̄ₚ` are not associates), so over them "carries an atom" really
 * does mean "not a whole number of turns" — the tier-1 test becomes a theorem.
 *
 * Bounded integer arithmetic, no CAS: the norm is factored by trial division and a norm past
 * {@link NORM_BUDGET} answers null (the caller keeps an opaque atom, and the three-valued decision
 * `zeroness` treats it honestly).
 */

import { type Angle, registerCertifiedAtom } from './angle';
import { type Rat, frac, rat } from './rational';

/** The largest norm (after clearing denominators and the common factor) this layer factors. */
export const NORM_BUDGET = 10n ** 12n;

/** One atom a literal's direction carries, with the degrees it stands for (for the caller's sample). */
export interface AtomBinding {
  readonly atom: string;
  readonly degrees: number;
}

export interface GaussianDirection {
  readonly arg: Angle;
  readonly bindings: readonly AtomBinding[];
}

const abs = (x: bigint): bigint => (x < 0n ? -x : x);
const gcd = (a: bigint, b: bigint): bigint => {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};

/** Prime factorisation of `n ≤ NORM_BUDGET` by trial division (Number arithmetic is exact here). */
function factor(nBig: bigint): Map<number, number> {
  let n = Number(nBig);
  const out = new Map<number, number>();
  const take = (p: number) => {
    while (n % p === 0) {
      out.set(p, (out.get(p) ?? 0) + 1);
      n /= p;
    }
  };
  take(2);
  for (let p = 3; p * p <= n; p += 2) take(p);
  if (n > 1) out.set(n, (out.get(n) ?? 0) + 1);
  return out;
}

const PRIME_CACHE = new Map<number, { x: bigint; y: bigint }>();

/** The canonical Gaussian prime above `p ≡ 1 (mod 4)`: `x > y > 0` with `x² + y² = p`. */
export function canonicalPrime(p: number): { x: bigint; y: bigint } {
  const hit = PRIME_CACHE.get(p);
  if (hit) return hit;
  for (let y = 1; 2 * y * y < p; y++) {
    const r = p - y * y;
    const x = Math.round(Math.sqrt(r));
    if (x * x === r && x > y) {
      const out = { x: BigInt(x), y: BigInt(y) };
      PRIME_CACHE.set(p, out);
      return out;
    }
  }
  throw new Error(`canonicalPrime: ${p} is not a prime ≡ 1 (mod 4)`);
}

interface Gi {
  a: bigint;
  b: bigint;
}

/** `z / w` when it is a Gaussian integer, else null. */
function divExact(z: Gi, w: Gi): Gi | null {
  const n = w.a * w.a + w.b * w.b;
  // z · w̄
  const re = z.a * w.a + z.b * w.b;
  const im = z.b * w.a - z.a * w.b;
  if (re % n !== 0n || im % n !== 0n) return null;
  return { a: re / n, b: im / n };
}

/**
 * The exact direction of `re + im·i` in the certified basis, or null when the pair is zero or its
 * norm is past the budget. The returned angle's turns are reduced to [0, 1).
 */
export function gaussianDirection(re: Rat, im: Rat): GaussianDirection | null {
  if (re.n === 0n && im.n === 0n) return null;
  // a positive real scale does not move a direction: clear denominators, then the common factor
  const L = (re.d / gcd(re.d, im.d)) * im.d;
  let a = re.n * (L / re.d);
  let b = im.n * (L / im.d);
  const g = gcd(a, b);
  a /= g;
  b /= g;
  const norm = a * a + b * b;
  if (norm > NORM_BUDGET) return null;

  let z: Gi = { a, b };
  let eighths = 0n;
  const atoms = new Map<string, Rat>();
  const bindings: AtomBinding[] = [];

  for (const [p, e] of factor(norm)) {
    if (p === 2) {
      // (1+i) is ⅛ turn; 2 = −i(1+i)², so every factor 2 of the norm is one (1+i)
      for (let i = 0; i < e; i++) {
        z = divExact(z, { a: 1n, b: 1n })!;
        eighths += 1n;
      }
    } else if (p % 4 === 3) {
      // inert: a real factor, no direction (unreachable after the gcd, handled for completeness)
      const P = BigInt(p);
      for (let i = 0; i < e / 2; i++) z = { a: z.a / P, b: z.b / P };
    } else {
      const { x, y } = canonicalPrime(p);
      let up = 0;
      let down = 0;
      for (let q = divExact(z, { a: x, b: y }); q; q = divExact(z, { a: x, b: y })) {
        z = q;
        up++;
      }
      for (let q = divExact(z, { a: x, b: -y }); q; q = divExact(z, { a: x, b: -y })) {
        z = q;
        down++;
      }
      if (up !== down) {
        const name = registerCertifiedAtom(x, y);
        atoms.set(name, rat(up - down));
        bindings.push({ atom: name, degrees: (Math.atan2(Number(y), Number(x)) * 180) / Math.PI });
      }
    }
  }

  // what remains is a unit iᵏ
  const quarter = z.a === 1n ? 0n : z.b === 1n ? 1n : z.a === -1n ? 2n : 3n;
  const turns = frac(rat(quarter * 2n + eighths, 8n));
  return { arg: { turns, atoms }, bindings };
}
