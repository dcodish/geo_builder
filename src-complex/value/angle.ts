/**
 * An argument as a rational number of TURNS plus symbolic angle atoms — the exact carrier for
 * `arg z` ([ADR-CX-006](../../docs/06d-decisions-complex.md#adr-cx-006)).
 *
 * `arg z = turns + Σ coefficient · atom`, all coefficients rational, one turn = 360° = 2π.
 *
 * Turns rather than degrees or radians because the questions are ABOUT periodicity: "is `w^(4n)` real
 * for every natural n", "what is the smallest n with `wⁿ` pure imaginary". In turns those are integer
 * congruences and are DECIDED ({@link isReal}, {@link smallestPower}); in floats they can only be
 * sampled, and sampling cannot answer a "for every n" question at all. Four of eleven sampled exams
 * ask one of these.
 *
 * The atoms exist because [ADR-CX-002](../../docs/06d-decisions-complex.md#adr-cx-002) found the case
 * that a rational-π-only representation silently fails: the §2b exemplar pins θ = arctan(1/2), which is
 * not a rational multiple of π, yet the five fifth-roots must stay exactly 72° apart. So the BASE may
 * be an opaque atom while the OFFSETS stay exact — `{turns: 1/5, atoms: {θ₀: 1}}` is θ₀ + 72°, and the
 * spacing survives even though θ₀ itself is only ever numeric.
 *
 * `turns` is deliberately NOT reduced modulo 1 on construction: `z^5` genuinely winds five times, and
 * the winding count is what {@link smallestPower} solves over. Reduce with {@link normalize} at the
 * boundary where a direction (not a winding) is wanted.
 */

import {
  type Rat,
  ONE,
  ZERO,
  add as ratAdd,
  eq as ratEq,
  frac,
  isInt,
  isZero,
  mul as ratMul,
  rat,
  sub as ratSub,
  toNumber,
  format as fmtRat,
} from './rational';

export interface Angle {
  /** full turns; 1 = 360° */
  readonly turns: Rat;
  /** symbolic angle atoms → rational coefficients. Never carries a zero coefficient. */
  readonly atoms: ReadonlyMap<string, Rat>;
}

const clean = (m: Map<string, Rat>): Map<string, Rat> => {
  for (const [k, v] of [...m]) if (isZero(v)) m.delete(k);
  return m;
};

export const zero = (): Angle => ({ turns: ZERO, atoms: new Map() });
export const fromTurns = (t: Rat): Angle => ({ turns: t, atoms: new Map() });
export const fromDegrees = (deg: Rat): Angle => fromTurns(ratMul(deg, rat(1, 360)));
/** `k` half-turns of π: `fromPi(rat(3,4))` is 3π/4 = 135°. */
export const fromPi = (k: Rat): Angle => fromTurns(ratMul(k, rat(1, 2)));
export const fromAtom = (name: string): Angle => ({ turns: ZERO, atoms: new Map([[name, ONE]]) });

export const isExactRational = (a: Angle): boolean => a.atoms.size === 0;
export const atomsOf = (a: Angle): string[] => [...a.atoms.keys()].sort();

export function add(a: Angle, b: Angle): Angle {
  const atoms = new Map(a.atoms);
  for (const [k, v] of b.atoms) atoms.set(k, ratAdd(atoms.get(k) ?? ZERO, v));
  return { turns: ratAdd(a.turns, b.turns), atoms: clean(atoms) };
}

export function sub(a: Angle, b: Angle): Angle {
  const atoms = new Map(a.atoms);
  for (const [k, v] of b.atoms) atoms.set(k, ratSub(atoms.get(k) ?? ZERO, v));
  return { turns: ratSub(a.turns, b.turns), atoms: clean(atoms) };
}

/** `z^k` scales the whole argument — and so does the n-th root, with k = 1/n. */
export function scale(a: Angle, k: Rat): Angle {
  const atoms = new Map<string, Rat>();
  for (const [name, c] of a.atoms) atoms.set(name, ratMul(c, k));
  return { turns: ratMul(a.turns, k), atoms: clean(atoms) };
}

/** Conjugation and negation are both reflections of the argument — the reason they stay linear. */
export const neg = (a: Angle): Angle => scale(a, rat(-1));

/** Fold the winding away: the same direction, with turns in [0, 1). */
export const normalize = (a: Angle): Angle => ({ turns: frac(a.turns), atoms: a.atoms });

/**
 * Provable equality AS A DIRECTION: same atoms, and turns differing by a whole number.
 *
 * Conservative on purpose — two angles whose atoms differ may still be numerically equal at some
 * sample, but nothing in the givens FORCES that, so calling them equal would assert a coincidence of
 * the current drawing as knowledge (the ADR-052 sin).
 */
export function sameDirection(a: Angle, b: Angle): boolean {
  if (a.atoms.size !== b.atoms.size) return false;
  for (const [k, v] of a.atoms) {
    const o = b.atoms.get(k);
    if (!o || !ratEq(v, o)) return false;
  }
  return isInt(ratSub(a.turns, b.turns));
}

/** `arg z ≡ 0 (mod ½ turn)` — the number is real. Decided, never sampled. */
export const isReal = (a: Angle): boolean => isExactRational(a) && isInt(ratMul(a.turns, rat(2)));

/** `arg z ≡ ¼ (mod ½ turn)` — the number is pure imaginary. Decided, never sampled. */
export const isImaginary = (a: Angle): boolean =>
  isExactRational(a) && isInt(ratSub(ratMul(a.turns, rat(2)), rat(1, 2)));

/**
 * The period of `n ↦ n·a` in n: the smallest q ≥ 1 with `q·a ≡ 0 (mod 1 turn)`, i.e. the denominator
 * of the reduced turns. Null when the angle carries an atom, because then no finite power need return.
 *
 * This is what makes a power CYCLE plottable (`ValueCycle` in the scene layer) and what turns
 * «z^(6n) takes only two values» from a claim into a computation.
 */
export function period(a: Angle): bigint | null {
  if (!isExactRational(a)) return null;
  return a.turns.d;
}

const egcd = (a: bigint, b: bigint): { g: bigint; x: bigint; y: bigint } => {
  if (b === 0n) return { g: a, x: 1n, y: 0n };
  const { g, x, y } = egcd(b, a % b);
  return { g, x: y, y: x - (a / b) * y };
};

/**
 * The smallest positive integer n with `A·n ≡ B (mod M)`, or null when no solution exists.
 * Exposed because "the minimal n such that …" is a whole corpus archetype, and it is a congruence.
 */
export function smallestSolution(A: bigint, B: bigint, M: bigint): bigint | null {
  if (M <= 0n) return null;
  const a = ((A % M) + M) % M;
  const b = ((B % M) + M) % M;
  if (a === 0n) return b === 0n ? 1n : null;
  const { g, x } = egcd(a, M);
  if (b % g !== 0n) return null;
  const m = M / g;
  let n = (((x * (b / g)) % m) + m) % m;
  if (n === 0n) n = m;
  return n;
}

/**
 * The smallest natural n for which `n · step` lands on `target` modulo one turn — "the minimal n with
 * wⁿ pure imaginary" once the caller has picked which target the predicate means.
 *
 * Returns null when the step carries an atom (undecidable exactly, and the honest answer is to say so
 * rather than to sample and guess).
 */
export function smallestPower(step: Angle, target: Rat): bigint | null {
  if (!isExactRational(step)) return null;
  // n·(p/q) ≡ c/d (mod 1)  ⟺  n·p·d ≡ c·q (mod q·d)
  const p = step.turns.n;
  const q = step.turns.d;
  const c = target.n;
  const d = target.d;
  return smallestSolution(p * d, c * q, q * d);
}

/** Numeric degrees at a sample of the atom values (atoms are given in DEGREES). */
export function toDegrees(a: Angle, sample: ReadonlyMap<string, number> = new Map()): number | null {
  let deg = toNumber(a.turns) * 360;
  for (const [name, c] of a.atoms) {
    const v = sample.get(name);
    if (v === undefined) return null;
    deg += toNumber(c) * v;
  }
  return deg;
}

export const toRadians = (a: Angle, sample?: ReadonlyMap<string, number>): number | null => {
  const d = toDegrees(a, sample);
  return d === null ? null : (d * Math.PI) / 180;
};

/**
 * Student-facing text in DEGREES, the register the exam uses (`cis 45°`): `45°`, `θ₀ + 72°`, `-90°`.
 * The turns part is folded to [0, 360) only when there is nothing symbolic to keep it distinct from.
 */
export function format(a: Angle): string {
  const deg = ratMul(isExactRational(a) ? frac(a.turns) : a.turns, rat(360));
  const parts: string[] = [];
  for (const name of atomsOf(a)) {
    const c = a.atoms.get(name)!;
    parts.push(ratEq(c, ONE) ? name : ratEq(c, rat(-1)) ? `-${name}` : `${fmtRat(c)}·${name}`);
  }
  if (!isZero(deg) || parts.length === 0) parts.push(`${fmtRat(deg)}°`);
  return parts.join(' + ').replace(/\+ -/g, '- ');
}

/** Radian text as a multiple of π — `3π/4`, `π`, `-π/2`. Used where the exam states radians. */
export function formatPi(a: Angle): string | null {
  if (!isExactRational(a)) return null;
  const k = ratMul(a.turns, rat(2)); // in units of π
  if (isZero(k)) return '0';
  const sign = k.n < 0n ? '-' : '';
  const n = k.n < 0n ? -k.n : k.n;
  const num = n === 1n ? 'π' : `${n}π`;
  return k.d === 1n ? `${sign}${num}` : `${sign}${num}/${k.d}`;
}
